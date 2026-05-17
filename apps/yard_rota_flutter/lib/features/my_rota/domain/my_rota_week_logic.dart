import '../../../core/network/my_rota_models.dart';

/// Week aligned to **Saturday** start (same as PWA `WeeklyRotaPage`).

String myRotaToYmd(DateTime date) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

DateTime myRotaDateOnly(DateTime date) {
  return DateTime(date.year, date.month, date.day);
}

/// Last Saturday on or before [date] (calendar day in local time).
DateTime myRotaWeekStartSaturday(DateTime date) {
  final local = myRotaDateOnly(date);
  final jsDay = local.weekday % 7;
  final diff = jsDay == 6 ? 0 : jsDay + 1;
  return local.subtract(Duration(days: diff));
}

/// Seven `yyyy-MM-dd` keys from Saturday [weekStartSaturday] inclusive.
List<String> myRotaWeekDateYmds(DateTime weekStartSaturday) {
  final start = myRotaDateOnly(weekStartSaturday);
  return List<String>.generate(7, (i) {
    final d = start.add(Duration(days: i));
    return myRotaToYmd(d);
  });
}

DateTime? myRotaParseYmdLocal(String ymd) {
  final parts = ymd.split('-');
  if (parts.length != 3) {
    return null;
  }
  final year = int.tryParse(parts[0]);
  final month = int.tryParse(parts[1]);
  final day = int.tryParse(parts[2]);
  if (year == null || month == null || day == null) {
    return null;
  }
  return DateTime(year, month, day);
}

Duration? myRotaParseTimeOfDay(String raw) {
  final parts = raw.trim().split(':');
  if (parts.length < 2) {
    return null;
  }
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  final second = parts.length > 2 ? int.tryParse(parts[2]) ?? 0 : 0;
  if (hour == null ||
      minute == null ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59) {
    return null;
  }
  return Duration(hours: hour, minutes: minute, seconds: second);
}

DateTime myRotaShiftEndDateTime({
  required DateTime shiftDate,
  required Duration start,
  required Duration end,
}) {
  final endDateTime = shiftDate.add(end);
  if (end <= start) {
    return endDateTime.add(const Duration(days: 1));
  }
  return endDateTime;
}

MyRotaAnchorShift? pickMyRotaAnchorShift({
  required Iterable<MyRotaAnchorShift> shifts,
  required DateTime now,
}) {
  final candidates = <_MyRotaAnchorCandidate>[];
  for (final shift in shifts) {
    final date = myRotaParseYmdLocal(shift.dateYmd);
    final start = myRotaParseTimeOfDay(shift.startTime);
    final end = myRotaParseTimeOfDay(shift.endTime);
    if (date == null || start == null || end == null) {
      continue;
    }
    final startDateTime = date.add(start);
    final endDateTime = myRotaShiftEndDateTime(
      shiftDate: date,
      start: start,
      end: end,
    );
    candidates.add(
      _MyRotaAnchorCandidate(
        shift: shift,
        startDateTime: startDateTime,
        endDateTime: endDateTime,
      ),
    );
  }

  final active =
      candidates
          .where(
            (candidate) =>
                !candidate.startDateTime.isAfter(now) &&
                candidate.endDateTime.isAfter(now),
          )
          .toList()
        ..sort((a, b) {
          final startCompare = b.startDateTime.compareTo(a.startDateTime);
          if (startCompare != 0) {
            return startCompare;
          }
          return a.endDateTime.compareTo(b.endDateTime);
        });
  if (active.isNotEmpty) {
    return active.first.shift;
  }

  final future =
      candidates
          .where((candidate) => candidate.startDateTime.isAfter(now))
          .toList()
        ..sort((a, b) => a.startDateTime.compareTo(b.startDateTime));
  if (future.isNotEmpty) {
    return future.first.shift;
  }

  return null;
}

class _MyRotaAnchorCandidate {
  const _MyRotaAnchorCandidate({
    required this.shift,
    required this.startDateTime,
    required this.endDateTime,
  });

  final MyRotaAnchorShift shift;
  final DateTime startDateTime;
  final DateTime endDateTime;
}

/// Slots with profile and no attendance row count as "present".
int myRotaPresentCount(
  Iterable<MyRotaSlot> slots,
  Map<String, MyRotaAttendanceStatus> attendanceBySlotId,
) {
  var n = 0;
  for (final s in slots) {
    if (attendanceBySlotId[s.id] != null) {
      continue;
    }
    if (s.displayNameOrNull != null) {
      n++;
    }
  }
  return n;
}
