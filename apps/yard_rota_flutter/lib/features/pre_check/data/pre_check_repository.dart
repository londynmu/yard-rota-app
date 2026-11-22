import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/local_db/app_local_database.dart';
import '../../../core/network/network_policy.dart';
import '../../../core/network/precheck_image_urls.dart';
import '../domain/pre_check_models.dart';

bool isLikelyNetworkError(Object error) {
  if (error is SocketException) return true;
  if (error is TimeoutException) return true;
  if (error is TransientNetworkException) return true;
  final message = error.toString().toLowerCase();
  return message.contains('socket') ||
      message.contains('network') ||
      message.contains('timeout') ||
      message.contains('failed host lookup') ||
      message.contains('connection refused') ||
      message.contains('connection reset') ||
      message.contains('clientexception') ||
      message.contains('failed to fetch');
}

class PreCheckRepository {
  PreCheckRepository({
    required SupabaseClient supabaseClient,
    required AppLocalDatabase localDb,
  }) : _client = supabaseClient,
       _localDb = localDb;

  final SupabaseClient _client;
  final AppLocalDatabase _localDb;
  bool _syncInProgress = false;

  static const int clientSchemaVersion = 3;
  static const String draftKey = 'precheck_active_draft';

  Future<PreCheckInitialData> loadInitial({
    required String userId,
    DateTime? now,
  }) async {
    final instant = now ?? DateTime.now();
    final today = preCheckDateToYmd(instant);
    final yesterday = preCheckDateToYmd(
      instant.subtract(const Duration(days: 1)),
    );

    final shifts = await _fetchUserShifts(
      userId: userId,
      dates: <String>[today, yesterday],
    );
    final shiftWindow = getPreCheckShiftWindow(shifts, now: instant);
    String? userLocationId;
    if (shifts.isNotEmpty && (shifts.first.location?.isNotEmpty ?? false)) {
      userLocationId = await _locationIdForName(shifts.first.location!);
    }

    final shiftChecks = await _fetchShiftChecks(
      userId: userId,
      window: shiftWindow,
      now: instant,
    );
    final fallbackWindow =
        shiftWindow ?? getPreCheckFallbackWindow(shiftChecks);
    final visibleChecks =
        fallbackWindow != null && !instant.isAfter(fallbackWindow.end)
        ? shiftChecks
        : const <PreCheckSubmissionSummary>[];

    return PreCheckInitialData(
      userLocationId: userLocationId,
      shiftChecks: visibleChecks,
      duringShiftDamageEnabled: await _isSettingEnabled(
        'during_shift_damage_report_enabled',
      ),
      queueStatus: await queueStatus(),
    );
  }

  Future<List<PreCheckTug>> fetchActiveTugs() async {
    final rows = await _client
        .from('tugs')
        .select('id,tug_number,display_name,location_id,locations(id,name)')
        .eq('status', 'active')
        .order('tug_number');
    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final location = row['locations'];
          final locMap = location is Map<String, dynamic> ? location : null;
          return PreCheckTug(
            id: row['id']?.toString() ?? '',
            tugNumber: row['tug_number']?.toString() ?? '',
            displayName: row['display_name'] as String?,
            locationId: row['location_id']?.toString(),
            locationName: locMap?['name'] as String?,
          );
        })
        .where((tug) => tug.id.isNotEmpty && tug.tugNumber.isNotEmpty)
        .toList(growable: false);
  }

  Future<PreCheckTug?> fetchTugByQrToken(String token) async {
    final row = await _client
        .from('tugs')
        .select('id,tug_number,display_name,location_id,locations(id,name)')
        .eq('qr_token', token)
        .eq('status', 'active')
        .maybeSingle();
    if (row == null) {
      return null;
    }
    final location = row['locations'];
    final locMap = location is Map<String, dynamic> ? location : null;
    return PreCheckTug(
      id: row['id']?.toString() ?? '',
      tugNumber: row['tug_number']?.toString() ?? '',
      displayName: row['display_name'] as String?,
      locationId: row['location_id']?.toString(),
      locationName: locMap?['name'] as String?,
    );
  }

  /// PWA TugCheckHistory: last 30 days of checks for a tug (who / when / type).
  Future<List<PreCheckTugHistoryEntry>> fetchTugCheckHistory(
    String tugId,
  ) async {
    if (tugId.isEmpty) {
      return const <PreCheckTugHistoryEntry>[];
    }
    final thirtyDaysAgo = DateTime.now().toUtc().subtract(
      const Duration(days: 30),
    );
    final results = await Future.wait<dynamic>([
      _client
          .from('precheck_submissions')
          .select('''
            id,
            check_time,
            created_at,
            check_type,
            profiles:user_id(first_name, last_name),
            precheck_items(id, status, item_name, notes),
            precheck_damages(id, item_id, item_key, description, image_urls, source)
          ''')
          .eq('tug_id', tugId)
          .gte('check_time', thirtyDaysAgo.toIso8601String())
          .order('check_time', ascending: false),
      _client
          .from('precheck_check_items')
          .select('item_key, label')
          .eq('is_active', true),
      // Later checks often re-flag body_damage without new damage rows.
      // Load open tug damages (with photos) to fill those history problems.
      _client
          .from('precheck_damages')
          .select('''
            id,
            item_id,
            item_key,
            description,
            image_urls,
            source,
            repair_status,
            last_reported_at,
            created_at,
            precheck_items(item_name)
          ''')
          .eq('tug_id', tugId)
          .neq('repair_status', 'resolved')
          .order('last_reported_at', ascending: false),
    ]);

    final labelRows = (results[1] as List<dynamic>)
        .whereType<Map<String, dynamic>>();
    final labels = <String, String>{
      for (final row in labelRows)
        if ((row['item_key']?.toString() ?? '').isNotEmpty)
          row['item_key'].toString(): row['label']?.toString() ?? '',
    };

    final openPhotosByItemKey = _openDamagePhotosByItemKey(
      (results[2] as List<dynamic>).whereType<Map<String, dynamic>>(),
    );

    final checkRows = (results[0] as List<dynamic>)
        .whereType<Map<String, dynamic>>();
    return checkRows
        .map(
          (row) => _mapTugHistoryEntry(
            row,
            labels,
            openPhotosByItemKey: openPhotosByItemKey,
          ),
        )
        .where((entry) => entry.id.isNotEmpty)
        .toList(growable: false);
  }

  /// Latest non-resolved damage photos keyed by checklist item (body_damage…).
  Map<String, ({String description, List<String> imageUrls})>
  _openDamagePhotosByItemKey(Iterable<Map<String, dynamic>> rows) {
    final out = <String, ({String description, List<String> imageUrls})>{};
    for (final row in rows) {
      final itemJoin = row['precheck_items'];
      final itemMap = itemJoin is Map<String, dynamic> ? itemJoin : null;
      final itemKey =
          (row['item_key']?.toString() ?? itemMap?['item_name']?.toString() ?? '')
              .trim();
      if (itemKey.isEmpty) continue;
      final urls = _parseImageUrls(row['image_urls']);
      if (urls.isEmpty) continue;
      // Rows are newest-first; keep the first photo set per key.
      out.putIfAbsent(
        itemKey,
        () => (
          description: row['description']?.toString() ?? '',
          imageUrls: urls,
        ),
      );
    }
    return out;
  }

  PreCheckTugHistoryEntry _mapTugHistoryEntry(
    Map<String, dynamic> row,
    Map<String, String> labels, {
    Map<String, ({String description, List<String> imageUrls})>
        openPhotosByItemKey =
        const {},
  }) {
    final profile = row['profiles'];
    final profileMap = profile is Map<String, dynamic> ? profile : null;
    final first = profileMap?['first_name']?.toString().trim() ?? '';
    final last = profileMap?['last_name']?.toString().trim() ?? '';
    final checker = '$first $last'.trim();
    final checkTypeRaw = row['check_type']?.toString() ?? '';
    final checkType = checkTypeRaw == PreCheckType.duringShift.dbValue
        ? PreCheckType.duringShift
        : PreCheckType.preShift;
    final checkTimeRaw =
        row['check_time']?.toString() ?? row['created_at']?.toString();
    final checkTime =
        DateTime.tryParse(checkTimeRaw ?? '')?.toLocal() ?? DateTime.now();

    return PreCheckTugHistoryEntry(
      id: row['id']?.toString() ?? '',
      checkTime: checkTime,
      checkType: checkType,
      checkerName: checker.isEmpty ? 'Unknown user' : checker,
      problems: _mergeHistoryProblems(
        row,
        labels,
        openPhotosByItemKey: openPhotosByItemKey,
      ),
    );
  }

  List<PreCheckTugHistoryProblem> _mergeHistoryProblems(
    Map<String, dynamic> row,
    Map<String, String> labels, {
    Map<String, ({String description, List<String> imageUrls})>
        openPhotosByItemKey =
        const {},
  }) {
    final items = (row['precheck_items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where((item) => item['status']?.toString() == 'repair_needed')
        .toList();
    final damages = _uniqueHistoryDamages(
      (row['precheck_damages'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList(),
    );
    final usedDamageIds = <String>{};

    String normalize(String? value) => (value ?? '').trim().toLowerCase();

    List<Map<String, dynamic>> damagesForItem(Map<String, dynamic> item) {
      final itemId = item['id']?.toString() ?? '';
      final itemKey = item['item_name']?.toString() ?? '';
      final note = normalize(item['notes']?.toString());
      final matched = <Map<String, dynamic>>[];
      for (final damage in damages) {
        final id = damage['id']?.toString() ?? '';
        if (usedDamageIds.contains(id)) continue;
        final byItemId =
            itemId.isNotEmpty && damage['item_id']?.toString() == itemId;
        final byItemKey =
            itemKey.isNotEmpty && damage['item_key']?.toString() == itemKey;
        final byNote =
            note.isNotEmpty &&
            normalize(damage['description']?.toString()) == note;
        if (byItemId || byItemKey || byNote) {
          matched.add(damage);
        }
      }
      return matched;
    }

    String formatItemName(String? raw) {
      final key = raw ?? '';
      final labeled = labels[key];
      if (labeled != null && labeled.isNotEmpty) return labeled;
      return key
          .replaceAll('_', ' ')
          .split(' ')
          .where((part) => part.isNotEmpty)
          .map(
            (part) =>
                '${part[0].toUpperCase()}${part.length > 1 ? part.substring(1) : ''}',
          )
          .join(' ');
    }

    final fromItems = <PreCheckTugHistoryProblem>[];
    for (final item in items) {
      final itemKey = item['item_name']?.toString() ?? '';
      final matchedDamages = damagesForItem(item);
      for (final damage in matchedDamages) {
        usedDamageIds.add(damage['id']?.toString() ?? '');
      }
      var urls = <String>[
        for (final damage in matchedDamages)
          ..._parseImageUrls(damage['image_urls']),
      ];
      var description = matchedDamages.isNotEmpty
          ? matchedDamages
                .map((d) => d['description']?.toString() ?? '')
                .where((d) => d.trim().isNotEmpty)
                .join('\n')
          : item['notes']?.toString() ?? '';

      // Fallback: same item still open on the tug with photos (common for
      // body_damage re-confirmed on later shifts without new uploads).
      if (urls.isEmpty && itemKey.isNotEmpty) {
        final open = openPhotosByItemKey[itemKey];
        if (open != null) {
          urls = open.imageUrls;
          if (description.trim().isEmpty) {
            description = open.description;
          }
        }
      }

      fromItems.add(
        PreCheckTugHistoryProblem(
          key: 'item-${item['id']}',
          itemName: formatItemName(itemKey),
          itemKey: itemKey,
          description: description,
          imageUrls: urls,
        ),
      );
    }

    final unmatched = damages
        .where((damage) {
          final id = damage['id']?.toString() ?? '';
          if (usedDamageIds.contains(id)) return false;
          final source = damage['source']?.toString() ?? 'check_item';
          return source != 'remarks';
        })
        .map((damage) {
          final itemKey = damage['item_key']?.toString() ?? '';
          return PreCheckTugHistoryProblem(
            key: 'damage-${damage['id']}',
            itemName: itemKey.isEmpty
                ? 'Damage report'
                : formatItemName(itemKey),
            itemKey: itemKey,
            description: damage['description']?.toString() ?? '',
            imageUrls: _parseImageUrls(damage['image_urls']),
          );
        });

    return [...fromItems, ...unmatched];
  }

  List<String> _parseImageUrls(dynamic raw) {
    if (raw is! List) {
      return const <String>[];
    }
    return raw
        .map((entry) => entry?.toString().trim() ?? '')
        .where((url) => url.isNotEmpty)
        .toList(growable: false);
  }

  List<Map<String, dynamic>> _uniqueHistoryDamages(
    List<Map<String, dynamic>> damages,
  ) {
    final seen = <String>{};
    final out = <Map<String, dynamic>>[];
    for (final damage in damages) {
      final urls = _parseImageUrls(damage['image_urls']).join('|');
      final key = [
        (damage['item_id']?.toString() ?? '').trim().toLowerCase(),
        (damage['description']?.toString() ?? '').trim().toLowerCase(),
        urls.trim().toLowerCase(),
      ].join('|');
      if (seen.contains(key)) continue;
      seen.add(key);
      out.add(damage);
    }
    return out;
  }

  Future<List<PreCheckItemDefinition>> fetchCheckItems() async {
    try {
      final rows = await _client
          .from('precheck_check_items')
          .select('item_key,label,tooltip,category,allow_na')
          .eq('is_active', true)
          .order('sort_order');
      final items = rows
          .whereType<Map<String, dynamic>>()
          .map(
            (row) => PreCheckItemDefinition(
              key: row['item_key']?.toString() ?? '',
              label: row['label']?.toString() ?? '',
              tooltip: row['tooltip'] as String?,
              category: row['category']?.toString() ?? 'outside',
              allowNa: row['allow_na'] == true,
            ),
          )
          .where((item) => item.key.isNotEmpty && item.label.isNotEmpty)
          .toList(growable: false);
      if (items.isNotEmpty) {
        return items;
      }
    } catch (_) {
      // Fallback below mirrors the PWA hardcoded list.
    }
    return _fallbackItems;
  }

  Future<Map<String, List<PreCheckKnownDefect>>> fetchKnownDefects(
    String tugId,
  ) async {
    if (tugId.isEmpty) {
      return const <String, List<PreCheckKnownDefect>>{};
    }
    final rows = await _client
        .from('precheck_damages')
        .select('''
          id,
          description,
          image_urls,
          created_at,
          repair_status,
          precheck_submissions!inner(
            tug_id,
            check_date,
            check_time,
            profiles:user_id(first_name,last_name)
          ),
          precheck_items!inner(item_name)
        ''')
        .eq('precheck_submissions.tug_id', tugId)
        .neq('repair_status', 'resolved')
        .eq('source', 'check_item')
        .not('item_id', 'is', null)
        .order('created_at', ascending: false);

    final grouped = <String, List<PreCheckKnownDefect>>{};
    for (final row in rows.whereType<Map<String, dynamic>>()) {
      final itemJoin = row['precheck_items'];
      final itemMap = itemJoin is Map<String, dynamic> ? itemJoin : null;
      final itemKey = itemMap?['item_name']?.toString();
      if (itemKey == null || itemKey.isEmpty) {
        continue;
      }
      final submission = row['precheck_submissions'];
      final subMap = submission is Map<String, dynamic> ? submission : null;
      final profile = subMap?['profiles'];
      final profileMap = profile is Map<String, dynamic> ? profile : null;
      final reporter = [
        profileMap?['first_name'] as String?,
        profileMap?['last_name'] as String?,
      ].where((value) => value != null && value.trim().isNotEmpty).join(' ');
      final rawDate =
          subMap?['check_date']?.toString() ??
          subMap?['check_time']?.toString() ??
          row['created_at']?.toString();
      final parsedDate = rawDate == null ? null : DateTime.tryParse(rawDate);
      final imageUrls =
          ((row['image_urls'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<String>()
              .toList(growable: false);
      grouped
          .putIfAbsent(itemKey, () => <PreCheckKnownDefect>[])
          .add(
            PreCheckKnownDefect(
              id: row['id']?.toString() ?? '',
              itemKey: itemKey,
              description: row['description']?.toString() ?? '',
              reporterName: reporter.isEmpty ? 'Unknown' : reporter,
              dateLabel: parsedDate == null
                  ? ''
                  : '${parsedDate.day.toString().padLeft(2, '0')} ${_monthLabel(parsedDate.month)} ${parsedDate.year}',
              imageUrls: imageUrls,
              isAcknowledged: row['repair_status'] == 'acknowledged',
            ),
          );
    }
    return grouped;
  }

  Future<PreCheckSchemaStatus> schemaStatus() async {
    try {
      final rows = await _client
          .from('app_config')
          .select('key,value')
          .inFilter('key', <String>['precheck_schema_version']);
      String? serverVersion;
      for (final row in rows.whereType<Map<String, dynamic>>()) {
        if (row['key'] == 'precheck_schema_version') {
          serverVersion = row['value']?.toString();
        }
      }
      final server = int.tryParse(serverVersion ?? '');
      if (server == null) {
        return PreCheckSchemaStatus.error;
      }
      return server > clientSchemaVersion
          ? PreCheckSchemaStatus.mismatch
          : PreCheckSchemaStatus.ok;
    } catch (_) {
      return PreCheckSchemaStatus.error;
    }
  }

  Future<bool> remarksEnabled() {
    return _isSettingEnabled('pre_shift_remarks_enabled');
  }

  Future<PreCheckDraft?> readDraft() async {
    final raw = await _localDb.readPreCheckDraft(draftKey);
    if (raw == null) {
      return null;
    }
    try {
      return PreCheckDraft.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> writeDraft(PreCheckDraft draft) {
    return _localDb.writePreCheckDraft(
      draftKey: draftKey,
      payloadJson: jsonEncode(draft.toJson()),
    );
  }

  Future<void> clearDraft() {
    return _localDb.clearPreCheckDraft(draftKey);
  }

  Future<PreCheckQueueStatus> queueStatus() async {
    final status = await _localDb.readPreCheckQueueStatus();
    return PreCheckQueueStatus(
      total: status.total,
      pending: status.pending,
      failed: status.failed,
    );
  }

  Future<PreCheckSubmissionSummary> submitPreShift({
    required String userId,
    required PreCheckTug tug,
    required List<PreCheckItemDefinition> items,
    required Map<String, List<PreCheckKnownDefect>> defectsByItem,
    required PreCheckDraft draft,
    required bool remarksEnabled,
  }) async {
    final payload = _buildPreShiftPayload(
      userId: userId,
      tug: tug,
      items: items,
      defectsByItem: defectsByItem,
      draft: draft,
      remarksEnabled: remarksEnabled,
    );
    try {
      final submission = await _submitPreShiftPayload(payload);
      await _recordFixedConfirmations(
        draft.markedResolvedDamageIds,
        submissionId: submission.id,
      );
      await clearDraft();
      return submission;
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        rethrow;
      }
      await _localDb.enqueuePreCheckJob(
        jobKey: draft.formSessionId,
        opType: PreCheckType.preShift.dbValue,
        payloadJson: jsonEncode(payload),
      );
      await clearDraft();
      return PreCheckSubmissionSummary(
        id: draft.formSessionId,
        tugId: tug.id,
        tugNumber: tug.tugNumber,
        tugDisplayName: tug.displayName,
        checkTime: DateTime.now(),
        queued: true,
      );
    }
  }

  Future<PreCheckSubmissionSummary> submitDuringShift({
    required String userId,
    required PreCheckTug tug,
    required String description,
    required List<PreCheckPhoto> photos,
    String? formSessionId,
  }) async {
    final sessionId =
        formSessionId ?? '${tug.id}:${DateTime.now().millisecondsSinceEpoch}';
    final payload = <String, dynamic>{
      'userId': userId,
      'tugId': tug.id,
      'tugNumber': tug.tugNumber,
      'tugDisplayName': tug.displayName,
      'formSessionId': sessionId,
      'description': description.trim(),
      'images': photos.map((photo) => photo.toJson()).toList(),
    };
    try {
      return await _submitDuringShiftPayload(payload);
    } catch (error) {
      if (!isLikelyNetworkError(error)) {
        rethrow;
      }
      await _localDb.enqueuePreCheckJob(
        jobKey: sessionId,
        opType: PreCheckType.duringShift.dbValue,
        payloadJson: jsonEncode(payload),
      );
      return PreCheckSubmissionSummary(
        id: sessionId,
        tugId: tug.id,
        tugNumber: tug.tugNumber,
        tugDisplayName: tug.displayName,
        checkTime: DateTime.now(),
        queued: true,
      );
    }
  }

  Future<void> flushQueue() async {
    if (_syncInProgress) {
      return;
    }
    _syncInProgress = true;
    try {
      while (true) {
        final jobs = await _localDb.readPendingPreCheckJobs();
        if (jobs.isEmpty) {
          break;
        }
        for (final job in jobs) {
          try {
            final payload = jsonDecode(job.payloadJson) as Map<String, dynamic>;
            if (job.opType == PreCheckType.preShift.dbValue) {
              final submission = await _submitPreShiftPayload(payload);
              final ids =
                  ((payload['markedResolvedDamageIds'] as List<dynamic>?) ??
                          const <dynamic>[])
                      .whereType<String>()
                      .toList(growable: false);
              await _recordFixedConfirmations(ids, submissionId: submission.id);
            } else if (job.opType == PreCheckType.duringShift.dbValue) {
              await _submitDuringShiftPayload(payload);
            }
            await _localDb.markOutboxSynced(job.id);
          } catch (error) {
            final nextAttempt = job.attemptCount + 1;
            await _localDb.markOutboxRetry(
              id: job.id,
              attemptCount: nextAttempt,
              nextRetryAt:
                  DateTime.now().millisecondsSinceEpoch +
                  _computeBackoff(nextAttempt).inMilliseconds,
              lastError: error.toString(),
            );
          }
        }
      }
    } finally {
      _syncInProgress = false;
    }
  }

  Future<List<PreCheckShift>> _fetchUserShifts({
    required String userId,
    required List<String> dates,
  }) async {
    final rows = await _client
        .from('scheduled_rota')
        .select('location,start_time,end_time,shift_type,date')
        .eq('user_id', userId)
        .inFilter('date', dates)
        .order('date', ascending: false);
    return rows
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => PreCheckShift(
            dateYmd: row['date']?.toString() ?? '',
            startTime: row['start_time']?.toString() ?? '',
            endTime: row['end_time']?.toString() ?? '',
            location: row['location'] as String?,
            shiftType: row['shift_type'] as String?,
          ),
        )
        .where(
          (shift) =>
              shift.dateYmd.isNotEmpty &&
              shift.startTime.isNotEmpty &&
              shift.endTime.isNotEmpty,
        )
        .toList(growable: false);
  }

  Future<String?> _locationIdForName(String name) async {
    try {
      final row = await _client
          .from('locations')
          .select('id')
          .eq('name', name)
          .maybeSingle();
      return row?['id']?.toString();
    } catch (_) {
      return null;
    }
  }

  Future<List<PreCheckSubmissionSummary>> _fetchShiftChecks({
    required String userId,
    required PreCheckShiftWindow? window,
    required DateTime now,
  }) async {
    var query = _client
        .from('precheck_submissions')
        .select('id,tug_id,check_time,created_at,tugs(tug_number,display_name)')
        .eq('user_id', userId)
        .eq('check_type', PreCheckType.preShift.dbValue);
    if (window != null) {
      query = query
          .gte('check_time', window.start.toIso8601String())
          .lte('check_time', window.end.toIso8601String());
    } else {
      query = query.gte(
        'check_time',
        now.subtract(const Duration(hours: 12)).toIso8601String(),
      );
    }
    final rows = await query.order('check_time', ascending: false);
    return rows.whereType<Map<String, dynamic>>().map(_summaryFromRow).toList();
  }

  Future<bool> _isSettingEnabled(String key) async {
    try {
      final row = await _client
          .from('settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();
      return row == null || row['value']?.toString() != 'false';
    } catch (_) {
      return true;
    }
  }

  Map<String, dynamic> _buildPreShiftPayload({
    required String userId,
    required PreCheckTug tug,
    required List<PreCheckItemDefinition> items,
    required Map<String, List<PreCheckKnownDefect>> defectsByItem,
    required PreCheckDraft draft,
    required bool remarksEnabled,
  }) {
    return <String, dynamic>{
      'userId': userId,
      'tugId': tug.id,
      'tugNumber': tug.tugNumber,
      'tugDisplayName': tug.displayName,
      'checkType': PreCheckType.preShift.dbValue,
      'formSessionId': draft.formSessionId,
      'remarks': remarksEnabled ? draft.remarks.trim() : '',
      'remarksImages': remarksEnabled
          ? draft.remarksPhotos.map((photo) => photo.toJson()).toList()
          : <dynamic>[],
      'items': items.map((item) {
        final defects =
            defectsByItem[item.key] ?? const <PreCheckKnownDefect>[];
        final effectiveStatus = effectiveStatusForItem(
          item: item,
          draft: draft,
          defectsByItem: defectsByItem,
        );
        if (defects.length >= 2) {
          final actions = collectMultiDefectActions(
            item: item,
            draft: draft,
            defects: defects,
          );
          final newDefect = actions.newDefect;
          return <String, dynamic>{
            'key': item.key,
            'label': item.label,
            'status': effectiveStatus.dbValue,
            'notes': newDefect?.notes ?? '',
            'linkedDamageId': null,
            'images':
                newDefect?.photos.map((photo) => photo.toJson()).toList() ??
                const <dynamic>[],
            'sameProblemDamageIds': actions.sameProblemDamageIds,
            'newDefect': newDefect == null
                ? null
                : <String, dynamic>{
                    'notes': newDefect.notes,
                    'images': newDefect.photos
                        .map((photo) => photo.toJson())
                        .toList(),
                  },
          };
        }
        final state = draft.itemStates[item.key] ?? const PreCheckItemState();
        return <String, dynamic>{
          'key': item.key,
          'label': item.label,
          'status': effectiveStatus.dbValue,
          'notes': state.notes,
          'linkedDamageId': state.linkedDamageId,
          'images': state.photos.map((photo) => photo.toJson()).toList(),
        };
      }).toList(),
      'markedResolvedDamageIds': draft.markedResolvedDamageIds,
    };
  }

  Future<Map<String, String>> _ensureItemIdMap(
    String submissionId,
    List<Map<String, dynamic>> items,
  ) async {
    final existing = await _client
        .from('precheck_items')
        .select('id,item_name')
        .eq('submission_id', submissionId);
    final itemIdMap = <String, String>{};
    for (final row in existing.whereType<Map<String, dynamic>>()) {
      final key = row['item_name']?.toString();
      final id = row['id']?.toString();
      if (key != null && id != null) {
        itemIdMap[key] = id;
      }
    }
    final missing = items
        .where((item) => item['key'] != null && !itemIdMap.containsKey(item['key']))
        .toList(growable: false);
    if (missing.isEmpty) {
      return itemIdMap;
    }
    final insertedItems = await _client
        .from('precheck_items')
        .insert(
          missing
              .map(
                (item) => <String, dynamic>{
                  'submission_id': submissionId,
                  'item_category': 'check',
                  'item_name': item['key'],
                  'status': item['status'],
                  'notes': (item['notes'] as String?)?.trim().isEmpty ?? true
                      ? null
                      : item['notes'],
                },
              )
              .toList(),
        )
        .select('id,item_name');
    for (final row in insertedItems.whereType<Map<String, dynamic>>()) {
      final key = row['item_name']?.toString();
      final id = row['id']?.toString();
      if (key != null && id != null) {
        itemIdMap[key] = id;
      }
    }
    return itemIdMap;
  }

  List<String> _sameProblemIdsForItem(Map<String, dynamic> item) {
    final fromList =
        ((item['sameProblemDamageIds'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<String>()
            .where((id) => id.isNotEmpty)
            .toList(growable: false);
    if (fromList.isNotEmpty) {
      return fromList;
    }
    final linked = item['linkedDamageId'] as String?;
    if (linked != null && linked.isNotEmpty) {
      return <String>[linked];
    }
    return const <String>[];
  }

  Map<String, dynamic>? _newDefectForItem(Map<String, dynamic> item) {
    final nested = item['newDefect'];
    if (nested is Map<String, dynamic>) {
      final notes = nested['notes']?.toString().trim() ?? '';
      final images =
          ((nested['images'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .toList(growable: false);
      if (notes.isNotEmpty || images.isNotEmpty) {
        return <String, dynamic>{'notes': notes, 'images': images};
      }
    }
    final sameIds = _sameProblemIdsForItem(item);
    if (sameIds.isNotEmpty) {
      return null;
    }
    final notes = item['notes']?.toString().trim() ?? '';
    final images = ((item['images'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    if (notes.isEmpty && images.isEmpty) {
      return null;
    }
    return <String, dynamic>{'notes': notes, 'images': images};
  }

  Future<void> _completeExistingPreShift(
    String submissionId,
    Map<String, dynamic> payload,
  ) async {
    final items = ((payload['items'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final itemIdMap = await _ensureItemIdMap(submissionId, items);

    final remarks = payload['remarks']?.toString().trim() ?? '';
    final remarkImages =
        ((payload['remarksImages'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .toList(growable: false);
    if (remarks.isNotEmpty || remarkImages.isNotEmpty) {
      final existingRemarks = await _client
          .from('precheck_damages')
          .select('id')
          .eq('submission_id', submissionId)
          .eq('source', 'remarks')
          .limit(1);
      if (existingRemarks.isEmpty) {
        final urls = await _uploadPhotos(
          submissionId,
          remarkImages,
          userId: payload['userId']?.toString() ?? '',
        );
        await _client.from('precheck_damages').insert(<String, dynamic>{
          'submission_id': submissionId,
          'description': remarks.isEmpty ? 'Additional photos' : remarks,
          'severity': 'minor',
          'image_urls': urls,
          'source': 'remarks',
        });
      }
    }

    for (final item in items) {
      if (item['status'] != PreCheckItemStatus.repairNeeded.dbValue) {
        continue;
      }
      for (final damageId in _sameProblemIdsForItem(item)) {
        await _insertSameProblemConfirmation(
          damageId: damageId,
          userId: payload['userId']?.toString() ?? '',
          submissionId: submissionId,
          tugId: payload['tugId']?.toString() ?? '',
          itemKey: item['key']?.toString() ?? '',
        );
      }
      final newDefect = _newDefectForItem(item);
      if (newDefect == null) {
        continue;
      }
      final itemId = itemIdMap[item['key']?.toString()];
      if (itemId != null) {
        final existingNew = await _client
            .from('precheck_damages')
            .select('id')
            .eq('submission_id', submissionId)
            .eq('item_id', itemId)
            .eq('source', 'check_item')
            .limit(1);
        if (existingNew.isNotEmpty) {
          continue;
        }
      }
      final notes = newDefect['notes']?.toString().trim() ?? '';
      final images =
          ((newDefect['images'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .toList(growable: false);
      final urls = await _uploadPhotos(
        submissionId,
        images,
        userId: payload['userId']?.toString() ?? '',
      );
      await _client.from('precheck_damages').insert(<String, dynamic>{
        'submission_id': submissionId,
        'item_id': itemId,
        'description': notes.isEmpty
            ? '${item['label'] ?? item['key']} - repair needed'
            : notes,
        'severity': 'minor',
        'image_urls': urls,
        'source': 'check_item',
      });
    }
  }

  Future<PreCheckSubmissionSummary> _submitPreShiftPayload(
    Map<String, dynamic> payload,
  ) async {
    final formSessionId = payload['formSessionId'] as String?;
    if (formSessionId != null && formSessionId.isNotEmpty) {
      final existing = await _client
          .from('precheck_submissions')
          .select(
            'id,tug_id,check_time,created_at,tugs(tug_number,display_name)',
          )
          .eq('form_session_id', formSessionId)
          .maybeSingle();
      if (existing != null) {
        final submissionId = existing['id']?.toString() ?? '';
        await _completeExistingPreShift(submissionId, payload);
        return _summaryFromRow(existing);
      }
    }

    final inserted = await _client
        .from('precheck_submissions')
        .insert(<String, dynamic>{
          'user_id': payload['userId'],
          'tug_id': payload['tugId'],
          'check_type': payload['checkType'],
          'remarks': (payload['remarks'] as String?)?.trim().isEmpty ?? true
              ? null
              : payload['remarks'],
          'form_session_id': formSessionId,
        })
        .select(
          'id,tug_id,check_time,created_at,tugs(tug_number,display_name)',
        )
        .single();
    final submissionId = inserted['id']?.toString() ?? '';
    await _completeExistingPreShift(submissionId, payload);
    return _summaryFromRow(inserted);
  }

  Future<PreCheckSubmissionSummary> _submitDuringShiftPayload(
    Map<String, dynamic> payload,
  ) async {
    final formSessionId = payload['formSessionId'] as String?;
    if (formSessionId != null && formSessionId.isNotEmpty) {
      final existing = await _client
          .from('precheck_submissions')
          .select(
            'id,tug_id,check_time,created_at,tugs(tug_number,display_name)',
          )
          .eq('form_session_id', formSessionId)
          .maybeSingle();
      if (existing != null) {
        final submissionId = existing['id']?.toString() ?? '';
        final existingDamages = await _client
            .from('precheck_damages')
            .select('id')
            .eq('submission_id', submissionId)
            .eq('source', 'during_shift')
            .limit(1);
        if (existingDamages.isEmpty) {
          final images =
              ((payload['images'] as List<dynamic>?) ?? const <dynamic>[])
                  .whereType<Map<String, dynamic>>()
                  .toList(growable: false);
          final urls = await _uploadPhotos(
            submissionId,
            images,
            userId: payload['userId']?.toString() ?? '',
          );
          await _client.from('precheck_damages').insert(<String, dynamic>{
            'submission_id': submissionId,
            'description':
                payload['description']?.toString().trim().isEmpty ?? true
                ? 'Damage report'
                : payload['description']?.toString().trim(),
            'severity': 'minor',
            'image_urls': urls,
            'source': 'during_shift',
          });
        }
        return _summaryFromRow(existing);
      }
    }

    final inserted = await _client
        .from('precheck_submissions')
        .insert(<String, dynamic>{
          'user_id': payload['userId'],
          'tug_id': payload['tugId'],
          'check_type': PreCheckType.duringShift.dbValue,
          'remarks': payload['description']?.toString().trim(),
          'form_session_id': formSessionId,
        })
        .select(
          'id,tug_id,check_time,created_at,tugs(tug_number,display_name)',
        )
        .single();
    final submissionId = inserted['id']?.toString() ?? '';
    final images = ((payload['images'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final urls = await _uploadPhotos(
      submissionId,
      images,
      userId: payload['userId']?.toString() ?? '',
    );
    await _client.from('precheck_damages').insert(<String, dynamic>{
      'submission_id': submissionId,
      'description': payload['description']?.toString().trim().isEmpty ?? true
          ? 'Damage report'
          : payload['description']?.toString().trim(),
      'severity': 'minor',
      'image_urls': urls,
      'source': 'during_shift',
    });
    return _summaryFromRow(inserted);
  }

  Future<List<String>> _uploadPhotos(
    String submissionId,
    List<Map<String, dynamic>> photos, {
    required String userId,
  }) async {
    if (userId.isEmpty) {
      throw StateError('userId is required to upload precheck images');
    }
    final urls = <String>[];
    for (final photo in photos) {
      final existingUrl = photo['url'] as String?;
      if (existingUrl != null && existingUrl.isNotEmpty) {
        urls.add(existingUrl);
        continue;
      }
      final path = photo['path'] as String?;
      if (path == null || path.isEmpty || !File(path).existsSync()) {
        throw StateError(
          'Photo file is missing. Please re-add the photo and try again.',
        );
      }
      final id = photo['id']?.toString() ?? _randomId();
      final ext = _extensionForPath(path);
      final storagePath = buildPrecheckImagePath(userId, <String>[
        'damages',
        submissionId,
        '$id.$ext',
      ]);
      await _client.storage
          .from(precheckImagesBucket)
          .upload(
            storagePath,
            File(path),
            fileOptions: FileOptions(
              upsert: true,
              contentType: photo['contentType']?.toString() ?? 'image/jpeg',
            ),
          );
      final publicUrl = _client.storage
          .from(precheckImagesBucket)
          .getPublicUrl(storagePath);
      if (publicUrl.isEmpty) {
        throw StateError('Failed to resolve uploaded image URL');
      }
      urls.add(publicUrl);
    }
    return urls;
  }

  Future<void> _insertSameProblemConfirmation({
    required String damageId,
    required String userId,
    required String submissionId,
    required String tugId,
    required String itemKey,
  }) async {
    final damage = await _client
        .from('precheck_damages')
        .select('''
          id,
          repair_status,
          precheck_submissions!inner(tug_id),
          precheck_items!inner(item_name)
        ''')
        .eq('id', damageId)
        .maybeSingle();
    final sub = damage?['precheck_submissions'];
    final item = damage?['precheck_items'];
    final subMap = sub is Map<String, dynamic> ? sub : null;
    final itemMap = item is Map<String, dynamic> ? item : null;
    if (damage == null ||
        damage['repair_status'] == 'resolved' ||
        damage['repair_status'] == 'acknowledged' ||
        subMap?['tug_id']?.toString() != tugId ||
        itemMap?['item_name']?.toString() != itemKey) {
      return;
    }
    final existing = await _client
        .from('precheck_damage_confirmations')
        .select('id')
        .eq('damage_id', damageId)
        .eq('submission_id', submissionId)
        .maybeSingle();
    if (existing != null) {
      return;
    }
    await _client.from('precheck_damage_confirmations').insert(
      <String, dynamic>{
        'damage_id': damageId,
        'user_id': userId,
        'submission_id': submissionId,
      },
    );
  }

  Future<void> _recordFixedConfirmations(
    List<String> damageIds, {
    required String submissionId,
  }) async {
    for (final damageId in damageIds) {
      await _client.rpc(
        'record_precheck_damage_fixed_confirmation',
        params: <String, dynamic>{
          'damage_id': damageId,
          'submission_id': submissionId,
        },
      );
    }
  }

  PreCheckSubmissionSummary _summaryFromRow(Map<String, dynamic> row) {
    final tug = row['tugs'];
    final tugMap = tug is Map<String, dynamic> ? tug : null;
    return PreCheckSubmissionSummary(
      id: row['id']?.toString() ?? '',
      tugId: row['tug_id']?.toString() ?? '',
      tugNumber: tugMap?['tug_number']?.toString() ?? '',
      tugDisplayName: tugMap?['display_name'] as String?,
      checkTime:
          DateTime.tryParse(row['check_time']?.toString() ?? '') ??
          DateTime.tryParse(row['created_at']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Duration _computeBackoff(int attempt) {
    final multiplier = 1 << (attempt.clamp(1, 6) - 1);
    return Duration(
      milliseconds: NetworkPolicy.initialBackoff.inMilliseconds * multiplier,
    );
  }

  String _randomId() {
    final random = Random();
    return '${DateTime.now().millisecondsSinceEpoch}-${random.nextInt(1 << 32)}';
  }

  String _extensionForPath(String path) {
    final last = path.split('/').last;
    if (last.contains('.')) {
      return last.split('.').last.toLowerCase();
    }
    return 'jpg';
  }

  String _monthLabel(int month) {
    const labels = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return labels[(month - 1).clamp(0, 11)];
  }
}

const _fallbackOutside = <PreCheckItemDefinition>[
  PreCheckItemDefinition(key: 'tyres', label: 'Tyres', category: 'outside'),
  PreCheckItemDefinition(
    key: 'mud_flaps',
    label: 'Mud Flaps',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'head_lights',
    label: 'Head Lights',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'signal_lights',
    label: 'Signal Lights',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'brake_lights',
    label: 'Brake Lights',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'strobe_lights',
    label: 'Beacon Lights',
    category: 'outside',
  ),
  PreCheckItemDefinition(key: 'mirrors', label: 'Mirrors', category: 'outside'),
  PreCheckItemDefinition(key: 'doors', label: 'Doors', category: 'outside'),
  PreCheckItemDefinition(key: 'windows', label: 'Windows', category: 'outside'),
  PreCheckItemDefinition(
    key: 'step_handles_platforms',
    label: 'Steps/Platforms',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'fifth_wheel_operation',
    label: '5th Wheel Operation',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'trailer_air_lines',
    label: 'Electric / Air Lines',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'fluid_leaks',
    label: 'Fluid Leaks',
    category: 'outside',
  ),
  PreCheckItemDefinition(
    key: 'air_leaks',
    label: 'Air Leaks',
    category: 'outside',
  ),
  PreCheckItemDefinition(key: 'wipers', label: 'Wipers', category: 'outside'),
];

const _fallbackInside = <PreCheckItemDefinition>[
  PreCheckItemDefinition(key: 'seat', label: 'Seat', category: 'inside'),
  PreCheckItemDefinition(
    key: 'seat_belt',
    label: 'Seat Belt',
    category: 'inside',
  ),
  PreCheckItemDefinition(key: 'heater', label: 'Heater', category: 'inside'),
  PreCheckItemDefinition(
    key: 'steering',
    label: 'Steering',
    category: 'inside',
  ),
  PreCheckItemDefinition(
    key: 'throttle',
    label: 'Throttle',
    category: 'inside',
  ),
  PreCheckItemDefinition(key: 'starter', label: 'Starter', category: 'inside'),
  PreCheckItemDefinition(
    key: 'service_brakes',
    label: 'Service Brakes',
    category: 'inside',
  ),
  PreCheckItemDefinition(
    key: 'park_brake',
    label: 'Park Brake',
    category: 'inside',
  ),
  PreCheckItemDefinition(
    key: 'cab_lights',
    label: 'Cab Lights',
    category: 'inside',
  ),
  PreCheckItemDefinition(
    key: 'stickers',
    label: 'Stickers',
    category: 'inside',
  ),
  PreCheckItemDefinition(
    key: 'king_pin_warning',
    label: 'King Pin Light',
    category: 'inside',
  ),
];

const _fallbackItems = <PreCheckItemDefinition>[
  ..._fallbackOutside,
  ..._fallbackInside,
];
