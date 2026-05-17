import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

enum BadgeVariant { success, warning, danger, info }

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.variant});

  final String label;
  final BadgeVariant variant;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    final (bgColor, textColor) = switch (variant) {
      BadgeVariant.success => (colors.successBg, colors.success),
      BadgeVariant.warning => (colors.warningBg, colors.warning),
      BadgeVariant.danger => (colors.dangerBg, colors.danger),
      BadgeVariant.info => (colors.infoBg, colors.info),
    };

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        label,
        style: AppTypography.labelMedium.copyWith(color: textColor),
      ),
    );
  }
}
