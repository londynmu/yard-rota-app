import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/models.dart';
import '../../breaks/domain/break_models.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';
import '../domain/tm_break_now.dart';
import '../domain/transport_dashboard_models.dart';

class TransportDashboardRepository {
  TransportDashboardRepository(this._client);

  final SupabaseClient _client;

  void requireTransportRead(UserSession session) {
    if (!session.isAdmin && !session.isTransportManager) {
      throw const StageTwoAuthorizationException(
        'Transport dashboard access is required.',
      );
    }
  }

  Future<List<TransportStaffedLocation>> loadStaffedLocations({
    required UserSession session,
    required String dateYmd,
  }) async {
    requireTransportRead(session);
    final rows = await _client
        .from('scheduled_rota')
        .select('location')
        .eq('date', dateYmd);
    return locationsWithStaffToday(
      rows
          .whereType<Map<String, dynamic>>()
          .map((row) => row['location']?.toString()),
    );
  }

  Future<TransportTodaySnapshot> loadTodaySnapshot({
    required UserSession session,
    required String dateYmd,
    required String location,
    DateTime? now,
  }) async {
    requireTransportRead(session);
    // Match ShiftDashboard.jsx: device-local `new Date()` wall clock.
    final clock = now ?? DateTime.now();

    final rotaRows = await _client
        .from('scheduled_rota')
        .select('id, date, shift_type, user_id, location')
        .eq('date', dateYmd)
        .eq('location', location);

    final maps = rotaRows.whereType<Map<String, dynamic>>().toList();
    final userIds = maps
        .map((row) => row['user_id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();

    final profiles = await _loadProfiles(userIds);
    final slots = <TransportRotaSlotInput>[];
    final slotIds = <String>[];
    for (final row in maps) {
      final userId = row['user_id']?.toString();
      final id = row['id']?.toString();
      if (userId == null || userId.isEmpty || id == null || id.isEmpty) {
        continue;
      }
      slotIds.add(id);
      final profile = profiles[userId];
      slots.add(
        TransportRotaSlotInput(
          id: id,
          userId: userId,
          shift: row['shift_type']?.toString() ?? 'day',
          name: profile?.name ?? 'Unknown',
          showOnReports: profile?.showOnReports ?? true,
        ),
      );
    }

    final liveAttendance = <TransportAttendanceInput>[];
    if (slotIds.isNotEmpty) {
      final attendanceRows = await _client
          .from('attendance')
          .select('id, scheduled_rota_id, status, user_id')
          .inFilter('scheduled_rota_id', slotIds);
      final attendanceIds = <String>[];
      final byId = <String, Map<String, dynamic>>{};
      for (final row in attendanceRows.whereType<Map<String, dynamic>>()) {
        final id = row['id']?.toString();
        if (id == null || id.isEmpty) continue;
        attendanceIds.add(id);
        byId[id] = row;
      }
      final notes = await _loadNotesByAttendanceId(attendanceIds);
      for (final entry in byId.entries) {
        final row = entry.value;
        final status = row['status']?.toString() ?? '';
        liveAttendance.add(
          TransportAttendanceInput(
            id: entry.key,
            status: status,
            scheduledRotaId: row['scheduled_rota_id']?.toString(),
            userId: row['user_id']?.toString(),
            note: notes[entry.key],
          ),
        );
      }
    }

    final removedRows = await _client
        .from('attendance')
        .select('id, scheduled_rota_id, status, user_id, date, location, shift_type')
        .eq('date', dateYmd)
        .eq('location', location)
        .isFilter('scheduled_rota_id', null);

    final removedAttendance = <TransportAttendanceInput>[];
    final removedUserIds = <String>{};
    final removedAttendanceIds = <String>[];
    for (final row in removedRows.whereType<Map<String, dynamic>>()) {
      final id = row['id']?.toString();
      final status = row['status']?.toString() ?? '';
      final userId = row['user_id']?.toString();
      if (id == null || id.isEmpty || userId == null || userId.isEmpty) {
        continue;
      }
      if (!kTransportAbsenceStatuses.contains(status)) continue;
      removedAttendanceIds.add(id);
      removedUserIds.add(userId);
      removedAttendance.add(
        TransportAttendanceInput(
          id: id,
          status: status,
          scheduledRotaId: null,
          userId: userId,
          shift: row['shift_type']?.toString(),
        ),
      );
    }

    final removedProfiles = await _loadProfiles(removedUserIds.toList());
    final removedNotes = await _loadNotesByAttendanceId(removedAttendanceIds);
    final removedWithNotes = removedAttendance
        .map(
          (row) => TransportAttendanceInput(
            id: row.id,
            status: row.status,
            scheduledRotaId: row.scheduledRotaId,
            userId: row.userId,
            note: removedNotes[row.id] ?? row.note,
            shift: row.shift,
          ),
        )
        .toList(growable: false);

    final onBreak = await _loadOnBreakPeople(
      location: location,
      now: clock,
    );
    final performance = await loadPerformanceKpi(
      session: session,
      todayYmd: dateYmd,
    );

    final base = buildTransportTodaySnapshot(
      dateYmd: dateYmd,
      location: location,
      slots: slots,
      liveAttendance: liveAttendance,
      removedAttendance: removedWithNotes,
      removedNames: {
        for (final entry in removedProfiles.entries) entry.key: entry.value.name,
      },
      removedShowOnReports: {
        for (final entry in removedProfiles.entries)
          entry.key: entry.value.showOnReports,
      },
      onBreakPeople: onBreak,
    );

    return TransportTodaySnapshot(
      dateYmd: base.dateYmd,
      location: base.location,
      atWork: base.atWork,
      absences: base.absences,
      absentPeople: base.absentPeople,
      invisiblePeople: base.invisiblePeople,
      removedPeople: base.removedPeople,
      onBreakPeople: base.onBreakPeople,
      performance: performance,
    );
  }

  /// Read-only day rota for the Rota tab (present vs absent, no `late`).
  Future<TransportDayRotaSnapshot> loadDayRota({
    required UserSession session,
    required String dateYmd,
    required String location,
  }) async {
    requireTransportRead(session);

    final rotaRows = await _client
        .from('scheduled_rota')
        .select('id, date, shift_type, user_id, location')
        .eq('date', dateYmd)
        .eq('location', location);

    final maps = rotaRows.whereType<Map<String, dynamic>>().toList();
    final userIds = maps
        .map((row) => row['user_id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();
    final profiles = await _loadProfiles(userIds);

    final slotIds = <String>[];
    final slots = <({String id, String userId, String shift, String name})>[];
    for (final row in maps) {
      final userId = row['user_id']?.toString();
      final id = row['id']?.toString();
      if (userId == null || userId.isEmpty || id == null || id.isEmpty) {
        continue;
      }
      slotIds.add(id);
      slots.add((
        id: id,
        userId: userId,
        shift: row['shift_type']?.toString() ?? 'day',
        name: profiles[userId]?.name ?? 'Unknown',
      ));
    }

    final attendanceBySlot = <String, ({String status, String? note})>{};
    if (slotIds.isNotEmpty) {
      final attendanceRows = await _client
          .from('attendance')
          .select('id, scheduled_rota_id, status')
          .inFilter('scheduled_rota_id', slotIds);
      final byId = <String, Map<String, dynamic>>{};
      final attendanceIds = <String>[];
      for (final row in attendanceRows.whereType<Map<String, dynamic>>()) {
        final id = row['id']?.toString();
        if (id == null || id.isEmpty) continue;
        attendanceIds.add(id);
        byId[id] = row;
      }
      final notes = await _loadNotesByAttendanceId(attendanceIds);
      for (final entry in byId.entries) {
        final status = entry.value['status']?.toString() ?? '';
        if (!kTransportAbsenceStatuses.contains(status)) continue;
        final slotId = entry.value['scheduled_rota_id']?.toString();
        if (slotId == null || slotId.isEmpty) continue;
        attendanceBySlot[slotId] = (
          status: status,
          note: notes[entry.key],
        );
      }
    }

    final people = slots
        .map((slot) {
          final att = attendanceBySlot[slot.id];
          return TransportDayRotaPerson(
            userId: slot.userId,
            name: slot.name,
            shift: slot.shift,
            attendance: att?.status,
            note: att?.note,
          );
        })
        .toList(growable: false)
      ..sort((a, b) {
        final byShift = _shiftRank(a.shift).compareTo(_shiftRank(b.shift));
        if (byShift != 0) return byShift;
        return a.name.compareTo(b.name);
      });

    return TransportDayRotaSnapshot(
      dateYmd: dateYmd,
      location: location,
      people: people,
    );
  }

  /// Live Now + Upcoming breaks for the Breaks tab.
  Future<({List<TransportOnBreakPerson> now, List<TransportOnBreakPerson> upcoming})>
      loadLiveBreaks({
    required UserSession session,
    required String location,
    DateTime? now,
  }) async {
    requireTransportRead(session);
    final clock = now ?? DateTime.now();
    final inputs = await _loadBreakRowInputs(now: clock);
    return (
      now: tmActiveBreaksNow(rows: inputs, location: location, now: clock),
      upcoming: tmUpcomingBreaks(rows: inputs, location: location, now: clock),
    );
  }

  /// Yesterday moves (report_date = today) + week best chip.
  Future<TransportPerformanceKpi> loadPerformanceKpi({
    required UserSession session,
    required String todayYmd,
  }) async {
    requireTransportRead(session);

    final yesterdayRows = await _client
        .from('shunter_performance')
        .select('''
          user_id,
          number_of_moves,
          report_date,
          profiles:user_id (
            first_name,
            last_name,
            show_on_reports
          )
        ''')
        .eq('report_date', todayYmd);

    final today = DateTime.parse(todayYmd);
    final weekStart = stageTwoWeekStart(today);
    final weekDates = List.generate(
      7,
      (i) => stageTwoYmd(weekStart.add(Duration(days: i))),
    );

    final weekRows = await _client
        .from('shunter_performance')
        .select('''
          user_id,
          number_of_moves,
          report_date,
          profiles:user_id (
            first_name,
            last_name,
            show_on_reports
          )
        ''')
        .inFilter('report_date', weekDates);

    final weekAgg = aggregateTransportPerformance(
      weekRows.whereType<Map<String, dynamic>>(),
    );

    return aggregateTransportPerformance(
      yesterdayRows.whereType<Map<String, dynamic>>(),
      weekBest: weekAgg.best,
    );
  }

  /// Same path as [ShiftDashboard.jsx] team breaks → "On break now".
  Future<List<TransportOnBreakPerson>> _loadOnBreakPeople({
    required String location,
    required DateTime now,
  }) async {
    final inputs = await _loadBreakRowInputs(now: now);
    return tmActiveBreaksNow(rows: inputs, location: location, now: now);
  }

  Future<List<TmBreakRowInput>> _loadBreakRowInputs({
    required DateTime now,
  }) async {
    final dates = tmBreakQueryDates(now);
    final rows = await _client
        .from('scheduled_breaks')
        .select(
          'id, user_id, break_start_time, break_duration_minutes, break_type, shift_type, date, location',
        )
        .inFilter('date', dates)
        .order('break_start_time');

    final maps = rows.whereType<Map<String, dynamic>>().toList();
    final userIds = maps
        .map((row) => row['user_id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();
    if (userIds.isEmpty) return const <TmBreakRowInput>[];

    final profiles = await _loadProfiles(userIds);
    final inputs = <TmBreakRowInput>[];
    for (final row in maps) {
      final userId = row['user_id']?.toString();
      final id = row['id']?.toString() ?? '';
      final rawDate = row['date']?.toString();
      if (userId == null || userId.isEmpty || rawDate == null || rawDate.isEmpty) {
        continue;
      }
      if (profiles[userId] == null) continue;
      final durationRaw = row['break_duration_minutes'];
      final duration = durationRaw is num
          ? durationRaw.round()
          : int.tryParse(durationRaw?.toString() ?? '') ?? 0;
      inputs.add(
        TmBreakRowInput(
          id: id,
          userId: userId,
          dateYmd: BreakWindowLogic.normalizeYmd(rawDate),
          startTime: _time(row['break_start_time']) ?? '',
          durationMinutes: duration,
          shiftType: row['shift_type']?.toString() ?? '',
          name: profiles[userId]!.name,
          location: row['location']?.toString(),
          breakType: row['break_type']?.toString(),
        ),
      );
    }
    return inputs;
  }

  static int _shiftRank(String shift) {
    switch (shift) {
      case 'day':
        return 0;
      case 'afternoon':
        return 1;
      case 'night':
        return 2;
      default:
        return 9;
    }
  }

  Future<Map<String, _ProfileLite>> _loadProfiles(List<String> userIds) async {
    if (userIds.isEmpty) return {};
    final rows = await _client
        .from('profiles')
        .select('id, first_name, last_name, show_on_reports')
        .inFilter('id', userIds);
    final result = <String, _ProfileLite>{};
    for (final row in rows.whereType<Map<String, dynamic>>()) {
      final id = row['id']?.toString();
      if (id == null || id.isEmpty) continue;
      final name =
          '${row['first_name'] ?? ''} ${row['last_name'] ?? ''}'.trim();
      result[id] = _ProfileLite(
        name: name.isEmpty ? 'Unknown' : name,
        showOnReports: row['show_on_reports'] != false,
      );
    }
    return result;
  }

  Future<Map<String, String>> _loadNotesByAttendanceId(
    List<String> attendanceIds,
  ) async {
    if (attendanceIds.isEmpty) return {};
    final rows = await _client
        .from('attendance_notes')
        .select('attendance_id, note')
        .inFilter('attendance_id', attendanceIds);
    final result = <String, String>{};
    for (final row in rows.whereType<Map<String, dynamic>>()) {
      final id = row['attendance_id']?.toString();
      final note = row['note']?.toString().trim() ?? '';
      if (id == null || id.isEmpty || note.isEmpty) continue;
      result[id] = note;
    }
    return result;
  }

  static String? _time(dynamic value) {
    final raw = value?.toString();
    if (raw == null || raw.isEmpty) return null;
    return raw.length < 5 ? raw : raw.substring(0, 5);
  }
}

class _ProfileLite {
  const _ProfileLite({required this.name, required this.showOnReports});
  final String name;
  final bool showOnReports;
}
