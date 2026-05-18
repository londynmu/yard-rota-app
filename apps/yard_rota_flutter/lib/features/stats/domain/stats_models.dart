enum StatsRangeFilter {
  lastDay('last_day', 'Last Day'),
  lastWeek('last_week', 'Last Week'),
  lastMonth('last_month', 'Last Month'),
  all('all', 'All Time');

  const StatsRangeFilter(this.dbValue, this.label);

  final String dbValue;
  final String label;
}

enum StatsSortOption {
  totalMoves('moves', 'Total Moves'),
  perDay('per_day', 'Per Day');

  const StatsSortOption(this.dbValue, this.label);

  final String dbValue;
  final String label;
}

enum StatsShiftFilter {
  all('all', 'All'),
  day('day', 'Day'),
  afternoon('afternoon', 'Afternoon'),
  night('night', 'Night');

  const StatsShiftFilter(this.dbValue, this.label);

  final String dbValue;
  final String label;
}

class StatsProfileSnapshot {
  const StatsProfileSnapshot({
    required this.userId,
    this.firstName,
    this.lastName,
    this.yardSystemId,
    this.shiftPreference,
    this.isActive = true,
    this.fetchedAt,
  });

  final String userId;
  final String? firstName;
  final String? lastName;
  final String? yardSystemId;
  final String? shiftPreference;
  final bool isActive;
  final DateTime? fetchedAt;

  String get displayName {
    final joined = '${firstName ?? ''} ${lastName ?? ''}'.trim();
    if (joined.isNotEmpty) {
      return joined;
    }
    final yardId = yardSystemId?.trim();
    return yardId == null || yardId.isEmpty ? 'Unknown shunter' : yardId;
  }

  bool get hasYardSystemId => (yardSystemId ?? '').trim().isNotEmpty;
}

class StatsPerformanceRecord {
  const StatsPerformanceRecord({
    required this.userId,
    required this.reportDateYmd,
    required this.numberOfMoves,
    required this.avgTimeToCollect,
    required this.avgTimeToTravel,
    required this.numberOfFullLocations,
    required this.profile,
    this.fetchedAt,
  });

  final String userId;
  final String reportDateYmd;
  final int numberOfMoves;
  final String avgTimeToCollect;
  final String avgTimeToTravel;
  final int numberOfFullLocations;
  final StatsProfileSnapshot? profile;
  final DateTime? fetchedAt;
}

class StatsRemoteSnapshot {
  const StatsRemoteSnapshot({
    required this.records,
    required this.fetchedAt,
    this.currentProfile,
  });

  final List<StatsPerformanceRecord> records;
  final StatsProfileSnapshot? currentProfile;
  final DateTime fetchedAt;
}

class StatsLocalSnapshot {
  const StatsLocalSnapshot({
    required this.records,
    required this.fetchedAt,
    required this.isKnownRange,
    this.currentProfile,
  });

  final List<StatsPerformanceRecord> records;
  final StatsProfileSnapshot? currentProfile;
  final DateTime fetchedAt;
  final bool isKnownRange;
}

class StatsUserSummary {
  const StatsUserSummary({
    required this.userId,
    required this.displayName,
    required this.yardSystemId,
    required this.shiftPreference,
    required this.totalMoves,
    required this.daysWorked,
    required this.movesPerDay,
    required this.avgCollectSeconds,
    required this.avgTravelSeconds,
    required this.totalFullLocations,
    required this.rank,
    required this.teamAverageRatio,
  });

  final String userId;
  final String displayName;
  final String yardSystemId;
  final String? shiftPreference;
  final int totalMoves;
  final int daysWorked;
  final double movesPerDay;
  final int avgCollectSeconds;
  final int avgTravelSeconds;
  final int totalFullLocations;
  final int rank;
  final double? teamAverageRatio;

  String get avgCollectLabel => statsSecondsToTime(avgCollectSeconds);

  String get avgTravelLabel => statsSecondsToTime(avgTravelSeconds);

  bool get isHighOutput => teamAverageRatio != null && teamAverageRatio! >= 1.1;
}

class StatsTeamSummary {
  const StatsTeamSummary({
    required this.totalMoves,
    required this.totalFullLocations,
    required this.activeShunters,
    required this.avgMovesPerDay,
    this.fastestCollect,
    this.fastestTravel,
  });

  final int totalMoves;
  final int totalFullLocations;
  final int activeShunters;
  final int avgMovesPerDay;
  final StatsUserSummary? fastestCollect;
  final StatsUserSummary? fastestTravel;
}

class StatsTrendPoint {
  const StatsTrendPoint({required this.dateYmd, required this.totalMoves});

  final String dateYmd;
  final int totalMoves;
}

class StatsDashboardData {
  const StatsDashboardData({
    required this.users,
    required this.team,
    required this.trend,
    required this.range,
    required this.sort,
    required this.shiftFilter,
    required this.fetchedAt,
    required this.isFromCache,
    required this.currentUserHasYardId,
    this.currentUser,
  });

  final List<StatsUserSummary> users;
  final StatsTeamSummary team;
  final List<StatsTrendPoint> trend;
  final StatsRangeFilter range;
  final StatsSortOption sort;
  final StatsShiftFilter shiftFilter;
  final DateTime fetchedAt;
  final bool isFromCache;
  final bool currentUserHasYardId;
  final StatsUserSummary? currentUser;

  bool get hasAnyData => users.isNotEmpty || trend.isNotEmpty;
}

int statsTimeToSeconds(Object? timeValue) {
  if (timeValue == null) {
    return 0;
  }
  if (timeValue is num) {
    return timeValue.isFinite ? timeValue.round() : 0;
  }
  if (timeValue is! String) {
    return 0;
  }
  final raw = timeValue.trim();
  if (raw.isEmpty) {
    return 0;
  }
  final numeric = num.tryParse(raw);
  if (numeric != null) {
    return numeric.isFinite ? numeric.round() : 0;
  }
  final parts = raw.split(':').map((part) => part.trim()).toList();
  if (parts.length == 2) {
    final minutes = int.tryParse(parts[0]);
    final seconds = int.tryParse(parts[1]);
    if (minutes == null || seconds == null) {
      return 0;
    }
    return minutes * 60 + seconds;
  }
  if (parts.length == 3) {
    final hours = int.tryParse(parts[0]);
    final minutes = int.tryParse(parts[1]);
    final seconds = int.tryParse(parts[2]);
    if (hours == null || minutes == null || seconds == null) {
      return 0;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

String statsSecondsToTime(int totalSeconds) {
  if (totalSeconds <= 0) {
    return '0:00';
  }
  final minutes = totalSeconds ~/ 60;
  final seconds = totalSeconds % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}

String statsDateToYmd(DateTime date) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

DateTime? statsParseYmd(String ymd) {
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
