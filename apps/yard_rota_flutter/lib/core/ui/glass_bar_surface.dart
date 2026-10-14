import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../theme/theme_extensions.dart';

enum GlassBarEdge { top, bottom }

/// Blurred, semi-transparent backdrop for bars that float over the wallpaper.
class GlassBarSurface extends StatelessWidget {
  const GlassBarSurface({super.key, required this.edge, this.child});

  final GlassBarEdge edge;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final decoration = switch (edge) {
      GlassBarEdge.top => BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            colors.bgPrimary.withValues(alpha: 0.0),
            colors.bgPrimary.withValues(
              alpha: isDark
                  ? AppGlassBar.topFadeDarkAlpha
                  : AppGlassBar.topFadeLightAlpha,
            ),
          ],
        ),
      ),
      GlassBarEdge.bottom => BoxDecoration(
        color: colors.bgPrimary.withValues(
          alpha: isDark
              ? AppGlassBar.bottomDarkAlpha
              : AppGlassBar.bottomLightAlpha,
        ),
        border: Border(
          top: BorderSide(color: colors.borderDefault, width: AppStroke.thin),
        ),
      ),
    };
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(
          sigmaX: AppGlassBar.blurSigma,
          sigmaY: AppGlassBar.blurSigma,
        ),
        child: DecoratedBox(decoration: decoration, child: child),
      ),
    );
  }
}
