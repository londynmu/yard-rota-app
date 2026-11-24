import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

enum BreakShift {
  day('day', 'Day'),
  afternoon('afternoon', 'Afternoon'),
  night('night', 'Night');

  const BreakShift(this.dbValue, this.label);

  final String dbValue;
  final String label;

  static BreakShift? fromDb(String? value) {
    final normalized = value?.trim().toLowerCase();
    for (final shift in values) {
      if (shift.dbValue == normalized) return shift;
    }
    return null;
  }
}

class ScheduledBreak {
  const ScheduledBreak({
    required this.id,
    required this.userId,
    required this.dateYmd,
    required this.startTime,
    required this.durationMinutes,
    required this.shift,
    required this.firstName,
    required this.lastName,
    this.location,
    this.breakType,
  });

  final String id;
  final String userId;
  final String dateYmd;
  final String startTime;
  final int durationMinutes;
  final BreakShift shift;
  final String firstName;
  final String lastName;
  final String? location;
  final String? breakType;

  String get displayName {
    final value = '$firstName $lastName'.trim();
    return value.isEmpty ? 'Unknown shunter' : value;
  }
}

class VisibleBreak {
  const VisibleBreak({
    required this.breakItem,
    required this.start,
    required this.end,
    required this.isActive,
  });

  final ScheduledBreak breakItem;
  final DateTime start;
  final DateTime end;
  final bool isActive;
}

class BreakFilters {
  const BreakFilters({
    this.location,
    this.day = true,
    this.afternoon = true,
    this.night = true,
  });

  /// Default filter for a user: their profile hub (when it is still an active
  /// location) and only their profile shift. Missing values mean "all".
  factory BreakFilters.forProfile({
    required String? location,
    required String? shift,
    required List<String> activeLocations,
  }) {
    final wanted = location?.trim().toLowerCase();
    String? matched;
    if (wanted != null && wanted.isNotEmpty) {
      for (final name in activeLocations) {
        if (name.trim().toLowerCase() == wanted) {
          matched = name;
          break;
        }
      }
    }
    final preferred = BreakShift.fromDb(shift?.trim().toLowerCase());
    return BreakFilters(
      location: matched,
      day: preferred == null || preferred == BreakShift.day,
      afternoon: preferred == null || preferred == BreakShift.afternoon,
      night: preferred == null || preferred == BreakShift.night,
    );
  }

  final String? location;
  final bool day;
  final bool afternoon;
  final bool night;

  bool get allShifts => day && afternoon && night;
  bool get showsEverything => location == null && allShifts;

  bool includes(BreakShift shift) => switch (shift) {
    BreakShift.day => day,
    BreakShift.afternoon => afternoon,
    BreakShift.night => night,
  };

  BreakFilters withLocation(String? value) => BreakFilters(
    location: value,
    day: day,
    afternoon: afternoon,
    night: night,
  );

  BreakFilters toggleShift(BreakShift shift) => BreakFilters(
    location: location,
    day: shift == BreakShift.day ? !day : day,
    afternoon: shift == BreakShift.afternoon ? !afternoon : afternoon,
    night: shift == BreakShift.night ? !night : night,
  );

  @override
  bool operator ==(Object other) =>
      other is BreakFilters &&
      other.location == location &&
      other.day == day &&
      other.afternoon == afternoon &&
      other.night == night;

  @override
  int get hashCode => Object.hash(location, day, afternoon, night);
}

class BreakWindowLogic {
  const BreakWindowLogic._();

  static const int dayStartHour = 7;
  static const int nightStartHour = 17;
  static const String yardTimeZone = 'Europe/London';

  static bool _tzReady = false;

  static void ensureTimeZone() {
    if (_tzReady) return;
    tzdata.initializeTimeZones();
    _tzReady = true;
  }

  /// Yard wall-clock fields for [instant] in Europe/London.
  ///
  /// Break slots are stored as UK civil times. Comparing them to the device
  /// local clock (e.g. Poland UTC+1) shifts full-hour windows and empties
  /// "on break now". Returns a naive [DateTime] whose Y/M/D H:M:S are London.
  static DateTime yardWallClock([DateTime? instant]) {
    ensureTimeZone();
    final utc = (instant ?? DateTime.now()).toUtc();
    final london = tz.TZDateTime.from(utc, tz.getLocation(yardTimeZone));
    return DateTime(
      london.year,
      london.month,
      london.day,
      london.hour,
      london.minute,
      london.second,
      london.millisecond,
      london.microsecond,
    );
  }

  static String toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  static DateTime dateOnly(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  /// Local calendar midnight for a `YYYY-MM-DD` (never UTC via [DateTime.parse]).
  static DateTime localDateYmd(String ymd) {
    final raw = ymd.trim();
    final slice = raw.length >= 10 ? raw.substring(0, 10) : raw;
    final parts = slice.split('-');
    if (parts.length != 3) return dateOnly(DateTime.now());
    return DateTime(
      int.tryParse(parts[0]) ?? DateTime.now().year,
      int.tryParse(parts[1]) ?? 1,
      int.tryParse(parts[2]) ?? 1,
    );
  }

  static String normalizeYmd(String ymd) {
    final raw = ymd.trim();
    return raw.length >= 10 ? raw.substring(0, 10) : raw;
  }

  static bool sameLocation(String? left, String? right) {
    final a = left?.trim().toLowerCase() ?? '';
    final b = right?.trim().toLowerCase() ?? '';
    if (a.isEmpty || b.isEmpty) return false;
    return a == b;
  }

  static String nightStartYmd(DateTime now) {
    final today = dateOnly(now);
    return toYmd(
      now.hour < dayStartHour ? today.subtract(const Duration(days: 1)) : today,
    );
  }

  static Set<String> queryDates(DateTime now) {
    final today = dateOnly(now);
    final nightStart = localDateYmd(nightStartYmd(now));
    return <String>{
      toYmd(today),
      toYmd(nightStart),
      toYmd(nightStart.add(const Duration(days: 1))),
    };
  }

  /// [now] must be yard wall-clock (use [yardWallClock] for device timestamps).
  static List<VisibleBreak> visibleBreaks({
    required List<ScheduledBreak> breaks,
    required DateTime now,
    required BreakFilters filters,
  }) {
    final todayYmd = toYmd(now);
    final nightAnchor = nightStartYmd(now);
    final inNightWindow = now.hour >= nightStartHour || now.hour < dayStartHour;

    final entries = <VisibleBreak>[];
    for (final item in breaks) {
      if (!filters.includes(item.shift)) continue;
      if (filters.location != null &&
          filters.location!.trim().isNotEmpty &&
          !sameLocation(item.location, filters.location)) {
        continue;
      }

      var included = false;
      final itemDate = normalizeYmd(item.dateYmd);
      var wallDate = localDateYmd(itemDate);
      final startMinutes = _minutes(item.startTime);

      if (item.shift == BreakShift.day || item.shift == BreakShift.afternoon) {
        included = !inNightWindow && itemDate == todayYmd;
      } else if (itemDate == nightAnchor) {
        // Only the open night cycle. Do not pull next night's early-morning
        // rows dated on the morning calendar day while this window is open.
        included = true;
        if (startMinutes < dayStartHour * 60) {
          wallDate = wallDate.add(const Duration(days: 1));
        }
      }
      if (!included) continue;

      final start = wallDate.add(Duration(minutes: startMinutes));
      final end = start.add(Duration(minutes: item.durationMinutes));
      // Inclusive start, exclusive end — still active during the last minute.
      if (!end.isAfter(now)) continue;
      final isActive = !now.isBefore(start) && now.isBefore(end);
      entries.add(
        VisibleBreak(
          breakItem: item,
          start: start,
          end: end,
          isActive: isActive,
        ),
      );
    }

    entries.sort((left, right) {
      if (left.isActive != right.isActive) return left.isActive ? -1 : 1;
      final shiftCompare = left.breakItem.shift.index.compareTo(
        right.breakItem.shift.index,
      );
      if (shiftCompare != 0) return shiftCompare;
      final timeCompare = left.start.compareTo(right.start);
      if (timeCompare != 0) return timeCompare;
      return left.breakItem.displayName.compareTo(right.breakItem.displayName);
    });
    return entries;
  }

  static int _minutes(String value) {
    final parts = value.split(':');
    if (parts.length < 2) return 0;
    return (int.tryParse(parts[0]) ?? 0) * 60 + (int.tryParse(parts[1]) ?? 0);
  }
}
