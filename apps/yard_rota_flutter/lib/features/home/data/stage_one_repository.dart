import 'package:supabase_flutter/supabase_flutter.dart';

import '../../breaks/domain/break_models.dart';

class TodayShiftSummary {
  const TodayShiftSummary({
    required this.dateYmd,
    required this.startTime,
    required this.endTime,
    required this.location,
    required this.shiftType,
  });

  final String dateYmd;
  final String startTime;
  final String endTime;
  final String location;
  final String shiftType;
}

class MonthlyShunterAward {
  const MonthlyShunterAward({
    required this.id,
    required this.monthYmd,
    required this.period,
    required this.winnerName,
  });

  final String id;
  final String monthYmd;
  final String period;
  final String winnerName;
}

class InductionSection {
  const InductionSection({
    required this.id,
    required this.sortOrder,
    required this.title,
    required this.body,
  });

  final String id;
  final int sortOrder;
  final String title;
  final String body;
}

class StageOneNotification {
  const StageOneNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.createdAt,
    required this.isRead,
  });

  final String id;
  final String title;
  final String message;
  final String type;
  final DateTime createdAt;
  final bool isRead;
}

class StageOneRepository {
  StageOneRepository(this._client);

  final SupabaseClient _client;

  Future<List<ScheduledBreak>> loadBreaks({DateTime? now}) async {
    final instant = now ?? DateTime.now();
    final dates = BreakWindowLogic.queryDates(instant).toList()..sort();
    final rawBreaks = await _client
        .from('scheduled_breaks')
        .select(
          'id,user_id,date,break_start_time,break_duration_minutes,break_type,shift_type,location',
        )
        .inFilter('date', dates)
        .not('user_id', 'is', null);

    final userIds = rawBreaks
        .map((row) => row['user_id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList();
    if (userIds.isEmpty) return const <ScheduledBreak>[];

    final profileRows = await _client
        .from('profiles')
        .select('id,first_name,last_name')
        .inFilter('id', userIds);
    final profiles = <String, Map<String, dynamic>>{
      for (final row in profileRows.whereType<Map<String, dynamic>>())
        if (row['id'] != null) row['id'].toString(): row,
    };

    final rotaRows = await _client
        .from('scheduled_rota')
        .select('id,user_id,date,location')
        .inFilter('date', dates)
        .inFilter('user_id', userIds);
    final rotaIds = rotaRows
        .map((row) => row['id']?.toString())
        .whereType<String>()
        .toList();
    final absentUserIds = <String>{};
    if (rotaIds.isNotEmpty) {
      final attendanceRows = await _client
          .from('attendance')
          .select('scheduled_rota_id')
          .inFilter('scheduled_rota_id', rotaIds);
      final absentRotaIds = attendanceRows
          .map((row) => row['scheduled_rota_id']?.toString())
          .whereType<String>()
          .toSet();
      for (final row in rotaRows) {
        if (absentRotaIds.contains(row['id']?.toString())) {
          final userId = row['user_id']?.toString();
          if (userId != null) absentUserIds.add(userId);
        }
      }
    }

    final locationByUserDate = <String, String>{};
    for (final row in rotaRows) {
      final userId = row['user_id']?.toString();
      final date = row['date']?.toString();
      final location = row['location']?.toString();
      if (userId != null && date != null && location != null) {
        locationByUserDate['$userId:$date'] = location;
      }
    }

    return rawBreaks
        .whereType<Map<String, dynamic>>()
        .where((row) => !absentUserIds.contains(row['user_id']?.toString()))
        .map(
          (row) => mapScheduledBreak(
            row,
            profile: profiles[row['user_id']?.toString()],
            fallbackLocation:
                locationByUserDate['${row['user_id']}:${row['date']}'],
          ),
        )
        .whereType<ScheduledBreak>()
        .toList(growable: false);
  }

  Future<TodayShiftSummary?> loadTodayShift({
    required String userId,
    DateTime? now,
  }) async {
    final instant = now ?? DateTime.now();
    final today = BreakWindowLogic.dateOnly(instant);
    final dates = <String>[
      BreakWindowLogic.toYmd(today.subtract(const Duration(days: 1))),
      BreakWindowLogic.toYmd(today),
    ];
    final rows = await _client
        .from('scheduled_rota')
        .select('date,start_time,end_time,location,shift_type')
        .eq('user_id', userId)
        .inFilter('date', dates)
        .order('date', ascending: false)
        .order('start_time');
    final candidates = rows
        .whereType<Map<String, dynamic>>()
        .map(mapTodayShift)
        .whereType<TodayShiftSummary>()
        .toList();
    for (final shift in candidates) {
      final start = _dateTime(shift.dateYmd, shift.startTime);
      var end = _dateTime(shift.dateYmd, shift.endTime);
      if (!end.isAfter(start)) end = end.add(const Duration(days: 1));
      if (!instant.isBefore(start.subtract(const Duration(hours: 1))) &&
          instant.isBefore(end)) {
        return shift;
      }
    }
    for (final shift in candidates.reversed) {
      if (shift.dateYmd == dates.last) return shift;
    }
    return null;
  }

  Future<bool> needsPreCheck({required String userId, DateTime? now}) async {
    final instant = now ?? DateTime.now();
    final shift = await loadTodayShift(userId: userId, now: instant);
    if (shift == null) return false;
    final start = _dateTime(shift.dateYmd, shift.startTime);
    var end = _dateTime(shift.dateYmd, shift.endTime);
    if (!end.isAfter(start)) end = end.add(const Duration(days: 1));
    if (instant.isAfter(end)) return false;
    final existing = await _client
        .from('precheck_submissions')
        .select('id')
        .eq('user_id', userId)
        .eq('check_type', 'pre_shift')
        .gte('check_time', start.toUtc().toIso8601String())
        .lte('check_time', end.toUtc().toIso8601String())
        .limit(1)
        .maybeSingle();
    return existing == null;
  }

  Future<List<MonthlyShunterAward>> loadRecentAwards({DateTime? now}) async {
    final instant = now ?? DateTime.now();
    final from = DateTime(instant.year, instant.month - 3, 1);
    final to = DateTime(instant.year, instant.month, 1);
    final rows = await _client
        .from('monthly_shunter_awards')
        .select('id,award_month,period,profiles:user_id(first_name,last_name)')
        .gte('award_month', BreakWindowLogic.toYmd(from))
        .lte('award_month', BreakWindowLogic.toYmd(to))
        .order('award_month', ascending: false)
        .order('period');
    return rows
        .whereType<Map<String, dynamic>>()
        .map(mapAward)
        .whereType<MonthlyShunterAward>()
        .toList(growable: false);
  }

  Future<List<InductionSection>> loadInductionSections() async {
    final rows = await _client
        .from('shunter_induction_sections')
        .select('id,sort_order,title,body_markdown')
        .eq('is_published', true)
        .order('sort_order')
        .order('id');
    return rows
        .whereType<Map<String, dynamic>>()
        .map(mapInductionSection)
        .whereType<InductionSection>()
        .toList(growable: false);
  }

  Future<List<StageOneNotification>> loadNotifications() async {
    final rows = await _client
        .from('notifications')
        .select('id,title,message,type,is_read,created_at')
        .order('created_at', ascending: false)
        .limit(100);
    return rows
        .whereType<Map<String, dynamic>>()
        .map(mapNotification)
        .whereType<StageOneNotification>()
        .toList(growable: false);
  }

  Future<void> markNotificationsRead(List<String> ids) async {
    if (ids.isEmpty) return;
    await _client
        .from('notifications')
        .update({'is_read': true})
        .inFilter('id', ids);
  }

  Future<int> pendingApprovalsCount() async {
    final rows = await _client
        .from('profiles')
        .select('id')
        .eq('account_status', 'pending_approval');
    return rows.length;
  }

  Future<void> trackPageVisit({
    required String userId,
    required String path,
    required String title,
    required String sessionId,
  }) async {
    await _client.from('page_visits').insert(<String, dynamic>{
      'user_id': userId,
      'page_path': path,
      'page_title': title,
      'session_id': sessionId,
      'visited_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  static ScheduledBreak? mapScheduledBreak(
    Map<String, dynamic> row, {
    Map<String, dynamic>? profile,
    String? fallbackLocation,
  }) {
    final shift = BreakShift.fromDb(row['shift_type']?.toString());
    final id = row['id']?.toString() ?? '';
    final userId = row['user_id']?.toString() ?? '';
    final date = row['date']?.toString() ?? '';
    final start = _timeText(row['break_start_time']);
    if (shift == null ||
        id.isEmpty ||
        userId.isEmpty ||
        date.isEmpty ||
        start.isEmpty) {
      return null;
    }
    return ScheduledBreak(
      id: id,
      userId: userId,
      dateYmd: date,
      startTime: start,
      durationMinutes: (row['break_duration_minutes'] as num?)?.round() ?? 0,
      shift: shift,
      firstName: profile?['first_name']?.toString() ?? '',
      lastName: profile?['last_name']?.toString() ?? '',
      location: row['location']?.toString() ?? fallbackLocation,
      breakType: row['break_type']?.toString(),
    );
  }

  static TodayShiftSummary? mapTodayShift(Map<String, dynamic> row) {
    final date = row['date']?.toString() ?? '';
    final start = _timeText(row['start_time']);
    final end = _timeText(row['end_time']);
    if (date.isEmpty || start.isEmpty || end.isEmpty) return null;
    return TodayShiftSummary(
      dateYmd: date,
      startTime: start,
      endTime: end,
      location: row['location']?.toString() ?? 'Unknown location',
      shiftType: row['shift_type']?.toString() ?? 'shift',
    );
  }

  static MonthlyShunterAward? mapAward(Map<String, dynamic> row) {
    final id = row['id']?.toString() ?? '';
    final month = row['award_month']?.toString() ?? '';
    final period = row['period']?.toString() ?? '';
    final profile = row['profiles'];
    final profileMap = profile is Map<String, dynamic> ? profile : null;
    final winner = [
      profileMap?['first_name']?.toString(),
      profileMap?['last_name']?.toString(),
    ].whereType<String>().where((value) => value.trim().isNotEmpty).join(' ');
    if (id.isEmpty || month.isEmpty || winner.isEmpty) return null;
    return MonthlyShunterAward(
      id: id,
      monthYmd: month,
      period: period,
      winnerName: winner,
    );
  }

  static InductionSection? mapInductionSection(Map<String, dynamic> row) {
    final id = row['id']?.toString() ?? '';
    final title = row['title']?.toString() ?? '';
    if (id.isEmpty || title.isEmpty) return null;
    return InductionSection(
      id: id,
      sortOrder: (row['sort_order'] as num?)?.round() ?? 0,
      title: title,
      body: row['body_markdown']?.toString() ?? '',
    );
  }

  static StageOneNotification? mapNotification(Map<String, dynamic> row) {
    final id = row['id']?.toString() ?? '';
    final title = row['title']?.toString() ?? '';
    final createdAt = DateTime.tryParse(row['created_at']?.toString() ?? '');
    if (id.isEmpty || title.isEmpty || createdAt == null) return null;
    return StageOneNotification(
      id: id,
      title: title,
      message: row['message']?.toString() ?? '',
      type: row['type']?.toString() ?? 'info',
      createdAt: createdAt,
      isRead: row['is_read'] == true,
    );
  }

  static String _timeText(dynamic value) {
    final raw = value?.toString() ?? '';
    return raw.length >= 5 ? raw.substring(0, 5) : raw;
  }

  static DateTime _dateTime(String dateYmd, String time) =>
      DateTime.parse('${dateYmd}T${_timeText(time)}:00');
}
