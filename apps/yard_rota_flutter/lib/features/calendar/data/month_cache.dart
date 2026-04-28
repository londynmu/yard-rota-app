import '../../../core/network/models.dart';

class MonthCache {
  MonthCache({required this.ttl});

  final Duration ttl;
  final Map<String, _Entry> _entries = <String, _Entry>{};

  CalendarMonthData? read({required int year, required int month}) {
    final key = _cacheKey(year: year, month: month);
    final entry = _entries[key];
    if (entry == null) {
      return null;
    }
    if (DateTime.now().isAfter(entry.expiresAt)) {
      _entries.remove(key);
      return null;
    }
    return entry.data;
  }

  void write(CalendarMonthData data) {
    final key = _cacheKey(year: data.year, month: data.month);
    _entries[key] = _Entry(data: data, expiresAt: DateTime.now().add(ttl));
  }

  String _cacheKey({required int year, required int month}) => '$year-$month';
}

class _Entry {
  const _Entry({required this.data, required this.expiresAt});

  final CalendarMonthData data;
  final DateTime expiresAt;
}
