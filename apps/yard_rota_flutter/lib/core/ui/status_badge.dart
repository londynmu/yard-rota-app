import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

enum BadgeVariant { success, warning, danger, info, holiday }

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.variant,
    this.compact = false,
  });

  final String label;
  final BadgeVariant variant;

  /// Tighter padding and [AppTypography.labelSmall] for dense lists.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final (bgColor, textColor) = switch (variant) {
      BadgeVariant.success => (colors.successBg, colors.success),
      BadgeVariant.warning => (colors.warningBg, colors.warning),
      BadgeVariant.danger => (colors.dangerBg, colors.danger),
      BadgeVariant.info => (colors.infoBg, colors.info),
      BadgeVariant.holiday => (
        AppAvailabilityTones.holidayBg(isDark: isDark),
        AppAvailabilityTones.holiday(isDark: isDark),
      ),
    };

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? AppSpacing.xs : AppSpacing.sm,
        vertical: compact ? AppSpacing.xxs : AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        label,
        style: (compact ? AppTypography.labelSmall : AppTypography.labelMedium)
            .copyWith(
              color: textColor,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}
