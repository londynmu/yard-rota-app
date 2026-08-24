import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../domain/stage_two_models.dart';

class StageTwoAuthorizationException implements Exception {
  const StageTwoAuthorizationException(this.message);
  final String message;
  @override
  String toString() => message;
}

class StageTwoRepository {
  StageTwoRepository(this._client);

  final SupabaseClient _client;

  void requireAdmin(UserSession session) {
    if (!session.isAdmin) {
      throw const StageTwoAuthorizationException(
        'Administrative privileges are required.',
      );
    }
  }

  void requireTransportRead(UserSession session) {
    if (!session.isAdmin && !session.isTransportManager) {
      throw const StageTwoAuthorizationException(
        'Transport dashboard access is required.',
      );
    }
  }

  Future<List<LocationOption>> loadLocations() async {
    final rows = await _client
        .from('locations')
        .select('id,name')
        .eq('is_active', true)
        .order('name');
    return rows
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => LocationOption(
            id: row['id'].toString(),
            name: row['name']?.toString() ?? '',
          ),
        )
        .where((item) => item.name.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<AgencyOption>> loadAgencies() async {
    final rows = await _client
        .from('agencies')
        .select('id,name')
        .eq('is_active', true)
        .order('name');
    return rows
        .whereType<Map<String, dynamic>>()
        .map(
          (row) => AgencyOption(
            id: row['id'].toString(),
            name: row['name']?.toString() ?? '',
          ),
        )
        .where((item) => item.name.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<ManagerRotaEntry>> loadTransportWeek({
    required UserSession session,
    required String weekStartYmd,
    required String location,
  }) async {
    requireTransportRead(session);
    final end = stageTwoYmd(
      DateTime.parse(weekStartYmd).add(const Duration(days: 6)),
    );
    final rows = await _client
        .from('scheduled_rota')
        .select('id,date,shift_type,location,user_id')
        .gte('date', weekStartYmd)
        .lte('date', end)
        .eq('location', location);
    final maps = rows.whereType<Map<String, dynamic>>().toList();
    final userIds = maps
        .map((row) => row['user_id']?.toString())
        .whereType<String>()
        .toSet()
        .toList();
    final profiles = await _profileNames(userIds);
    final ids = maps.map((row) => row['id'].toString()).toList();
    final attendance = <String, String>{};
    if (ids.isNotEmpty) {
      final attendanceRows = await _client
          .from('attendance')
          .select('scheduled_rota_id,status')
          .inFilter('scheduled_rota_id', ids);
      for (final row in attendanceRows.whereType<Map<String, dynamic>>()) {
        attendance[row['scheduled_rota_id'].toString()] =
            row['status']?.toString() ?? '';
      }
    }
    return maps
        .where((row) => row['user_id'] != null)
        .map((row) {
          final userId = row['user_id'].toString();
          return ManagerRotaEntry(
            id: row['id'].toString(),
            dateYmd: row['date']?.toString() ?? '',
            shift: row['shift_type']?.toString() ?? 'day',
            location: row['location']?.toString() ?? location,
            userId: userId,
            name: profiles[userId] ?? 'Unknown user',
            attendance: attendance[row['id'].toString()],
          );
        })
        .where((item) => item.dateYmd.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<StaffProfile>> loadUsers(UserSession session) async {
    requireAdmin(session);
    List<dynamic> rows;
    try {
      rows = await _client.rpc('get_admin_profiles_with_emails');
    } catch (_) {
      rows = await _client
          .from('profiles')
          .select(
            'id,first_name,last_name,email,yard_system_id,agency_id,shift_preference,is_active,preferred_location,custom_start_time,role,account_status,created_at,agencies(name)',
          );
    }
    return rows
        .whereType<Map<String, dynamic>>()
        .map(mapStaffProfile)
        .whereType<StaffProfile>()
        .toList(growable: false);
  }

  Future<List<StaffProfile>> loadPendingUsers(UserSession session) async {
    requireAdmin(session);
    final rows = await _client
        .from('profiles')
        .select(
          'id,first_name,last_name,email,yard_system_id,agency_id,shift_preference,is_active,preferred_location,custom_start_time,role,account_status,created_at,agencies(name)',
        )
        .eq('account_status', 'pending_approval')
        .order('created_at', ascending: false);
    return rows
        .whereType<Map<String, dynamic>>()
        .map(mapStaffProfile)
        .whereType<StaffProfile>()
        .toList(growable: false);
  }

  static StaffProfile? mapStaffProfile(Map<String, dynamic> row) {
    final id = row['id']?.toString() ?? '';
    if (id.isEmpty) return null;
    final agency = row['agencies'];
    return StaffProfile(
      id: id,
      firstName: row['first_name']?.toString() ?? '',
      lastName: row['last_name']?.toString() ?? '',
      email: row['email']?.toString() ?? '',
      yardSystemId: row['yard_system_id']?.toString(),
      agencyId: row['agency_id']?.toString(),
      agencyName:
          row['agency_name']?.toString() ??
          (agency is Map<String, dynamic> ? agency['name']?.toString() : null),
      shift: row['shift_preference']?.toString() ?? 'day',
      preferredLocation: row['preferred_location']?.toString(),
      customStartTime: _time(row['custom_start_time']),
      role: UserRole.fromDb(row['role']?.toString()),
      isActive: row['is_active'] != false,
      accountStatus: AccountStatus.fromDb(row['account_status']?.toString()),
      lastLogin: DateTime.tryParse(
        row['last_sign_in_at']?.toString() ??
            row['last_activity_at']?.toString() ??
            '',
      ),
      createdAt: DateTime.tryParse(row['created_at']?.toString() ?? ''),
    );
  }

  Future<void> updateUser(
    UserSession session,
    String userId,
    AdminProfileUpdate update,
  ) async {
    requireAdmin(session);
    await _client
        .from('profiles')
        .update(<String, dynamic>{
          'first_name': update.firstName.trim(),
          'last_name': update.lastName.trim(),
          'yard_system_id': _nullable(update.yardSystemId)?.toUpperCase(),
          'agency_id': _nullable(update.agencyId),
          'shift_preference': update.shift,
          'preferred_location': _nullable(update.preferredLocation),
          'custom_start_time': _nullable(update.customStartTime),
          'role': update.role.dbValue,
          'is_active': update.isActive,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', userId);
  }

  Future<void> setAccountStatus(
    UserSession session,
    String userId,
    AccountStatus status,
  ) async {
    requireAdmin(session);
    await _client
        .from('profiles')
        .update({'account_status': status.dbValue})
        .eq('id', userId);
  }

  Future<void> deactivateUser(UserSession session, String userId) async {
    requireAdmin(session);
    await _client
        .from('profiles')
        .update({'is_active': false})
        .eq('id', userId);
  }

  Future<void> deleteUser(UserSession session, String userId) async {
    requireAdmin(session);
    await _client.rpc('delete_user', params: {'user_id': userId});
  }

  Future<void> addViolation({
    required UserSession session,
    required String userId,
    required String body,
    String category = 'other',
  }) async {
    requireAdmin(session);
    await _client.from('shunter_violations').insert({
      'user_id': userId,
      'body': body.trim(),
      'category': category,
      'created_by': session.userId,
    });
  }

  Future<Map<String, Map<String, AdminAvailability>>> loadAvailabilityWeek({
    required UserSession session,
    required String weekStartYmd,
  }) async {
    requireAdmin(session);
    final end = stageTwoYmd(
      DateTime.parse(weekStartYmd).add(const Duration(days: 6)),
    );
    final rows = await _client
        .from('availability')
        .select('id,user_id,date,status,comment')
        .gte('date', weekStartYmd)
        .lte('date', end);
    final result = <String, Map<String, AdminAvailability>>{};
    for (final row in rows.whereType<Map<String, dynamic>>()) {
      final userId = row['user_id']?.toString() ?? '';
      final date = row['date']?.toString() ?? '';
      if (userId.isEmpty || date.isEmpty) continue;
      result.putIfAbsent(userId, () => {})[date] = AdminAvailability(
        id: row['id']?.toString(),
        userId: userId,
        dateYmd: date,
        status: AvailabilityStatus.fromDbValue(
          row['status']?.toString() ?? 'available',
        ),
        comment: row['comment']?.toString(),
      );
    }
    return result;
  }

  Future<void> saveUserAvailability({
    required UserSession session,
    required String userId,
    required String dateYmd,
    required AvailabilityStatus status,
    String? comment,
  }) async {
    requireAdmin(session);
    await _client.from('availability').upsert({
      'user_id': userId,
      'date': dateYmd,
      'status': status.dbValue,
      'comment': _nullable(comment),
    }, onConflict: 'user_id,date');
  }

  Future<List<RotaSlot>> loadRota({
    required UserSession session,
    required String startYmd,
    required String endYmd,
    required String location,
  }) async {
    requireAdmin(session);
    final rows = await _client
        .from('scheduled_rota')
        .select(
          'id,date,shift_type,location,start_time,end_time,capacity,user_id,status,task',
        )
        .gte('date', startYmd)
        .lte('date', endYmd)
        .eq('location', location)
        .order('date')
        .order('start_time');
    return _groupRota(rows.whereType<Map<String, dynamic>>().toList());
  }

  Future<List<StaffProfile>> loadAssignableStaff(UserSession session) =>
      loadUsers(session);

  Future<Map<String, AdminAvailability>> loadUserAvailability({
    required UserSession session,
    required String userId,
    required String startYmd,
    required String endYmd,
  }) async {
    requireAdmin(session);
    final rows = await _client
        .from('availability')
        .select('id,user_id,date,status,comment')
        .eq('user_id', userId)
        .gte('date', startYmd)
        .lte('date', endYmd);
    return {
      for (final row in rows.whereType<Map<String, dynamic>>())
        row['date'].toString(): AdminAvailability(
          id: row['id']?.toString(),
          userId: userId,
          dateYmd: row['date'].toString(),
          status: AvailabilityStatus.fromDbValue(
            row['status']?.toString() ?? 'available',
          ),
          comment: row['comment']?.toString(),
        ),
    };
  }

  Future<RotaSlot> createRotaSlot(
    UserSession session,
    RotaSlotDraft draft,
  ) async {
    requireAdmin(session);
    final row = await _client
        .from('scheduled_rota')
        .insert(_rotaPayload(draft)..['user_id'] = null)
        .select()
        .single();
    final grouped = await _groupRota([row]);
    return grouped.single;
  }

  Future<void> updateRotaSlot({
    required UserSession session,
    required RotaSlot original,
    required RotaSlotDraft draft,
  }) async {
    requireAdmin(session);
    await _client
        .from('scheduled_rota')
        .update(_rotaPayload(draft))
        .eq('date', original.dateYmd)
        .eq('shift_type', original.shift)
        .eq('location', original.location)
        .eq('start_time', original.startTime)
        .eq('end_time', original.endTime);
  }

  Future<void> deleteRotaSlot(UserSession session, RotaSlot slot) async {
    requireAdmin(session);
    await _client
        .from('scheduled_rota')
        .delete()
        .eq('date', slot.dateYmd)
        .eq('shift_type', slot.shift)
        .eq('location', slot.location)
        .eq('start_time', slot.startTime)
        .eq('end_time', slot.endTime);
  }

  Future<void> assignRotaStaff({
    required UserSession session,
    required RotaSlot slot,
    required String userId,
    String? task,
    int maximumConsecutiveDays = 6,
  }) async {
    requireAdmin(session);
    if (slot.assignments.any((item) => item.userId == userId)) return;
    final candidate = DateTime.parse(slot.dateYmd);
    final start = stageTwoYmd(
      candidate.subtract(Duration(days: maximumConsecutiveDays)),
    );
    final end = stageTwoYmd(
      candidate.add(Duration(days: maximumConsecutiveDays)),
    );
    final existing = await _client
        .from('scheduled_rota')
        .select('date')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);
    if (wouldExceedMaxConsecutiveDays(
      workedDates: existing.map((row) => row['date'].toString()),
      candidateYmd: slot.dateYmd,
      maximum: maximumConsecutiveDays,
    )) {
      throw StageTwoAuthorizationException(
        'Assignment exceeds $maximumConsecutiveDays consecutive work days.',
      );
    }
    await _client.from('scheduled_rota').insert({
      'date': slot.dateYmd,
      'shift_type': slot.shift,
      'location': slot.location,
      'start_time': slot.startTime,
      'end_time': slot.endTime,
      'capacity': slot.capacity,
      'status': slot.status,
      'user_id': userId,
      'task': _nullable(task),
    });
  }

  Future<void> unassignRotaStaff({
    required UserSession session,
    required String assignmentRowId,
  }) async {
    requireAdmin(session);
    await _client.from('scheduled_rota').delete().eq('id', assignmentRowId);
  }

  Future<void> copyPrevious({
    required UserSession session,
    required DateTime targetStart,
    required bool week,
    required String location,
  }) async {
    requireAdmin(session);
    final sourceStart = targetStart.subtract(const Duration(days: 7));
    final sourceEnd = week
        ? sourceStart.add(const Duration(days: 6))
        : sourceStart;
    final rows = await _client
        .from('scheduled_rota')
        .select(
          'date,shift_type,location,start_time,end_time,capacity,user_id,status,task',
        )
        .gte('date', stageTwoYmd(sourceStart))
        .lte('date', stageTwoYmd(sourceEnd))
        .eq('location', location);
    if (rows.isEmpty) return;
    await _client
        .from('scheduled_rota')
        .insert(
          rows.map((raw) {
            final row = Map<String, dynamic>.from(raw);
            row['date'] = stageTwoYmd(
              DateTime.parse(
                row['date'].toString(),
              ).add(const Duration(days: 7)),
            );
            return row;
          }).toList(),
        );
  }

  Future<List<RotaTemplate>> loadTemplates(UserSession session) async {
    requireAdmin(session);
    final rows = await _client
        .from('rota_templates')
        .select('id,name,slots')
        .order('name');
    return rows
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final slots = row['slots'] is List
              ? (row['slots'] as List)
                    .whereType<Map>()
                    .map((item) => Map<String, dynamic>.from(item))
                    .toList()
              : <Map<String, dynamic>>[];
          return RotaTemplate(
            id: row['id'].toString(),
            name: row['name']?.toString() ?? 'Template',
            slots: slots,
          );
        })
        .toList(growable: false);
  }

  Future<void> saveTemplate({
    required UserSession session,
    required String name,
    required List<RotaSlot> slots,
  }) async {
    requireAdmin(session);
    await _client.from('rota_templates').insert({
      'name': name.trim(),
      'slots': slots
          .map(
            (slot) => {
              'shift_type': slot.shift,
              'location': slot.location,
              'start_time': slot.startTime,
              'end_time': slot.endTime,
              'capacity': slot.capacity,
              'status': slot.status,
            },
          )
          .toList(),
    });
  }

  Future<void> applyTemplate({
    required UserSession session,
    required RotaTemplate template,
    required String dateYmd,
    required String location,
  }) async {
    requireAdmin(session);
    await _client
        .from('scheduled_rota')
        .insert(
          template.slots
              .map(
                (slot) => {
                  'date': dateYmd,
                  'shift_type': slot['shift_type'] ?? 'day',
                  'location': location,
                  'start_time': slot['start_time'] ?? '05:45',
                  'end_time': slot['end_time'] ?? '18:00',
                  'capacity': slot['capacity'] ?? 1,
                  'status': slot['status'],
                  'user_id': null,
                },
              )
              .toList(),
        );
  }

  Future<List<BreakSlot>> loadBreakSlots({
    required UserSession session,
    required String dateYmd,
    required String location,
    required String shift,
  }) async {
    requireAdmin(session);
    final rows = await _client
        .from('scheduled_breaks')
        .select(
          'id,user_id,date,break_start_time,break_duration_minutes,break_type,shift_type,location,capacity,std_slot_id',
        )
        .eq('date', dateYmd)
        .eq('location', location)
        .eq('shift_type', shift)
        .order('break_start_time');
    return _groupBreaks(rows.whereType<Map<String, dynamic>>().toList());
  }

  Future<void> createBreakSlot(
    UserSession session,
    BreakSlotDraft draft,
  ) async {
    requireAdmin(session);
    await _client.from('scheduled_breaks').insert({
      ..._breakPayload(draft),
      'user_id': null,
    });
  }

  Future<void> updateBreakSlot({
    required UserSession session,
    required BreakSlot original,
    required BreakSlotDraft draft,
  }) async {
    requireAdmin(session);
    await _client
        .from('scheduled_breaks')
        .update(_breakPayload(draft))
        .eq('date', original.dateYmd)
        .eq('location', original.location)
        .eq('shift_type', original.shift)
        .eq('break_start_time', original.startTime)
        .eq('break_duration_minutes', original.durationMinutes);
  }

  Future<void> deleteBreakSlot(UserSession session, BreakSlot slot) async {
    requireAdmin(session);
    await _client
        .from('scheduled_breaks')
        .delete()
        .eq('date', slot.dateYmd)
        .eq('location', slot.location)
        .eq('shift_type', slot.shift)
        .eq('break_start_time', slot.startTime)
        .eq('break_duration_minutes', slot.durationMinutes);
  }

  Future<void> assignBreakStaff({
    required UserSession session,
    required BreakSlot slot,
    required String userId,
  }) async {
    requireAdmin(session);
    if (slot.assignments.any((item) => item.userId == userId)) return;
    if (slot.capacity > 0 && slot.assignments.length >= slot.capacity) {
      throw const StageTwoAuthorizationException('This break slot is full.');
    }
    await _client.from('scheduled_breaks').insert({
      'user_id': userId,
      'date': slot.dateYmd,
      'break_start_time': slot.startTime,
      'break_duration_minutes': slot.durationMinutes,
      'break_type': slot.breakType,
      'shift_type': slot.shift,
      'location': slot.location,
    });
  }

  Future<void> unassignBreakStaff({
    required UserSession session,
    required String assignmentRowId,
  }) async {
    requireAdmin(session);
    await _client.from('scheduled_breaks').delete().eq('id', assignmentRowId);
  }

  Future<Map<String, String?>> loadAttendanceForUsers({
    required UserSession session,
    required String dateYmd,
    required Iterable<String> userIds,
  }) async {
    requireAdmin(session);
    final ids = userIds.toSet().toList();
    if (ids.isEmpty) return {};
    final rota = await _client
        .from('scheduled_rota')
        .select('id,user_id')
        .eq('date', dateYmd)
        .inFilter('user_id', ids);
    final byRota = {
      for (final row in rota) row['id'].toString(): row['user_id'].toString(),
    };
    if (byRota.isEmpty) return {};
    final attendance = await _client
        .from('attendance')
        .select('scheduled_rota_id,status')
        .inFilter('scheduled_rota_id', byRota.keys.toList());
    return {
      for (final row in attendance)
        byRota[row['scheduled_rota_id'].toString()]!: row['status']?.toString(),
    };
  }

  Future<Map<String, String>> _profileNames(List<String> userIds) async {
    if (userIds.isEmpty) return {};
    final rows = await _client
        .from('profiles')
        .select('id,first_name,last_name')
        .inFilter('id', userIds);
    return {
      for (final row in rows)
        row['id'].toString():
            '${row['first_name'] ?? ''} ${row['last_name'] ?? ''}'.trim(),
    };
  }

  Future<List<RotaSlot>> _groupRota(List<Map<String, dynamic>> rows) async {
    final names = await _profileNames(
      rows
          .map((row) => row['user_id']?.toString())
          .whereType<String>()
          .toSet()
          .toList(),
    );
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final row in rows) {
      final key =
          '${row['date']}|${row['shift_type']}|${row['location']}|${_time(row['start_time'])}|${_time(row['end_time'])}';
      grouped.putIfAbsent(key, () => []).add(row);
    }
    return grouped.values
        .map((items) {
          final row = items.first;
          return RotaSlot(
            id: row['id'].toString(),
            dateYmd: row['date']?.toString() ?? '',
            shift: row['shift_type']?.toString() ?? 'day',
            location: row['location']?.toString() ?? '',
            startTime: _time(row['start_time']) ?? '',
            endTime: _time(row['end_time']) ?? '',
            capacity: (row['capacity'] as num?)?.round() ?? 1,
            status: row['status']?.toString(),
            assignments: items
                .where((item) => item['user_id'] != null)
                .map(
                  (item) => RotaAssignment(
                    rowId: item['id'].toString(),
                    userId: item['user_id'].toString(),
                    name: names[item['user_id'].toString()] ?? 'Unknown user',
                    task: item['task']?.toString(),
                  ),
                )
                .toList(growable: false),
          );
        })
        .toList(growable: false);
  }

  Future<List<BreakSlot>> _groupBreaks(List<Map<String, dynamic>> rows) async {
    final names = await _profileNames(
      rows
          .map((row) => row['user_id']?.toString())
          .whereType<String>()
          .toSet()
          .toList(),
    );
    final attendance = await loadAttendanceForUsers(
      session: UserSession(
        userId: _client.auth.currentUser?.id ?? '',
        displayName: '',
        role: UserRole.admin,
      ),
      dateYmd: rows.isEmpty
          ? stageTwoYmd(DateTime.now())
          : rows.first['date'].toString(),
      userIds: names.keys,
    );
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final row in rows) {
      final key =
          '${row['date']}|${row['shift_type']}|${row['location']}|${_time(row['break_start_time'])}|${row['break_duration_minutes']}|${row['break_type']}';
      grouped.putIfAbsent(key, () => []).add(row);
    }
    return grouped.values
        .map((items) {
          final row = items.first;
          final definition = items.firstWhere(
            (item) => item['user_id'] == null,
            orElse: () => row,
          );
          return BreakSlot(
            id: definition['id'].toString(),
            dateYmd: row['date']?.toString() ?? '',
            shift: row['shift_type']?.toString() ?? 'day',
            location: row['location']?.toString() ?? '',
            startTime: _time(row['break_start_time']) ?? '',
            durationMinutes:
                (row['break_duration_minutes'] as num?)?.round() ?? 15,
            breakType: row['break_type']?.toString() ?? 'Break',
            capacity: (definition['capacity'] as num?)?.round() ?? 999,
            standardSlotId: definition['std_slot_id']?.toString(),
            assignments: items
                .where((item) => item['user_id'] != null)
                .map(
                  (item) => BreakAssignment(
                    rowId: item['id'].toString(),
                    userId: item['user_id'].toString(),
                    name: names[item['user_id'].toString()] ?? 'Unknown user',
                    attendance: attendance[item['user_id'].toString()],
                  ),
                )
                .toList(growable: false),
          );
        })
        .toList(growable: false);
  }

  static Map<String, dynamic> _rotaPayload(RotaSlotDraft draft) => {
    'date': draft.dateYmd,
    'shift_type': draft.shift,
    'location': draft.location,
    'start_time': draft.startTime,
    'end_time': draft.endTime,
    'capacity': draft.capacity,
    'status': draft.status,
  };

  static Map<String, dynamic> _breakPayload(BreakSlotDraft draft) => {
    'date': draft.dateYmd,
    'shift_type': draft.shift,
    'location': draft.location,
    'break_start_time': draft.startTime,
    'break_duration_minutes': draft.durationMinutes,
    'break_type': draft.breakType,
    'capacity': draft.capacity,
  };

  static String? _nullable(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  static String? _time(dynamic value) {
    final raw = value?.toString();
    return raw == null || raw.isEmpty
        ? null
        : raw.substring(0, raw.length < 5 ? raw.length : 5);
  }
}
