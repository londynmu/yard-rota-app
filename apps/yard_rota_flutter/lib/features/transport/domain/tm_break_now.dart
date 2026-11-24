import '../../breaks/domain/break_models.dart';
import 'transport_dashboard_models.dart';

/// Port of `ShiftDashboard.jsx` break-window helpers (Calendar Breaks / "On break now").
/// Uses device-local wall clock — same as the PWA `new Date()` path.

int? tmParseTimeToMinutes(String? timeStr) {
  if (timeStr == null || timeStr.trim().isEmpty) return null;
  final normalized = timeStr.trim();
  final slice = normalized.length >= 5
      ? normalized.substring(0, 5)
      : normalized;
  final parts = slice.split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null) return null;
  return h * 60 + m;
}

String tmAddDaysYmd(String ymd, int days) {
  final base = BreakWindowLogic.localDateYmd(ymd);
  return BreakWindowLogic.toYmd(base.add(Duration(days: days)));
}

bool tmIsInNightWindow(DateTime now) =>
    now.hour >= BreakWindowLogic.nightStartHour ||
    now.hour < BreakWindowLogic.dayStartHour;

String tmToLocalYmd(DateTime now) => BreakWindowLogic.toYmd(now);

String tmNightStartYmd(DateTime now) {
  final today = BreakWindowLogic.dateOnly(now);
  if (now.hour < BreakWindowLogic.dayStartHour) {
    return BreakWindowLogic.toYmd(today.subtract(const Duration(days: 1)));
  }
  return BreakWindowLogic.toYmd(today);
}

/// Query dates for `scheduled_breaks` — mirrors ShiftDashboard `breakDates`.
List<String> tmBreakQueryDates(DateTime now) {
  final today = tmToLocalYmd(now);
  final nightStart = tmNightStartYmd(now);
  if (tmIsInNightWindow(now)) {
    return <String>{today, nightStart}.toList()..sort();
  }
  return <String>{today, nightStart, tmAddDaysYmd(nightStart, 1)}.toList()
    ..sort();
}

/// Keep rows that belong to the open window — mirrors ShiftDashboard filter on `breaksRaw`.
bool tmBreakBelongsToOpenWindow({
  required String shiftType,
  required String dateYmd,
  required DateTime now,
}) {
  final today = tmToLocalYmd(now);
  final nightStart = tmNightStartYmd(now);
  final inNight = tmIsInNightWindow(now);
  final date = BreakWindowLogic.normalizeYmd(dateYmd);
  final shift = shiftType.trim().toLowerCase();
  if (shift == 'day' || shift == 'afternoon') {
    return date == today && !inNight;
  }
  if (shift == 'night') {
    return date == nightStart;
  }
  return false;
}

String? tmBreakWallDateYmd({
  required String dateYmd,
  required String shiftType,
  required String? breakStartTime,
  required DateTime now,
}) {
  final date = BreakWindowLogic.normalizeYmd(dateYmd);
  final nightStart = tmNightStartYmd(now);
  final minutes = tmParseTimeToMinutes(breakStartTime);
  final isEarlyMorning =
      minutes != null && minutes < BreakWindowLogic.dayStartHour * 60;
  if (shiftType.trim().toLowerCase() == 'night' &&
      isEarlyMorning &&
      date == nightStart) {
    return tmAddDaysYmd(date, 1);
  }
  return date;
}

/// Minutes from local midnight today to the break's real wall-clock start.
int? tmBreakStartOnTimeline({
  required String dateYmd,
  required String shiftType,
  required String? breakStartTime,
  required DateTime now,
}) {
  final minutes = tmParseTimeToMinutes(breakStartTime);
  if (minutes == null) return null;
  final todayYmd = tmToLocalYmd(now);
  final wallDate = tmBreakWallDateYmd(
    dateYmd: dateYmd,
    shiftType: shiftType,
    breakStartTime: breakStartTime,
    now: now,
  );
  if (wallDate == null) return minutes;
  final wall = BreakWindowLogic.localDateYmd(wallDate);
  final today = BreakWindowLogic.localDateYmd(todayYmd);
  final dayOffset = wall.difference(today).inDays;
  return minutes + dayOffset * 24 * 60;
}

class TmBreakRowInput {
  const TmBreakRowInput({
    required this.id,
    required this.userId,
    required this.dateYmd,
    required this.startTime,
    required this.durationMinutes,
    required this.shiftType,
    required this.name,
    this.location,
    this.breakType,
  });

  final String id;
  final String userId;
  final String dateYmd;
  final String startTime;
  final int durationMinutes;
  final String shiftType;
  final String name;
  final String? location;
  final String? breakType;
}

/// Active "On break now" list — same predicate as ShiftDashboard:
/// `nowMinutes >= start && nowMinutes < end`.
List<TransportOnBreakPerson> tmActiveBreaksNow({
  required List<TmBreakRowInput> rows,
  required String location,
  required DateTime now,
}) {
  final nowMinutes = now.hour * 60 + now.minute;
  final out = <TransportOnBreakPerson>[];

  for (final row in rows) {
    if (row.userId.isEmpty) continue;
    if (!tmBreakBelongsToOpenWindow(
      shiftType: row.shiftType,
      dateYmd: row.dateYmd,
      now: now,
    )) {
      continue;
    }
    if (!BreakWindowLogic.sameLocation(row.location, location)) continue;

    final start = tmBreakStartOnTimeline(
      dateYmd: row.dateYmd,
      shiftType: row.shiftType,
      breakStartTime: row.startTime,
      now: now,
    );
    if (start == null) continue;
    final end = start + row.durationMinutes;
    if (nowMinutes < start || nowMinutes >= end) continue;

    final startClock = _minutesToClock(start);
    final endClock = _minutesToClock(end);
    final today = BreakWindowLogic.dateOnly(now);
    out.add(
      TransportOnBreakPerson(
        userId: row.userId,
        name: row.name,
        start: today.add(Duration(minutes: startClock)),
        end: today.add(Duration(minutes: endClock)),
        breakType: row.breakType,
      ),
    );
  }

  out.sort((a, b) {
    final byStart = a.start.compareTo(b.start);
    if (byStart != 0) return byStart;
    return a.name.compareTo(b.name);
  });
  return out;
}

/// Upcoming breaks (start after now) — ShiftDashboard `upcomingEntries`.
List<TransportOnBreakPerson> tmUpcomingBreaks({
  required List<TmBreakRowInput> rows,
  required String location,
  required DateTime now,
  int withinMinutes = 120,
}) {
  final nowMinutes = now.hour * 60 + now.minute;
  final out = <TransportOnBreakPerson>[];

  for (final row in rows) {
    if (row.userId.isEmpty) continue;
    if (!tmBreakBelongsToOpenWindow(
      shiftType: row.shiftType,
      dateYmd: row.dateYmd,
      now: now,
    )) {
      continue;
    }
    if (!BreakWindowLogic.sameLocation(row.location, location)) continue;

    final start = tmBreakStartOnTimeline(
      dateYmd: row.dateYmd,
      shiftType: row.shiftType,
      breakStartTime: row.startTime,
      now: now,
    );
    if (start == null) continue;
    if (start <= nowMinutes) continue;
    if (start > nowMinutes + withinMinutes) continue;

    final end = start + row.durationMinutes;
    final today = BreakWindowLogic.dateOnly(now);
    out.add(
      TransportOnBreakPerson(
        userId: row.userId,
        name: row.name,
        start: today.add(Duration(minutes: _minutesToClock(start))),
        end: today.add(Duration(minutes: _minutesToClock(end))),
        breakType: row.breakType,
      ),
    );
  }

  out.sort((a, b) {
    final byStart = a.start.compareTo(b.start);
    if (byStart != 0) return byStart;
    return a.name.compareTo(b.name);
  });
  return out;
}

int _minutesToClock(int timelineMinutes) {
  final normalized = ((timelineMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return normalized;
}

/// One break slot window with assigned shunters.
class TmBreakSlotGroup {
  const TmBreakSlotGroup({
    required this.start,
    required this.end,
    required this.people,
    this.breakType,
  });

  final DateTime start;
  final DateTime end;
  final List<TransportOnBreakPerson> people;
  final String? breakType;

  int get count => people.length;

  String get titleLabel => tmBreakSlotTitleLabel(breakType);
}

/// Live breaks board: earliest active slot + next upcoming slot.
class TmLiveBreakBoardView {
  const TmLiveBreakBoardView({
    this.current,
    this.next,
  });

  final TmBreakSlotGroup? current;
  final TmBreakSlotGroup? next;
}

String tmBreakClockLabel(DateTime time) {
  final h = time.hour.toString().padLeft(2, '0');
  final m = time.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

String tmBreakSlotTimeRange(DateTime start, DateTime end) =>
    '${tmBreakClockLabel(start)}–${tmBreakClockLabel(end)}';

String tmBreakPeopleCountLabel(int count) {
  if (count == 1) return '1 person';
  return '$count people';
}

String tmBreakSlotMinutesLeftLabel(DateTime end, DateTime now) {
  final minutes = end.difference(now).inMinutes;
  if (minutes <= 0) return 'Ending…';
  if (minutes == 1) return '1 minute left';
  return '$minutes minutes left';
}

/// Human slot title from DB `break_type` (e.g. Break 1 → "1st break").
String tmBreakSlotTitleLabel(String? breakType) {
  final raw = (breakType ?? '').trim();
  if (raw.isEmpty) return 'Break';
  final lower = raw.toLowerCase();

  final ordinal = _breakOrdinalFromType(lower);
  if (ordinal != null) return _ordinalBreakLabel(ordinal);

  if (lower.contains('night')) return 'Night break';
  if (lower.contains('afternoon')) return 'Afternoon break';

  final cleaned = raw.replaceAll(RegExp(r'\s*\(\d+\s*min\)\s*', caseSensitive: false), '').trim();
  return cleaned.isEmpty ? 'Break' : cleaned;
}

int? _breakOrdinalFromType(String lower) {
  if (lower.contains('break 1') ||
      lower == 'meal1' ||
      (RegExp(r'\b1\b').hasMatch(lower) && lower.contains('break'))) {
    return 1;
  }
  if (lower.contains('break 2') ||
      lower == 'meal2' ||
      (RegExp(r'\b2\b').hasMatch(lower) && lower.contains('break'))) {
    return 2;
  }
  if (lower.contains('break 3') ||
      lower == 'meal3' ||
      (RegExp(r'\b3\b').hasMatch(lower) && lower.contains('break'))) {
    return 3;
  }
  final meal = RegExp(r'^meal(\d+)$').firstMatch(lower);
  if (meal != null) return int.tryParse(meal.group(1)!);
  return null;
}

String _ordinalBreakLabel(int n) {
  final suffix = switch (n) {
    1 => 'st',
    2 => 'nd',
    3 => 'rd',
    _ => 'th',
  };
  return '$n$suffix break';
}

/// Group shunters by identical start/end windows.
List<TmBreakSlotGroup> tmGroupBreaksBySlot(
  List<TransportOnBreakPerson> people,
) {
  final bucket = <String, List<TransportOnBreakPerson>>{};
  for (final person in people) {
    final key =
        '${person.start.millisecondsSinceEpoch}_${person.end.millisecondsSinceEpoch}';
    bucket.putIfAbsent(key, () => []).add(person);
  }

  final groups = bucket.values.map((list) {
    final sorted = List<TransportOnBreakPerson>.from(list)
      ..sort((a, b) => a.name.compareTo(b.name));
    return TmBreakSlotGroup(
      start: sorted.first.start,
      end: sorted.first.end,
      people: sorted,
      breakType: sorted.first.breakType,
    );
  }).toList(growable: false)
    ..sort((a, b) => a.start.compareTo(b.start));
  return groups;
}

/// Picks the earliest active slot and the earliest upcoming slot.
TmLiveBreakBoardView tmBuildLiveBreakBoardView({
  required List<TransportOnBreakPerson> now,
  required List<TransportOnBreakPerson> upcoming,
}) {
  final active = tmGroupBreaksBySlot(now);
  final later = tmGroupBreaksBySlot(upcoming);
  return TmLiveBreakBoardView(
    current: active.isEmpty ? null : active.first,
    next: later.isEmpty ? null : later.first,
  );
}
