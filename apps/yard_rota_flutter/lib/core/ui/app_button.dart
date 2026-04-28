import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

enum AppButtonVariant { primary, secondary, ghost }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.isExpanded = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isExpanded;

  @override
  Widget build(BuildContext context) {
    final button = switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
        onPressed: onPressed,
        child: Text(label),
      ),
      AppButtonVariant.secondary => OutlinedButton(
        onPressed: onPressed,
        child: Text(label),
      ),
      AppButtonVariant.ghost => TextButton(
        onPressed: onPressed,
        style: TextButton.styleFrom(
          minimumSize: const Size(0, AppComponentTokens.buttonHeightSm),
          foregroundColor: context.appColors.textSecondary,
          textStyle: AppTypography.labelLarge,
        ),
        child: Text(label),
      ),
    };

    if (!isExpanded) {
      return button;
    }

    return SizedBox(width: double.infinity, child: button);
  }
}
