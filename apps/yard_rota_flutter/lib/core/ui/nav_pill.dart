import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Background of a navigation item or filter chip: a solid primary pill with
/// a soft glow when [selected], transparent otherwise.
BoxDecoration navPillDecoration(
  AppColorsScheme colors, {
  required bool selected,
}) {
  return BoxDecoration(
    color: selected ? colors.primary : Colors.transparent,
    borderRadius: BorderRadius.circular(AppRadius.full),
    boxShadow: selected
        ? [
            BoxShadow(
              color: colors.primary.withValues(alpha: AppNavPill.glowAlpha),
              blurRadius: AppNavPill.glowBlur,
              offset: const Offset(0, AppNavPill.glowOffsetY),
            ),
          ]
        : const [],
  );
}

/// Icon and label colour on top of [navPillDecoration].
Color navPillForeground(AppColorsScheme colors, {required bool selected}) =>
    selected ? colors.onPrimary : colors.textSecondary;
