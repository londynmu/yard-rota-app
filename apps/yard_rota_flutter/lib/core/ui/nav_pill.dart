import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// How strongly a selected nav item is filled.
enum NavPillStyle {
  /// Solid primary pill with glow (filter chips).
  solid,

  /// Light primary wash, no glow (top Home tabs).
  subtle,

  /// No fill — selection is colour-only (bottom shell menu).
  plain,
}

/// Background of a navigation item or filter chip.
BoxDecoration navPillDecoration(
  AppColorsScheme colors, {
  required bool selected,
  NavPillStyle style = NavPillStyle.solid,
}) {
  if (!selected || style == NavPillStyle.plain) {
    return const BoxDecoration(color: Colors.transparent);
  }

  if (style == NavPillStyle.subtle) {
    return BoxDecoration(
      color: colors.primary.withValues(alpha: AppNavPill.subtleFillAlpha),
      borderRadius: BorderRadius.circular(AppRadius.full),
    );
  }

  return BoxDecoration(
    color: colors.primary,
    borderRadius: BorderRadius.circular(AppRadius.full),
    boxShadow: [
      BoxShadow(
        color: colors.primary.withValues(alpha: AppNavPill.glowAlpha),
        blurRadius: AppNavPill.glowBlur,
        offset: const Offset(0, AppNavPill.glowOffsetY),
      ),
    ],
  );
}

/// Icon and label colour on top of [navPillDecoration].
Color navPillForeground(
  AppColorsScheme colors, {
  required bool selected,
  NavPillStyle style = NavPillStyle.solid,
}) {
  if (!selected) return colors.textSecondary;
  return switch (style) {
    NavPillStyle.solid => colors.onPrimary,
    NavPillStyle.subtle || NavPillStyle.plain => colors.primary,
  };
}

/// Bottom / top shell menu icon colour — near-black in light theme.
Color bottomNavIconColor(
  AppColorsScheme colors, {
  required bool selected,
  required bool isDark,
}) {
  final base = colors.textPrimary;
  if (isDark) {
    return base.withValues(
      alpha: selected
          ? AppNavPill.bottomIconSelectedDark
          : AppNavPill.bottomIconUnselectedDark,
    );
  }
  // Light: use opaque blackish textPrimary (alpha 1) when selected.
  final alpha = selected
      ? AppNavPill.bottomIconSelectedLight
      : AppNavPill.bottomIconUnselectedLight;
  return alpha >= 1.0 ? base : base.withValues(alpha: alpha);
}

/// Bottom / top shell menu label colour — near-black in light theme.
Color bottomNavLabelColor(
  AppColorsScheme colors, {
  required bool selected,
  required bool isDark,
}) {
  final base = colors.textPrimary;
  if (isDark) {
    return base.withValues(
      alpha: selected
          ? AppNavPill.bottomLabelSelectedDark
          : AppNavPill.bottomLabelUnselectedDark,
    );
  }
  final alpha = selected
      ? AppNavPill.bottomLabelSelectedLight
      : AppNavPill.bottomLabelUnselectedLight;
  return alpha >= 1.0 ? base : base.withValues(alpha: alpha);
}

/// Light-stroke icon for top Home tabs and bottom shell menu.
///
/// Uses a low [FontWeight] plus Material Symbols `wght` / `GRAD` when the
/// platform font supports them; otherwise size + colour still read lighter.
Widget navBarIcon(
  IconData icon, {
  required Color color,
  double? size,
}) {
  final resolvedSize = size ?? AppNavPill.bottomIconSize;
  return Icon(
    icon,
    size: resolvedSize,
    color: color,
    weight: AppNavPill.iconWeight,
    grade: AppNavPill.iconGrade,
    opticalSize: resolvedSize,
    fontWeight: FontWeight.w300,
  );
}
