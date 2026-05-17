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
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? surfaceOpacity;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final customSurface = surfaceOpacity == null
        ? null
        : colors.bgElevated.withValues(alpha: surfaceOpacity!.clamp(0.0, 1.0));

    return Card(
      color: customSurface,
      surfaceTintColor: customSurface != null ? Colors.transparent : null,
      child: Padding(padding: padding, child: child),
    );
  }
}
