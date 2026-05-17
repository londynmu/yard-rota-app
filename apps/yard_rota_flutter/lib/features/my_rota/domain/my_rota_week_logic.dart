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
