import '../../breaks/domain/break_models.dart';

/// Attendance statuses shown on the Transport Dashboard (no `late`).
const Set<String> kTransportAbsenceStatuses = {'no_show', 'sick', 'other'};

String transportAbsenceLabel(String status) => switch (status) {
  'no_show' => 'No show',
  'sick' => 'Sick',
  'other' => 'Other',
  _ => status.replaceAll('_', ' '),
};

/// Operational "today" — before 07:00 sticks to the previous calendar day.
String transportEffectiveTodayYmd([DateTime? now]) {
  final value = now ?? DateTime.now();
  final day = DateTime(value.year, value.month, value.day);
  if (value.hour < BreakWindowLogic.dayStartHour) {
    return BreakWindowLogic.toYmd(day.subtract(const Duration(days: 1)));
  }
  return BreakWindowLogic.toYmd(day);
}

/// Human-readable operational day, e.g. `Tuesday 24 Nov 2026`.
String transportFormatDisplayDate(String ymd) {
  final parts = ymd.split('-');
  if (parts.length != 3) return ymd;
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) return ymd;
  final dt = DateTime(year, month, day);
  const weekdays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  const months = [
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
  return '${weekdays[dt.weekday - 1]} $day ${months[month - 1]} $year';
}

class TransportStaffedLocation {
  const TransportStaffedLocation({required this.name, required this.count});

  final String name;
  final int count;
}

class TransportPersonRow {
  const TransportPersonRow({
    required this.userId,
    required this.name,
    this.status,
    this.note,
    this.shift,
  });

  final String userId;
  final String name;
  final String? status;
  final String? note;
  final String? shift;
}

class TransportOnBreakPerson {
  const TransportOnBreakPerson({
    required this.userId,
    required this.name,
    required this.start,
    required this.end,
    this.breakType,
  });

  final String userId;
  final String name;
  final DateTime start;
  final DateTime end;
  final String? breakType;

  int minutesLeft(DateTime now) {
    final left = end.difference(now).inMinutes;
    return left < 0 ? 0 : left;
  }
}

class TransportShiftCounts {
  const TransportShiftCounts({
    this.day = 0,
    this.afternoon = 0,
    this.night = 0,
  });

  final int day;
  final int afternoon;
  final int night;

  int get total => day + afternoon + night;

  int forShift(String shift) => switch (shift) {
    'day' => day,
    'afternoon' => afternoon,
    'night' => night,
    _ => 0,
  };
}

class TransportAbsenceCounts {
  const TransportAbsenceCounts({
    this.noShow = 0,
    this.sick = 0,
    this.other = 0,
  });

  final int noShow;
  final int sick;
  final int other;

  int get total => noShow + sick + other;
}

class TransportPerformanceEntry {
  const TransportPerformanceEntry({
    required this.userId,
    required this.name,
    required this.moves,
  });

  final String userId;
  final String name;
  final int moves;
}

/// Port of `aggregateYesterdayPerformance` (+ optional week best).
class TransportPerformanceKpi {
  const TransportPerformanceKpi({
    this.totalMoves = 0,
    this.best,
    this.worst,
    this.weekBest,
    this.hasData = false,
  });

  final int totalMoves;
  final TransportPerformanceEntry? best;
  final TransportPerformanceEntry? worst;
  final TransportPerformanceEntry? weekBest;
  final bool hasData;
}

class TransportTodaySnapshot {
  const TransportTodaySnapshot({
    required this.dateYmd,
    required this.location,
    required this.atWork,
    required this.absences,
    required this.absentPeople,
    required this.invisiblePeople,
    required this.removedPeople,
    required this.onBreakPeople,
    this.performance = const TransportPerformanceKpi(),
  });

  final String dateYmd;
  final String location;
  final TransportShiftCounts atWork;
  final TransportAbsenceCounts absences;
  final List<TransportPersonRow> absentPeople;
  final List<TransportPersonRow> invisiblePeople;
  final List<TransportPersonRow> removedPeople;
  final List<TransportOnBreakPerson> onBreakPeople;
  final TransportPerformanceKpi performance;

  int get onBreakCount => onBreakPeople.length;
  int get invisibleCount => invisiblePeople.length;
  int get removedCount => removedPeople.length;
}

class TransportDayRotaPerson {
  const TransportDayRotaPerson({
    required this.userId,
    required this.name,
    required this.shift,
    this.attendance,
    this.note,
  });

  final String userId;
  final String name;
  final String shift;
  final String? attendance;
  final String? note;

  bool get isAbsent =>
      attendance != null && kTransportAbsenceStatuses.contains(attendance);
}

class TransportDayRotaSnapshot {
  const TransportDayRotaSnapshot({
    required this.dateYmd,
    required this.location,
    required this.people,
  });

  final String dateYmd;
  final String location;
  final List<TransportDayRotaPerson> people;

  List<TransportDayRotaPerson> staff(String shift) => people
      .where((p) => p.shift == shift)
      .toList(growable: false);

  int presentCount(String shift) =>
      staff(shift).where((p) => !p.isAbsent).length;
}

class TransportRotaSlotInput {
  const TransportRotaSlotInput({
    required this.id,
    required this.userId,
    required this.shift,
    required this.name,
    required this.showOnReports,
  });

  final String id;
  final String userId;
  final String shift;
  final String name;
  final bool showOnReports;
}

class TransportAttendanceInput {
  const TransportAttendanceInput({
    required this.id,
    required this.status,
    this.scheduledRotaId,
    this.userId,
    this.note,
    this.shift,
  });

  final String id;
  final String status;
  final String? scheduledRotaId;
  final String? userId;
  final String? note;
  final String? shift;
}

/// Pure aggregation used by the repository and unit tests.
TransportTodaySnapshot buildTransportTodaySnapshot({
  required String dateYmd,
  required String location,
  required List<TransportRotaSlotInput> slots,
  required List<TransportAttendanceInput> liveAttendance,
  required List<TransportAttendanceInput> removedAttendance,
  required Map<String, String> removedNames,
  required Map<String, bool> removedShowOnReports,
  required List<TransportOnBreakPerson> onBreakPeople,
}) {
  final attendanceBySlot = <String, TransportAttendanceInput>{};
  for (final row in liveAttendance) {
    final slotId = row.scheduledRotaId;
    if (slotId == null || slotId.isEmpty) continue;
    if (!kTransportAbsenceStatuses.contains(row.status)) continue;
    attendanceBySlot[slotId] = row;
  }

  var day = 0;
  var afternoon = 0;
  var night = 0;
  var noShow = 0;
  var sick = 0;
  var other = 0;
  final absentPeople = <TransportPersonRow>[];
  final invisible = <TransportPersonRow>[];
  final seenInvisible = <String>{};

  for (final slot in slots) {
    final att = attendanceBySlot[slot.id];
    if (att == null) {
      switch (slot.shift) {
        case 'afternoon':
          afternoon += 1;
        case 'night':
          night += 1;
        default:
          day += 1;
      }
    } else {
      switch (att.status) {
        case 'no_show':
          noShow += 1;
        case 'sick':
          sick += 1;
        case 'other':
          other += 1;
      }
      absentPeople.add(
        TransportPersonRow(
          userId: slot.userId,
          name: slot.name,
          status: att.status,
          note: att.note,
          shift: slot.shift,
        ),
      );
    }

    if (!slot.showOnReports && seenInvisible.add(slot.userId)) {
      invisible.add(
        TransportPersonRow(
          userId: slot.userId,
          name: slot.name,
          shift: slot.shift,
        ),
      );
    }
  }

  final removedPeople = <TransportPersonRow>[];
  for (final row in removedAttendance) {
    if (!kTransportAbsenceStatuses.contains(row.status)) continue;
    final userId = row.userId;
    if (userId == null || userId.isEmpty) continue;
    final name = removedNames[userId] ?? 'Unknown';
    removedPeople.add(
      TransportPersonRow(
        userId: userId,
        name: name,
        status: row.status,
        note: row.note,
        shift: row.shift,
      ),
    );
    if (removedShowOnReports[userId] == false && seenInvisible.add(userId)) {
      invisible.add(TransportPersonRow(userId: userId, name: name));
    }
  }

  absentPeople.sort((a, b) => a.name.compareTo(b.name));
  invisible.sort((a, b) => a.name.compareTo(b.name));
  removedPeople.sort((a, b) => a.name.compareTo(b.name));

  return TransportTodaySnapshot(
    dateYmd: dateYmd,
    location: location,
    atWork: TransportShiftCounts(
      day: day,
      afternoon: afternoon,
      night: night,
    ),
    absences: TransportAbsenceCounts(
      noShow: noShow,
      sick: sick,
      other: other,
    ),
    absentPeople: absentPeople,
    invisiblePeople: invisible,
    removedPeople: removedPeople,
    onBreakPeople: onBreakPeople,
  );
}

TransportPerformanceKpi aggregateTransportPerformance(
  Iterable<Map<String, dynamic>> records, {
  TransportPerformanceEntry? weekBest,
}) {
  final byUser = <String, TransportPerformanceEntry>{};

  for (final row in records) {
    final userId = row['user_id']?.toString();
    if (userId == null || userId.isEmpty) continue;
    final profile = row['profiles'];
    final profileMap = profile is Map<String, dynamic> ? profile : row;
    if (profileMap['show_on_reports'] == false) continue;
    final moves = (row['number_of_moves'] as num?)?.round() ??
        int.tryParse(row['number_of_moves']?.toString() ?? '') ??
        0;
    final name =
        '${profileMap['first_name'] ?? ''} ${profileMap['last_name'] ?? ''}'
            .trim();
    final existing = byUser[userId];
    if (existing != null) {
      byUser[userId] = TransportPerformanceEntry(
        userId: userId,
        name: existing.name,
        moves: existing.moves + moves,
      );
    } else {
      byUser[userId] = TransportPerformanceEntry(
        userId: userId,
        name: name.isEmpty ? 'Unknown' : name,
        moves: moves,
      );
    }
  }

  if (byUser.isEmpty) {
    return TransportPerformanceKpi(weekBest: weekBest, hasData: false);
  }

  var totalMoves = 0;
  TransportPerformanceEntry? best;
  TransportPerformanceEntry? worst;
  for (final entry in byUser.values) {
    totalMoves += entry.moves;
    if (best == null || entry.moves > best.moves) best = entry;
    if (worst == null || entry.moves < worst.moves) worst = entry;
  }

  return TransportPerformanceKpi(
    totalMoves: totalMoves,
    best: best,
    worst: worst,
    weekBest: weekBest,
    hasData: true,
  );
}

/// Rugby first, NRC last; everyone else alphabetical in the middle.
int transportLocationSortRank(String name) {
  final key = name.trim().toLowerCase();
  if (key == 'rugby') return 0;
  if (key == 'nrc') return 2;
  return 1;
}

List<TransportStaffedLocation> locationsWithStaffToday(
  Iterable<String?> locations,
) {
  final counts = <String, int>{};
  for (final raw in locations) {
    final name = raw?.trim() ?? '';
    if (name.isEmpty) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  final result =
      counts.entries
          .map((e) => TransportStaffedLocation(name: e.key, count: e.value))
          .toList()
        ..sort((a, b) {
          final rank = transportLocationSortRank(
            a.name,
          ).compareTo(transportLocationSortRank(b.name));
          if (rank != 0) return rank;
          return a.name.compareTo(b.name);
        });
  return result;
}

String? resolveTransportLocationSelection({
  required List<TransportStaffedLocation> staffed,
  String? savedName,
}) {
  if (staffed.isEmpty) return null;
  if (savedName != null &&
      savedName.isNotEmpty &&
      staffed.any((item) => item.name == savedName)) {
    return savedName;
  }
  return staffed.first.name;
}
