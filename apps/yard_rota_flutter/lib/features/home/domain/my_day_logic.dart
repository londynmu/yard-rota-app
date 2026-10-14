import '../../breaks/domain/break_models.dart';

/// One of the signed-in user's rota shifts.
class MyShift {
  const MyShift({
    required this.dateYmd,
    required this.startTime,
    required this.endTime,
    required this.shiftType,
    this.location = '',
    this.absence,
  });

  final String dateYmd;
  final String startTime;
  final String endTime;
  final String shiftType;
  final String location;

  /// Attendance label (e.g. 'Sick') when the shift is marked as missed.
  final String? absence;

  DateTime get start => MyDayLogic.atTime(dateYmd, startTime);

  DateTime get end {
    final value = MyDayLogic.atTime(dateYmd, endTime);
    return value.isAfter(start) ? value : value.add(const Duration(days: 1));
  }

  String get shiftLabel =>
      BreakShift.fromDb(shiftType.trim().toLowerCase())?.label ?? 'Shift';
}

/// One of the signed-in user's own breaks.
class MyBreak {
  const MyBreak({
    required this.dateYmd,
    required this.startTime,
    required this.durationMinutes,
    this.shiftType,
  });

  final String dateYmd;
  final String startTime;
  final int durationMinutes;
  final String? shiftType;

  /// Night breaks 00:00-06:59 are stored on the night start date but happen
  /// the following morning.
  DateTime get start {
    final value = MyDayLogic.atTime(dateYmd, startTime);
    final nextMorning =
        shiftType == BreakShift.night.dbValue &&
        value.hour < BreakWindowLogic.dayStartHour;
    return nextMorning ? value.add(const Duration(days: 1)) : value;
  }

  DateTime get end => start.add(Duration(minutes: durationMinutes));
}

enum MyBreakKind { none, upcoming, active, done }

class MyBreakStatus {
  const MyBreakStatus._(this.kind, {this.start, this.end, this.moreCount = 0});

  const MyBreakStatus.none() : this._(MyBreakKind.none);
  const MyBreakStatus.done() : this._(MyBreakKind.done);

  final MyBreakKind kind;
  final DateTime? start;
  final DateTime? end;

  /// Further breaks after the one shown.
  final int moreCount;
}

class MyDaySummary {
  const MyDaySummary({this.current, this.breakStatus, this.next});

  /// Shift that counts as "today"; `null` on a day off.
  final MyShift? current;
  final MyBreakStatus? breakStatus;

  /// First upcoming shift, only filled on a day off.
  final MyShift? next;
}

class MyDayLogic {
  const MyDayLogic._();

  /// Today's shift shows from one hour before it starts.
  static const Duration leadTime = Duration(hours: 1);

  static DateTime atTime(String dateYmd, String time) {
    final hm = time.length >= 5 ? time.substring(0, 5) : time;
    return DateTime.parse('${dateYmd}T$hm:00');
  }

  static MyDaySummary summarise({
    required List<MyShift> shifts,
    required List<MyBreak> breaks,
    required DateTime now,
  }) {
    final sorted = [...shifts]..sort((a, b) => a.start.compareTo(b.start));
    final current = pickCurrent(sorted, now);
    if (current != null) {
      return MyDaySummary(
        current: current,
        breakStatus: breakStatus(current, breaks, now),
      );
    }
    MyShift? next;
    for (final shift in sorted) {
      if (shift.start.isAfter(now)) {
        next = shift;
        break;
      }
    }
    return MyDaySummary(next: next);
  }

  /// Running shift (or one starting within [leadTime]); otherwise today's
  /// shift, so a finished day shift still reads "Breaks done".
  static MyShift? pickCurrent(List<MyShift> sorted, DateTime now) {
    for (final shift in sorted) {
      if (!now.isBefore(shift.start.subtract(leadTime)) &&
          now.isBefore(shift.end)) {
        return shift;
      }
    }
    final todayYmd = BreakWindowLogic.toYmd(now);
    final today = sorted.where((shift) => shift.dateYmd == todayYmd).toList();
    if (today.isEmpty) return null;
    return today.firstWhere(
      (shift) => shift.end.isAfter(now),
      orElse: () => today.last,
    );
  }

  static MyBreakStatus breakStatus(
    MyShift shift,
    List<MyBreak> breaks,
    DateTime now,
  ) {
    final mine =
        breaks
            .where(
              (item) =>
                  item.dateYmd == shift.dateYmd &&
                  (item.shiftType == null ||
                      item.shiftType == shift.shiftType.trim().toLowerCase()),
            )
            .toList()
          ..sort((a, b) => a.start.compareTo(b.start));
    if (mine.isEmpty) return const MyBreakStatus.none();

    final open = mine.where((item) => item.end.isAfter(now)).toList();
    if (open.isEmpty) return const MyBreakStatus.done();

    final first = open.first;
    return MyBreakStatus._(
      now.isBefore(first.start) ? MyBreakKind.upcoming : MyBreakKind.active,
      start: first.start,
      end: first.end,
      moreCount: open.length - 1,
    );
  }

  /// `45m`, `1h`, `1h 20m`; rounds up so "in 0m" never shows.
  static String formatDuration(Duration value) {
    final minutes = (value.inSeconds / 60).ceil().clamp(0, 1 << 30);
    if (minutes < 60) return '${minutes}m';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '${h}h' : '${h}h ${m}m';
  }

  static String formatTime(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
