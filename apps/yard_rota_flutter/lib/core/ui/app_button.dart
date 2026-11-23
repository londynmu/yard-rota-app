import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

/// Button variants for the app.
///
/// [primary] and [secondary] both use the neutral outlined style — there is no
/// filled/blue CTA. [ghost] is a quiet text button.
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
    // Theme buttons use minimumSize width: infinity for full-width forms.
    // When [isExpanded] is false (e.g. inside a Row), that infinite min width
    // must be cleared or layout throws "RenderBox was not laid out".
    final compactStyle = isExpanded
        ? null
        : ButtonStyle(
            minimumSize: const WidgetStatePropertyAll(
              Size(0, AppComponentTokens.buttonHeightMd),
            ),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          );

    final button = switch (variant) {
      // Primary and secondary share the neutral outline look — no filled blue.
      AppButtonVariant.primary || AppButtonVariant.secondary => OutlinedButton(
        onPressed: onPressed,
        style: compactStyle,
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
