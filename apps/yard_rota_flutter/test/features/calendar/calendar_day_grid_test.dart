import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/calendar_day_grid.dart';

void main() {
  test('forWidth keeps cells at least 48dp when space allows', () {
    final metrics = CalendarDayGridMetrics.forWidth(346.7);
    expect(metrics.cellExtent, greaterThanOrEqualTo(48));
    expect(metrics.gap, lessThan(4));
  });

  test('forWidth uses full xs gap when width is generous', () {
    final metrics = CalendarDayGridMetrics.forWidth(560);
    expect(metrics.cellExtent, greaterThanOrEqualTo(48));
    expect(metrics.gap, 4);
  });
}
