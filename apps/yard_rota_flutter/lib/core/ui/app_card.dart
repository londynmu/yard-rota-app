import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppComponentTokens.cardPadding),

    /// 0–1 opacity of [AppColorsScheme.bgElevated] fill. `null` = theme default.
    this.surfaceOpacity,

    /// Explicit fill colour (wins over [surfaceOpacity] when set).
    this.color,

    /// Optional border tint for tinted status cards.
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? surfaceOpacity;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final customSurface = color ??
        (surfaceOpacity == null
            ? null
            : colors.bgElevated.withValues(
                alpha: surfaceOpacity!.clamp(0.0, 1.0),
              ));

    return Card(
      color: customSurface,
      surfaceTintColor: customSurface != null ? Colors.transparent : null,
      // Clip children (e.g. flush headers) so top corners stay rounded.
      clipBehavior: Clip.antiAlias,
      shape: borderColor == null
          ? null
          : RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              side: BorderSide(
                color: borderColor!,
                width: AppStroke.thin,
              ),
            ),
      child: Padding(padding: padding, child: child),
    );
  }
}
