import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/local_db/app_local_database.dart';
import '../../../core/network/network_policy.dart';
import '../domain/pre_check_models.dart';

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
    } catch (_) {
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
  }) async {
    final payload = <String, dynamic>{
      'userId': userId,
      'tugId': tug.id,
      'tugNumber': tug.tugNumber,
      'tugDisplayName': tug.displayName,
      'description': description.trim(),
      'images': photos.map((photo) => photo.toJson()).toList(),
    };
    try {
      return await _submitDuringShiftPayload(payload);
    } catch (_) {
      final jobKey = '${tug.id}:${DateTime.now().millisecondsSinceEpoch}';
      await _localDb.enqueuePreCheckJob(
        jobKey: jobKey,
        opType: PreCheckType.duringShift.dbValue,
        payloadJson: jsonEncode(payload),
      );
      return PreCheckSubmissionSummary(
        id: jobKey,
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
        String stateKey = item.key;
        if (defects.length >= 2) {
          stateKey = defects
              .map((defect) => '${item.key}::${defect.id}')
              .firstWhere(
                (key) =>
                    draft.itemStates[key]?.status ==
                    PreCheckItemStatus.repairNeeded,
                orElse: () =>
                    draft.itemStates['${item.key}::new']?.status ==
                        PreCheckItemStatus.repairNeeded
                    ? '${item.key}::new'
                    : item.key,
              );
        }
        final state = draft.itemStates[stateKey] ?? const PreCheckItemState();
        final effectiveStatus = effectiveStatusForItem(
          item: item,
          draft: draft,
          defectsByItem: defectsByItem,
        );
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
        .select()
        .single();
    final submissionId = inserted['id']?.toString() ?? '';
    final items = ((payload['items'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);

    final insertedItems = await _client
        .from('precheck_items')
        .insert(
          items
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

    final itemIdMap = <String, String>{};
    for (final row in insertedItems.whereType<Map<String, dynamic>>()) {
      final key = row['item_name']?.toString();
      final id = row['id']?.toString();
      if (key != null && id != null) {
        itemIdMap[key] = id;
      }
    }

    final remarks = payload['remarks']?.toString().trim() ?? '';
    final remarkImages =
        ((payload['remarksImages'] as List<dynamic>?) ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .toList(growable: false);
    if (remarks.isNotEmpty || remarkImages.isNotEmpty) {
      final urls = await _uploadPhotos(submissionId, remarkImages);
      await _client.from('precheck_damages').insert(<String, dynamic>{
        'submission_id': submissionId,
        'description': remarks.isEmpty ? 'Additional photos' : remarks,
        'severity': 'minor',
        'image_urls': urls,
        'source': 'remarks',
      });
    }

    for (final item in items) {
      if (item['status'] != PreCheckItemStatus.repairNeeded.dbValue) {
        continue;
      }
      final linkedDamageId = item['linkedDamageId'] as String?;
      if (linkedDamageId != null && linkedDamageId.isNotEmpty) {
        await _insertSameProblemConfirmation(
          damageId: linkedDamageId,
          userId: payload['userId']?.toString() ?? '',
          submissionId: submissionId,
          tugId: payload['tugId']?.toString() ?? '',
          itemKey: item['key']?.toString() ?? '',
        );
        continue;
      }
      final notes = item['notes']?.toString().trim() ?? '';
      final images = ((item['images'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .toList(growable: false);
      if (notes.isEmpty && images.isEmpty) {
        continue;
      }
      final urls = await _uploadPhotos(submissionId, images);
      await _client.from('precheck_damages').insert(<String, dynamic>{
        'submission_id': submissionId,
        'item_id': itemIdMap[item['key']?.toString()],
        'description': notes.isEmpty
            ? '${item['label'] ?? item['key']} - repair needed'
            : notes,
        'severity': 'minor',
        'image_urls': urls,
        'source': 'check_item',
      });
    }

    return PreCheckSubmissionSummary(
      id: submissionId,
      tugId: payload['tugId']?.toString() ?? '',
      tugNumber: payload['tugNumber']?.toString() ?? '',
      tugDisplayName: payload['tugDisplayName'] as String?,
      checkTime:
          DateTime.tryParse(inserted['check_time']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Future<PreCheckSubmissionSummary> _submitDuringShiftPayload(
    Map<String, dynamic> payload,
  ) async {
    final inserted = await _client
        .from('precheck_submissions')
        .insert(<String, dynamic>{
          'user_id': payload['userId'],
          'tug_id': payload['tugId'],
          'check_type': PreCheckType.duringShift.dbValue,
          'remarks': payload['description']?.toString().trim(),
        })
        .select()
        .single();
    final submissionId = inserted['id']?.toString() ?? '';
    final images = ((payload['images'] as List<dynamic>?) ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final urls = await _uploadPhotos(submissionId, images);
    await _client.from('precheck_damages').insert(<String, dynamic>{
      'submission_id': submissionId,
      'description': payload['description']?.toString().trim().isEmpty ?? true
          ? 'Damage report'
          : payload['description']?.toString().trim(),
      'severity': 'minor',
      'image_urls': urls,
      'source': 'during_shift',
    });
    return PreCheckSubmissionSummary(
      id: submissionId,
      tugId: payload['tugId']?.toString() ?? '',
      tugNumber: payload['tugNumber']?.toString() ?? '',
      tugDisplayName: payload['tugDisplayName'] as String?,
      checkTime:
          DateTime.tryParse(inserted['check_time']?.toString() ?? '') ??
          DateTime.now(),
    );
  }

  Future<List<String>> _uploadPhotos(
    String submissionId,
    List<Map<String, dynamic>> photos,
  ) async {
    final urls = <String>[];
    for (final photo in photos) {
      final existingUrl = photo['url'] as String?;
      if (existingUrl != null && existingUrl.isNotEmpty) {
        urls.add(existingUrl);
        continue;
      }
      final path = photo['path'] as String?;
      if (path == null || path.isEmpty || !File(path).existsSync()) {
        continue;
      }
      final id = photo['id']?.toString() ?? _randomId();
      final ext = _extensionForPath(path);
      final storagePath = 'damages/$submissionId/$id.$ext';
      await _client.storage
          .from('precheck-images')
          .upload(
            storagePath,
            File(path),
            fileOptions: FileOptions(
              upsert: true,
              contentType: photo['contentType']?.toString() ?? 'image/jpeg',
            ),
          );
      urls.add(
        _client.storage.from('precheck-images').getPublicUrl(storagePath),
      );
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
        subMap?['tug_id']?.toString() != tugId ||
        itemMap?['item_name']?.toString() != itemKey) {
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
