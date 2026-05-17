import 'dart:async';

import '../../../core/network/api_client.dart';
import '../../../core/local_db/app_local_database.dart';
import '../../../core/network/models.dart';
import '../../../core/network/perf_metrics.dart';
import '../../../core/network/retry_executor.dart';

class CalendarRepository {
  CalendarRepository({
    required ApiClient apiClient,
    required AppLocalDatabase localDb,
  }) : _apiClient = apiClient,
       _localDb = localDb;

  final ApiClient _apiClient;
  final AppLocalDatabase _localDb;
  final Map<String, CalendarMonthData> _memoryCache =
      <String, CalendarMonthData>{};

  CalendarMonthData? readCachedMonth({required int year, required int month}) {
    return _memoryCache['$year-$month'];
  }

  Future<CalendarMonthData> loadMonth({
    required int year,
    required int month,
  }) async {
    final key = '$year-$month';
    final inMemory = _memoryCache[key];
    if (inMemory != null) {
      unawaited(_refreshMonth(year: year, month: month));
      _prefetchAdjacentMonths(year: year, month: month);
      return inMemory;
    }

    final local = await _localDb.readCalendarMonth(year: year, month: month);
    if (local != null) {
      _memoryCache[key] = local;
      unawaited(_refreshMonth(year: year, month: month));
      _prefetchAdjacentMonths(year: year, month: month);
      return local;
    }

    final fresh = await _refreshMonth(year: year, month: month);
    _prefetchAdjacentMonths(year: year, month: month);
    return fresh;
  }

  Future<CalendarMonthData> _refreshMonth({
    required int year,
    required int month,
  }) async {
    final fresh = await PerfMetrics.track(
      'calendar.month.fetch',
      () => RetryExecutor.run(
        task: () => _apiClient.getCalendarMonth(year: year, month: month),
      ),
    );
    _memoryCache['$year-$month'] = fresh;
    await _localDb.writeCalendarMonth(fresh);
    return fresh;
  }

  Future<void> _prefetchAdjacentMonths({
    required int year,
    required int month,
  }) async {
    final previous = _normalizeMonth(year: year, month: month - 1);
    final next = _normalizeMonth(year: year, month: month + 1);

    await Future.wait([
      _prefetch(previous.$1, previous.$2),
      _prefetch(next.$1, next.$2),
    ]);
  }

  Future<void> _prefetch(int year, int month) async {
    if (_memoryCache['$year-$month'] != null) {
      return;
    }
    final hasLocal = await _localDb.hasCalendarMonth(year: year, month: month);
    if (hasLocal) {
      final local = await _localDb.readCalendarMonth(year: year, month: month);
      if (local != null) {
        _memoryCache['$year-$month'] = local;
      }
      return;
    }
    try {
      final data = await RetryExecutor.run(
        task: () => _apiClient.getCalendarMonth(year: year, month: month),
      );
      _memoryCache['$year-$month'] = data;
      await _localDb.writeCalendarMonth(data);
    } catch (_) {
      // Prefetch must never block UI if adjacent month fetch fails.
    }
  }

  (int, int) _normalizeMonth({required int year, required int month}) {
    if (month < 1) {
      return (year - 1, 12);
    }
    if (month > 12) {
      return (year + 1, 1);
    }
    return (year, month);
  }
}
