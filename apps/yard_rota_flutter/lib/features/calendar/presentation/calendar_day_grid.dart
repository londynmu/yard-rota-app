import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';

/// Shared day-grid metrics so main Calendar and Set availability stay ≥48dp.
@immutable
class CalendarDayGridMetrics {
  const CalendarDayGridMetrics({required this.cellExtent, required this.gap});

  final double cellExtent;
  final double gap;

  static const int columns = 7;
  static const double minTouch = 48;

  /// Prefer Material 48dp cells; shrink gutters before shrinking the hit area.
  factory CalendarDayGridMetrics.forWidth(double maxWidth) {
    var gap = AppSpacing.xs;
    var cell = (maxWidth - gap * (columns - 1)) / columns;
    if (cell < minTouch) {
      final slack = maxWidth - minTouch * columns;
      gap = slack > 0 ? slack / (columns - 1) : 0;
      cell = (maxWidth - gap * (columns - 1)) / columns;
    }
    return CalendarDayGridMetrics(
      cellExtent: math.max(minTouch, cell),
      gap: math.max(0, gap),
    );
  }

  SliverGridDelegate get delegate => SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    mainAxisExtent: cellExtent,
    crossAxisSpacing: gap,
    mainAxisSpacing: gap,
  );
}

/// Tablet portrait (≥700) or landscape phone/tablet (≥600 wide).
bool calendarIsWideLayout(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final landscape = size.width > size.height;
  if (landscape && size.width >= 600) {
    return true;
  }
  return size.width >= 700;
}
