import 'dart:math' as math;

import '../../../core/local_db/app_local_database.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/perf_metrics.dart';
import '../../../core/network/retry_executor.dart';
import '../domain/stats_models.dart';

class StatsRepository {
  StatsRepository({
    required ApiClient apiClient,
    required AppLocalDatabase localDb,
  }) : _apiClient = apiClient,
       _localDb = localDb;

  final ApiClient _apiClient;
  final AppLocalDatabase _localDb;

  Future<StatsDashboardData?> loadCachedDashboard({
    required String currentUserId,
    required StatsRangeFilter range,
    required StatsSortOption sort,
    required StatsShiftFilter shiftFilter,
    DateTime? now,
  }) async {
    final request = _buildRequest(range: range, now: now ?? DateTime.now());
    final local = await _localDb.readStatsSnapshot(
      rangeKey: request.rangeKey,
      startYmd: request.startYmd,
      endYmd: request.endYmd,
      currentUserId: currentUserId,
    );
    if (local == null) {
      return null;
    }
    return buildStatsDashboard(
      records: local.records,
      currentProfile: local.currentProfile,
      currentUserId: currentUserId,
      range: range,
      sort: sort,
      shiftFilter: shiftFilter,
      fetchedAt: local.fetchedAt,
      isFromCache: true,
    );
  }

  Future<StatsDashboardData> refreshDashboard({
    required String currentUserId,
    required StatsRangeFilter range,
    required StatsSortOption sort,
    required StatsShiftFilter shiftFilter,
    DateTime? now,
  }) async {
    final request = _buildRequest(range: range, now: now ?? DateTime.now());
    final remote = await PerfMetrics.track(
      'stats.fetch',
      () => RetryExecutor.run(
        task: () => _apiClient.getStatsPerformance(
          startYmd: request.startYmd,
          endYmd: request.endYmd,
        ),
      ),
    );
    await _localDb.writeStatsSnapshot(
      rangeKey: request.rangeKey,
      startYmd: request.startYmd,
      endYmd: request.endYmd,
      snapshot: remote,
    );
    return buildStatsDashboard(
      records: remote.records,
      currentProfile: remote.currentProfile,
      currentUserId: currentUserId,
      range: range,
      sort: sort,
      shiftFilter: shiftFilter,
      fetchedAt: remote.fetchedAt,
      isFromCache: false,
    );
  }

  _StatsRequest _buildRequest({
    required StatsRangeFilter range,
    required DateTime now,
  }) {
    final today = DateTime(now.year, now.month, now.day);
    switch (range) {
      case StatsRangeFilter.lastDay:
        final ymd = statsDateToYmd(today);
        return _StatsRequest(
          rangeKey: '${range.dbValue}:$ymd:$ymd',
          startYmd: ymd,
          endYmd: ymd,
        );
      case StatsRangeFilter.lastWeek:
        final start = today.subtract(const Duration(days: 6));
        final startYmd = statsDateToYmd(start);
        final endYmd = statsDateToYmd(today);
        return _StatsRequest(
          rangeKey: '${range.dbValue}:$startYmd:$endYmd',
          startYmd: startYmd,
          endYmd: endYmd,
        );
      case StatsRangeFilter.lastMonth:
        final start = today.subtract(const Duration(days: 29));
        final startYmd = statsDateToYmd(start);
        final endYmd = statsDateToYmd(today);
        return _StatsRequest(
          rangeKey: '${range.dbValue}:$startYmd:$endYmd',
          startYmd: startYmd,
          endYmd: endYmd,
        );
      case StatsRangeFilter.all:
        return const _StatsRequest(rangeKey: 'all');
    }
  }
}

StatsDashboardData buildStatsDashboard({
  required List<StatsPerformanceRecord> records,
  required StatsProfileSnapshot? currentProfile,
  required String currentUserId,
  required StatsRangeFilter range,
  required StatsSortOption sort,
  required StatsShiftFilter shiftFilter,
  required DateTime fetchedAt,
  required bool isFromCache,
}) {
  final grouped = <String, _StatsAccumulator>{};
  final trendByDate = <String, int>{};

  for (final record in records) {
    final profile = record.profile;
    if (profile == null || !profile.isActive || !profile.hasYardSystemId) {
      continue;
    }
    if (!_matchesShift(profile.shiftPreference, shiftFilter)) {
      continue;
    }
    final moves = math.max(0, record.numberOfMoves);
    final accumulator = grouped.putIfAbsent(
      record.userId,
      () => _StatsAccumulator(profile),
    );
    accumulator.add(record, moves);

    final reportDate = statsParseYmd(record.reportDateYmd);
    final trendDate = reportDate == null
        ? record.reportDateYmd
        : statsDateToYmd(reportDate.subtract(const Duration(days: 1)));
    trendByDate[trendDate] = (trendByDate[trendDate] ?? 0) + moves;
  }

  final summaries = grouped.values
      .map((accumulator) => accumulator.toSummary(rank: 0, teamAvgMoves: null))
      .toList();
  final totalMoves = summaries.fold<int>(
    0,
    (sum, user) => sum + user.totalMoves,
  );
  final totalDays = summaries.fold<int>(
    0,
    (sum, user) => sum + user.daysWorked,
  );
  final teamAvgMoves = totalDays > 0 ? totalMoves / totalDays : 0.0;

  summaries.sort((a, b) {
    switch (sort) {
      case StatsSortOption.perDay:
        final byPerDay = b.movesPerDay.compareTo(a.movesPerDay);
        if (byPerDay != 0) {
          return byPerDay;
        }
        return b.totalMoves.compareTo(a.totalMoves);
      case StatsSortOption.totalMoves:
        final byMoves = b.totalMoves.compareTo(a.totalMoves);
        if (byMoves != 0) {
          return byMoves;
        }
        return a.avgCollectSeconds.compareTo(b.avgCollectSeconds);
    }
  });

  final rankedUsers = <StatsUserSummary>[];
  for (var i = 0; i < summaries.length; i++) {
    final user = summaries[i];
    final ratio = teamAvgMoves > 0 ? user.movesPerDay / teamAvgMoves : null;
    rankedUsers.add(
      StatsUserSummary(
        userId: user.userId,
        displayName: user.displayName,
        yardSystemId: user.yardSystemId,
        shiftPreference: user.shiftPreference,
        totalMoves: user.totalMoves,
        daysWorked: user.daysWorked,
        movesPerDay: user.movesPerDay,
        avgCollectSeconds: user.avgCollectSeconds,
        avgTravelSeconds: user.avgTravelSeconds,
        totalFullLocations: user.totalFullLocations,
        rank: i + 1,
        teamAverageRatio: ratio,
      ),
    );
  }

  StatsUserSummary? fastestCollect;
  StatsUserSummary? fastestTravel;
  for (final user in rankedUsers) {
    if (user.totalMoves <= 0) {
      continue;
    }
    if (user.avgCollectSeconds > 0 &&
        (fastestCollect == null ||
            user.avgCollectSeconds < fastestCollect.avgCollectSeconds)) {
      fastestCollect = user;
    }
    if (user.avgTravelSeconds > 0 &&
        (fastestTravel == null ||
            user.avgTravelSeconds < fastestTravel.avgTravelSeconds)) {
      fastestTravel = user;
    }
  }

  final trend =
      trendByDate.entries
          .map(
            (entry) =>
                StatsTrendPoint(dateYmd: entry.key, totalMoves: entry.value),
          )
          .toList()
        ..sort((a, b) => a.dateYmd.compareTo(b.dateYmd));

  StatsUserSummary? currentUser;
  for (final user in rankedUsers) {
    if (user.userId == currentUserId) {
      currentUser = user;
      break;
    }
  }
  final currentHasYardId =
      currentProfile == null || currentProfile.hasYardSystemId;

  return StatsDashboardData(
    users: rankedUsers,
    team: StatsTeamSummary(
      totalMoves: totalMoves,
      totalFullLocations: summaries.fold<int>(
        0,
        (sum, user) => sum + user.totalFullLocations,
      ),
      activeShunters: rankedUsers.length,
      avgMovesPerDay: teamAvgMoves.round(),
      fastestCollect: fastestCollect,
      fastestTravel: fastestTravel,
    ),
    trend: trend,
    range: range,
    sort: sort,
    shiftFilter: shiftFilter,
    fetchedAt: fetchedAt,
    isFromCache: isFromCache,
    currentUserHasYardId: currentHasYardId,
    currentUser: currentUser,
  );
}

bool _matchesShift(String? shift, StatsShiftFilter filter) {
  if (filter == StatsShiftFilter.all) {
    return true;
  }
  return (shift ?? '').trim().toLowerCase() == filter.dbValue;
}

class _StatsAccumulator {
  _StatsAccumulator(this.profile);

  final StatsProfileSnapshot profile;
  int totalMoves = 0;
  int totalCollectSeconds = 0;
  int totalTravelSeconds = 0;
  int totalFullLocations = 0;
  final Set<String> datesWorked = <String>{};

  void add(StatsPerformanceRecord record, int moves) {
    totalMoves += moves;
    totalCollectSeconds += statsTimeToSeconds(record.avgTimeToCollect) * moves;
    totalTravelSeconds += statsTimeToSeconds(record.avgTimeToTravel) * moves;
    totalFullLocations += math.max(0, record.numberOfFullLocations);
    datesWorked.add(record.reportDateYmd);
  }

  StatsUserSummary toSummary({
    required int rank,
    required double? teamAvgMoves,
  }) {
    final daysWorked = datesWorked.length;
    final movesPerDay = daysWorked > 0 ? totalMoves / daysWorked : 0.0;
    final ratio = teamAvgMoves != null && teamAvgMoves > 0
        ? movesPerDay / teamAvgMoves
        : null;
    return StatsUserSummary(
      userId: profile.userId,
      displayName: profile.displayName,
      yardSystemId: profile.yardSystemId?.trim() ?? '',
      shiftPreference: profile.shiftPreference,
      totalMoves: totalMoves,
      daysWorked: daysWorked,
      movesPerDay: movesPerDay,
      avgCollectSeconds: totalMoves > 0
          ? (totalCollectSeconds / totalMoves).round()
          : 0,
      avgTravelSeconds: totalMoves > 0
          ? (totalTravelSeconds / totalMoves).round()
          : 0,
      totalFullLocations: totalFullLocations,
      rank: rank,
      teamAverageRatio: ratio,
    );
  }
}

class _StatsRequest {
  const _StatsRequest({required this.rangeKey, this.startYmd, this.endYmd});

  final String rangeKey;
  final String? startYmd;
  final String? endYmd;
}
