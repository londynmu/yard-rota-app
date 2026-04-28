import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/network/perf_metrics.dart';
import '../../../core/network/retry_executor.dart';
import 'month_cache.dart';

class CalendarRepository {
  CalendarRepository({required ApiClient apiClient, required MonthCache cache})
    : _apiClient = apiClient,
      _cache = cache;

  final ApiClient _apiClient;
  final MonthCache _cache;

  CalendarMonthData? readCachedMonth({required int year, required int month}) {
    return _cache.read(year: year, month: month);
  }

  Future<CalendarMonthData> loadMonth({
    required int year,
    required int month,
  }) async {
    final fresh = await PerfMetrics.track(
      'calendar.month.fetch',
      () => RetryExecutor.run(
        task: () => _apiClient.getCalendarMonth(year: year, month: month),
      ),
    );
    _cache.write(fresh);
    _prefetchAdjacentMonths(year: year, month: month);
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
    if (_cache.read(year: year, month: month) != null) {
      return;
    }
    try {
      final data = await RetryExecutor.run(
        task: () => _apiClient.getCalendarMonth(year: year, month: month),
      );
      _cache.write(data);
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
