import 'dart:math';
import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/models.dart';
import '../domain/stage_three_models.dart';

class StageThreeAuthorizationException implements Exception {
  const StageThreeAuthorizationException(this.message);
  final String message;
  @override
  String toString() => message;
}

class StageThreeRepository {
  StageThreeRepository(this._client);
  final SupabaseClient _client;

  void requireVmu(UserSession session) {
    if (!session.isAdmin && !session.isVmu) {
      throw const StageThreeAuthorizationException('VMU access is required.');
    }
  }

  void requireAdmin(UserSession session) {
    if (!session.isAdmin) {
      throw const StageThreeAuthorizationException(
        'Administrative privileges are required.',
      );
    }
  }

  Future<List<TugRecord>> loadTugs(UserSession session) async {
    requireVmu(session);
    final rows = await _client
        .from('tugs')
        .select('*,locations(id,name)')
        .order('tug_number');
    return rows.whereType<Map<String, dynamic>>().map(_mapTug).toList();
  }

  Future<List<DefectRecord>> loadDefects(UserSession session) async {
    requireVmu(session);
    final rows = await _client
        .from('precheck_damages')
        .select(
          '*,resolved_profile:resolved_by(first_name,last_name),'
          'precheck_items(item_name),'
          'precheck_submissions!inner(id,tug_id,created_at,'
          'profiles:user_id(first_name,last_name),'
          'tugs(id,tug_number,display_name))',
        )
        .neq('source', 'remarks')
        .order('created_at', ascending: false);
    final labels = await _checkItemLabels();
    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) => _mapDefect(row, labels))
        .whereType<DefectRecord>()
        .toList();
  }

  Future<List<DefectActivity>> loadDefectActivity(
    UserSession session,
    DefectRecord defect,
  ) async {
    requireVmu(session);
    final results = await Future.wait<dynamic>([
      _client
          .from('defect_activity_log')
          .select('*,profiles:user_id(first_name,last_name)')
          .eq('damage_id', defect.id)
          .order('created_at', ascending: false),
      _client
          .from('precheck_damage_confirmations')
          .select('id,created_at,profiles:user_id(first_name,last_name)')
          .eq('damage_id', defect.id)
          .order('created_at', ascending: false),
    ]);
    final activity = <DefectActivity>[
      DefectActivity(
        id: 'initial-${defect.id}',
        type: 'initial_report',
        createdAt: defect.createdAt,
        actorName: defect.reporterName,
      ),
    ];
    for (final row in (results[0] as List).whereType<Map<String, dynamic>>()) {
      activity.add(
        DefectActivity(
          id: row['id'].toString(),
          type: row['action_type']?.toString() ?? 'field_update',
          createdAt: _date(row['created_at']) ?? defect.createdAt,
          actorName: _profileName(row['profiles']),
          fieldName: row['field_name']?.toString(),
          oldValue: row['old_value']?.toString(),
          newValue: row['new_value']?.toString(),
        ),
      );
    }
    for (final row in (results[1] as List).whereType<Map<String, dynamic>>()) {
      activity.add(
        DefectActivity(
          id: row['id'].toString(),
          type: 'confirmation',
          createdAt: _date(row['created_at']) ?? defect.createdAt,
          actorName: _profileName(row['profiles']),
        ),
      );
    }
    activity.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return activity;
  }

  Future<void> updateDefect({
    required UserSession session,
    required DefectRecord current,
    RepairStatus? status,
    String? defectNumber,
    DateTime? reportedToTerbergAt,
    String? vmuNotes,
    bool updateDefectNumber = false,
    bool updateTerbergDate = false,
    bool updateNotes = false,
  }) async {
    requireVmu(session);
    final updates = <String, dynamic>{};
    if (status != null && status != current.status) {
      updates['repair_status'] = status.dbValue;
      updates['resolved_at'] = status == RepairStatus.resolved
          ? DateTime.now().toUtc().toIso8601String()
          : null;
      updates['resolved_by'] = status == RepairStatus.resolved
          ? session.userId
          : null;
    }
    if (updateDefectNumber) {
      final value = defectNumber?.trim() ?? '';
      updates['defect_number'] = value.isEmpty
          ? null
          : value.toUpperCase().startsWith('D-')
          ? value.toUpperCase()
          : 'D-${value.toUpperCase()}';
    }
    if (updateTerbergDate) {
      updates['reported_to_terberg_at'] = reportedToTerbergAt
          ?.toUtc()
          .toIso8601String();
    }
    if (updateNotes) {
      updates['vmu_notes'] = _nullable(vmuNotes);
    }
    if (updates.isEmpty) return;
    await _client.from('precheck_damages').update(updates).eq('id', current.id);
    final logRows = <Map<String, dynamic>>[];
    for (final entry in updates.entries) {
      if (entry.key == 'resolved_at' || entry.key == 'resolved_by') continue;
      final oldValue = switch (entry.key) {
        'repair_status' => current.status.dbValue,
        'defect_number' => current.defectNumber,
        'reported_to_terberg_at' =>
          current.reportedToTerbergAt?.toIso8601String(),
        'vmu_notes' => current.vmuNotes,
        _ => null,
      };
      if ((oldValue ?? '').toString() == (entry.value ?? '').toString()) {
        continue;
      }
      logRows.add({
        'damage_id': current.id,
        'user_id': session.userId,
        'action_type': entry.key == 'repair_status'
            ? 'status_change'
            : 'field_update',
        'field_name': entry.key,
        'old_value': oldValue?.toString(),
        'new_value': entry.value?.toString(),
      });
    }
    if (logRows.isNotEmpty) {
      await _client.from('defect_activity_log').insert(logRows);
    }
  }

  Future<List<PreCheckSubmissionRecord>> loadPreChecks({
    required UserSession session,
    String? tugId,
    String? checkType,
    DateTime? from,
    DateTime? to,
  }) async {
    requireVmu(session);
    dynamic query = _client
        .from('precheck_submissions')
        .select(
          '*,profiles:user_id(first_name,last_name),'
          'tugs(id,tug_number,display_name,locations(name)),'
          'precheck_items(*),'
          'precheck_damages(*,resolved_profile:resolved_by(first_name,last_name))',
        );
    if (tugId?.isNotEmpty == true) query = query.eq('tug_id', tugId!);
    if (checkType?.isNotEmpty == true) {
      query = query.eq('check_type', checkType!);
    }
    if (from != null) {
      query = query.gte('check_date', _ymd(from));
    }
    if (to != null) query = query.lte('check_date', _ymd(to));
    final rows = await query.order('check_time', ascending: false).limit(500);
    final labels = await _checkItemLabels();
    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) => _mapSubmission(row, labels))
        .whereType<PreCheckSubmissionRecord>()
        .toList();
  }

  Future<void> updatePreCheckDefectStatus({
    required UserSession session,
    required DefectRecord defect,
    required RepairStatus status,
  }) => updateDefect(session: session, current: defect, status: status);

  Future<List<TugTablet>> loadTablets(UserSession session) async {
    requireAdmin(session);
    final rows = await _client
        .from('tug_tablets')
        .select('*,tugs(id,tug_number,display_name)')
        .order('serial_number');
    return rows.whereType<Map<String, dynamic>>().map((row) {
      final tug = row['tugs'];
      return TugTablet(
        id: row['id'].toString(),
        tugId: row['tug_id'].toString(),
        serialNumber: row['serial_number']?.toString() ?? '',
        tugLabel: tug is Map
            ? (tug['display_name'] ?? tug['tug_number'])?.toString()
            : null,
      );
    }).toList();
  }

  Future<void> saveTug({
    required UserSession session,
    String? id,
    required String number,
    required String status,
    String? displayName,
    String? locationId,
  }) async {
    requireAdmin(session);
    final payload = {
      'tug_number': number.trim(),
      'display_name': _nullable(displayName),
      'location_id': _nullable(locationId),
      'status': status,
    };
    if (payload['tug_number']!.isEmpty) {
      throw const FormatException('Tug number is required.');
    }
    if (id == null) {
      await _client.from('tugs').insert(payload);
    } else {
      await _client.from('tugs').update(payload).eq('id', id);
    }
  }

  Future<void> deleteTug(UserSession session, String id) async {
    requireAdmin(session);
    await _client.from('tugs').delete().eq('id', id);
  }

  Future<String> regenerateTugQr(UserSession session, String id) async {
    requireAdmin(session);
    final random = Random.secure();
    final token = List.generate(
      24,
      (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    await _client.from('tugs').update({'qr_token': token}).eq('id', id);
    return token;
  }

  Future<void> saveTablet({
    required UserSession session,
    String? id,
    required String tugId,
    required String serialNumber,
  }) async {
    requireAdmin(session);
    final payload = {'tug_id': tugId, 'serial_number': serialNumber.trim()};
    if (id == null) {
      await _client.from('tug_tablets').insert(payload);
    } else {
      await _client.from('tug_tablets').update(payload).eq('id', id);
    }
  }

  Future<void> deleteTablet(UserSession session, String id) async {
    requireAdmin(session);
    await _client.from('tug_tablets').delete().eq('id', id);
  }

  Future<List<CheckItemDefinition>> loadCheckItems(UserSession session) async {
    requireAdmin(session);
    final rows = await _client
        .from('precheck_check_items')
        .select()
        .order('category')
        .order('sort_order');
    return rows.whereType<Map<String, dynamic>>().map((row) {
      return CheckItemDefinition(
        id: row['id'].toString(),
        key: row['item_key']?.toString() ?? '',
        label: row['label']?.toString() ?? '',
        tooltip: row['tooltip']?.toString(),
        category: row['category']?.toString() ?? 'outside',
        sortOrder: (row['sort_order'] as num?)?.round() ?? 0,
        isActive: row['is_active'] != false,
        allowNa: row['allow_na'] == true,
      );
    }).toList();
  }

  Future<void> saveCheckItem({
    required UserSession session,
    String? id,
    required String key,
    required String label,
    required String category,
    required int sortOrder,
    String? tooltip,
    bool isActive = true,
    bool allowNa = false,
  }) async {
    requireAdmin(session);
    final payload = {
      'item_key': key.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_'),
      'label': label.trim(),
      'tooltip': _nullable(tooltip),
      'category': category,
      'sort_order': sortOrder,
      'is_active': isActive,
      'allow_na': allowNa,
    };
    if (id == null) {
      await _client.from('precheck_check_items').insert(payload);
    } else {
      await _client.from('precheck_check_items').update(payload).eq('id', id);
    }
  }

  Future<void> reorderCheckItems(
    UserSession session,
    CheckItemDefinition first,
    CheckItemDefinition second,
  ) async {
    requireAdmin(session);
    await Future.wait([
      _client
          .from('precheck_check_items')
          .update({'sort_order': second.sortOrder})
          .eq('id', first.id),
      _client
          .from('precheck_check_items')
          .update({'sort_order': first.sortOrder})
          .eq('id', second.id),
    ]);
  }

  Future<void> deleteCheckItem(UserSession session, String id) async {
    requireAdmin(session);
    await _client.from('precheck_check_items').delete().eq('id', id);
  }

  Future<Map<String, String>> loadSettings(
    UserSession session, [
    Iterable<String>? keys,
  ]) async {
    requireAdmin(session);
    dynamic query = _client.from('settings').select('key,value');
    if (keys != null && keys.isNotEmpty) {
      query = query.inFilter('key', keys.toList());
    }
    final rows = await query;
    return {
      for (final row in rows.whereType<Map<String, dynamic>>())
        row['key'].toString(): row['value']?.toString() ?? '',
    };
  }

  Future<void> saveSetting(
    UserSession session,
    String key,
    Object value, {
    String? description,
  }) async {
    requireAdmin(session);
    final payload = <String, dynamic>{'key': key, 'value': value.toString()};
    payload.addAll(
      description == null ? const {} : {'description': description},
    );
    await _client.from('settings').upsert(payload, onConflict: 'key');
  }

  Future<List<Map<String, dynamic>>> loadRows(
    UserSession session,
    String table, {
    String select = '*',
    String orderBy = 'created_at',
    bool ascending = false,
  }) async {
    requireAdmin(session);
    final rows = await _client
        .from(table)
        .select(select)
        .order(orderBy, ascending: ascending);
    return rows.whereType<Map<String, dynamic>>().toList();
  }

  Future<void> saveRow({
    required UserSession session,
    required String table,
    required Map<String, dynamic> payload,
    String? id,
  }) async {
    requireAdmin(session);
    if (id == null) {
      await _client.from(table).insert(payload);
    } else {
      await _client.from(table).update(payload).eq('id', id);
    }
  }

  Future<void> deleteRow(UserSession session, String table, String id) async {
    requireAdmin(session);
    await _client.from(table).delete().eq('id', id);
  }

  Future<String> uploadInductionImage({
    required UserSession session,
    required Uint8List bytes,
    required String extension,
  }) async {
    requireAdmin(session);
    final safeExtension = extension.replaceAll(RegExp('[^a-zA-Z0-9]'), '');
    final path =
        '${DateTime.now().millisecondsSinceEpoch}-${session.userId}.$safeExtension';
    await _client.storage
        .from('induction-guide-images')
        .uploadBinary(
          path,
          bytes,
          fileOptions: const FileOptions(upsert: false),
        );
    return _client.storage.from('induction-guide-images').getPublicUrl(path);
  }

  Future<List<Map<String, dynamic>>> loadActivity({
    required UserSession session,
    required String kind,
    int daysBack = 1,
    String? entityType,
  }) async {
    requireAdmin(session);
    final response = switch (kind) {
      'summary' => await _client.rpc(
        'get_user_activity_summary',
        params: {'days_back': daysBack},
      ),
      'system' => await _client.rpc(
        'get_system_activity_log',
        params: {
          'days_back': daysBack,
          'limit_count': 500,
          'entity_type_filter': _nullable(entityType),
          'user_id_filter': null,
        },
      ),
      _ => await _client.rpc(
        'get_full_activity_logs',
        params: {'days_back': daysBack, 'limit_count': 500},
      ),
    };
    return (response as List).whereType<Map<String, dynamic>>().toList();
  }

  Future<List<PerformanceRow>> matchPerformanceRows(
    UserSession session,
    List<PerformanceRow> parsed,
  ) async {
    requireAdmin(session);
    final rows = await _client
        .from('profiles')
        .select('id,first_name,last_name,yard_system_id')
        .not('yard_system_id', 'is', null);
    final profiles = {
      for (final row in rows.whereType<Map<String, dynamic>>())
        row['yard_system_id'].toString().trim().toUpperCase(): row,
    };
    return parsed.map((item) {
      final profile = profiles[item.yardSystemId];
      return PerformanceRow(
        yardSystemId: item.yardSystemId,
        fullName: profile == null
            ? item.fullName
            : '${profile['first_name'] ?? ''} ${profile['last_name'] ?? ''}'
                  .trim(),
        moves: item.moves,
        averageCollect: item.averageCollect,
        averageTravel: item.averageTravel,
        shiftCount: item.shiftCount,
        userId: profile?['id']?.toString(),
      );
    }).toList();
  }

  Future<void> importPerformance({
    required UserSession session,
    required String reportDate,
    required List<PerformanceRow> rows,
  }) async {
    requireAdmin(session);
    final matched = rows.where((row) => row.matched).toList();
    if (matched.isEmpty) {
      throw const FormatException('No matched records to import.');
    }
    await _client
        .from('shunter_performance')
        .upsert(
          matched
              .map(
                (row) => {
                  'user_id': row.userId,
                  'report_date': reportDate,
                  'number_of_moves': row.moves,
                  'avg_time_to_collect': row.averageCollect,
                  'avg_time_to_travel': row.averageTravel,
                },
              )
              .toList(),
          onConflict: 'user_id,report_date',
        );
  }

  Future<List<Map<String, dynamic>>> loadPerformanceHistory(
    UserSession session,
  ) async {
    requireAdmin(session);
    final rows = await _client
        .from('shunter_performance')
        .select('report_date,user_id')
        .order('report_date', ascending: false);
    final counts = <String, int>{};
    for (final row in rows) {
      final date = row['report_date'].toString();
      counts[date] = (counts[date] ?? 0) + 1;
    }
    return counts.entries
        .map((entry) => {'report_date': entry.key, 'count': entry.value})
        .toList();
  }

  static TugRecord _mapTug(Map<String, dynamic> row) {
    final location = row['locations'];
    return TugRecord(
      id: row['id'].toString(),
      number: row['tug_number']?.toString() ?? '',
      displayName: row['display_name']?.toString(),
      locationId: row['location_id']?.toString(),
      locationName: location is Map ? location['name']?.toString() : null,
      status: row['status']?.toString() ?? 'active',
      qrToken: row['qr_token']?.toString(),
    );
  }

  static DefectRecord? _mapDefect(
    Map<String, dynamic> row,
    Map<String, String> labels,
  ) {
    final submission = row['precheck_submissions'];
    if (submission is! Map) return null;
    final tug = submission['tugs'];
    if (tug is! Map) return null;
    final item = row['precheck_items'];
    final itemKey = item is Map ? item['item_name']?.toString() : null;
    return DefectRecord(
      id: row['id'].toString(),
      submissionId: submission['id'].toString(),
      tugId: submission['tug_id']?.toString() ?? tug['id'].toString(),
      tugLabel: (tug['display_name'] ?? tug['tug_number'] ?? 'Unknown tug')
          .toString(),
      tugNumber: tug['tug_number']?.toString() ?? '',
      description: row['description']?.toString() ?? '',
      status: RepairStatus.fromDb(row['repair_status']),
      createdAt:
          _date(submission['created_at']) ??
          _date(row['created_at']) ??
          DateTime.now(),
      reporterName: _profileName(submission['profiles']),
      defectNumber: row['defect_number']?.toString(),
      reportedToTerbergAt: _date(row['reported_to_terberg_at']),
      vmuNotes: row['vmu_notes']?.toString(),
      resolvedAt: _date(row['resolved_at']),
      resolvedBy: row['resolved_by']?.toString(),
      resolvedByName: _profileName(row['resolved_profile'], fallback: null),
      itemLabel: itemKey == null ? null : labels[itemKey],
      imageUrls: _strings(row['image_urls']),
    );
  }

  static PreCheckSubmissionRecord? _mapSubmission(
    Map<String, dynamic> row,
    Map<String, String> labels,
  ) {
    final tug = row['tugs'];
    if (tug is! Map) return null;
    final submissionStub = <String, dynamic>{
      'id': row['id'],
      'tug_id': row['tug_id'],
      'created_at': row['created_at'],
      'profiles': row['profiles'],
      'tugs': tug,
    };
    final defects = (row['precheck_damages'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (damage) => _mapDefect({
            ...damage,
            'precheck_submissions': submissionStub,
          }, labels),
        )
        .whereType<DefectRecord>()
        .toList();
    final items = (row['precheck_items'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (item) => PreCheckItemRecord(
            id: item['id'].toString(),
            name:
                labels[item['item_name']?.toString()] ??
                item['item_name']?.toString().replaceAll('_', ' ') ??
                'Item',
            category: item['item_category']?.toString() ?? 'check',
            status: item['status']?.toString() ?? '',
            notes: item['notes']?.toString(),
          ),
        )
        .toList();
    final location = tug['locations'];
    return PreCheckSubmissionRecord(
      id: row['id'].toString(),
      tugId: row['tug_id']?.toString() ?? tug['id'].toString(),
      tugLabel: (tug['display_name'] ?? tug['tug_number'] ?? 'Unknown tug')
          .toString(),
      tugNumber: tug['tug_number']?.toString() ?? '',
      userName: _profileName(row['profiles']),
      checkType: row['check_type']?.toString() ?? 'pre_shift',
      checkDate: row['check_date']?.toString() ?? '',
      checkTime:
          _date(row['check_time']) ??
          _date(row['created_at']) ??
          DateTime.now(),
      locationName: location is Map ? location['name']?.toString() : null,
      remarks: row['remarks']?.toString(),
      items: items,
      defects: defects,
    );
  }

  Future<Map<String, String>> _checkItemLabels() async {
    final rows = await _client
        .from('precheck_check_items')
        .select('item_key,label');
    return {
      for (final row in rows.whereType<Map<String, dynamic>>())
        row['item_key'].toString(): row['label']?.toString() ?? '',
    };
  }

  static String _profileName(Object? profile, {String? fallback = 'Unknown'}) {
    if (profile is Map) {
      final name =
          '${profile['first_name'] ?? ''} ${profile['last_name'] ?? ''}'.trim();
      if (name.isNotEmpty) return name;
    }
    return fallback ?? '';
  }

  static List<String> _strings(Object? value) =>
      value is List ? value.map((item) => item.toString()).toList() : const [];
  static DateTime? _date(Object? value) =>
      DateTime.tryParse(value?.toString() ?? '');
  static String? _nullable(Object? value) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty ? null : text;
  }

  static String _ymd(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}
