import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';

class AvailabilityRepository {
  AvailabilityRepository({required ApiClient apiClient, required Duration ttl})
    : _apiClient = apiClient,
      _ttl = ttl;

  final ApiClient _apiClient;
  final Duration _ttl;
  final Map<String, _AvailabilityCacheEntry> _cache =
      <String, _AvailabilityCacheEntry>{};

  Future<Map<String, AvailabilityEntry>> loadForMonth({
    required DateTime monthDate,
    DateTime? modalAnchorDate,
  }) async {
    final range = _buildRange(
      monthDate: monthDate,
      modalAnchorDate: modalAnchorDate,
    );
    final cacheKey = '${_toYmd(range.start)}-${_toYmd(range.end)}';
    final cached = _cache[cacheKey];
    if (cached != null && DateTime.now().isBefore(cached.expiresAt)) {
      return cached.byDate;
    }

    final entries = await _apiClient.getAvailabilityRange(
      startYmd: _toYmd(range.start),
      endYmd: _toYmd(range.end),
    );
    final byDate = <String, AvailabilityEntry>{
      for (final entry in entries) entry.dateYmd: entry,
    };

    _cache[cacheKey] = _AvailabilityCacheEntry(
      byDate: byDate,
      expiresAt: DateTime.now().add(_ttl),
    );
    return byDate;
  }

  Future<void> save({required SaveAvailabilityRequest request}) async {
    await _apiClient.saveAvailability(request: request);
    _cache.clear();
  }

  _DateRange _buildRange({
    required DateTime monthDate,
    DateTime? modalAnchorDate,
  }) {
    final monthStart = DateTime(monthDate.year, monthDate.month, 1);
    final monthEnd = DateTime(monthDate.year, monthDate.month + 1, 0);
    final gridStart = monthStart.subtract(const Duration(days: 7));
    final gridEnd = monthEnd.add(const Duration(days: 7));

    var start = gridStart;
    var end = gridEnd;

    if (modalAnchorDate != null) {
      final anchorStart = DateTime(
        modalAnchorDate.year,
        modalAnchorDate.month,
        modalAnchorDate.day,
      );
      final anchorEnd = anchorStart.add(const Duration(days: 13));
      if (anchorStart.isBefore(start)) {
        start = anchorStart;
      }
      if (anchorEnd.isAfter(end)) {
        end = anchorEnd;
      }
    }

    return _DateRange(start: start, end: end);
  }

  String _toYmd(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }
}

class _AvailabilityCacheEntry {
  const _AvailabilityCacheEntry({
    required this.byDate,
    required this.expiresAt,
  });

  final Map<String, AvailabilityEntry> byDate;
  final DateTime expiresAt;
}

class _DateRange {
  const _DateRange({required this.start, required this.end});

  final DateTime start;
  final DateTime end;
}
