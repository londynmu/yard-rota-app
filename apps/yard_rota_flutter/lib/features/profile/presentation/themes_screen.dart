import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';

/// Choose app appearance (light / dark / system) and per-theme home backgrounds.
class ThemesScreen extends StatelessWidget {
  const ThemesScreen({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
  });

  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
      onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
      onDarkHomeWallpaperChanged;

  static const List<LightHomeWallpaper> _lightOptions = LightHomeWallpaper.values;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: AppBar(title: const Text('Themes')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Text(
              'Appearance',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Light and dark themes use Yard Rota color tokens. System '
              'follows your device setting.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.textSecondary,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment<ThemeMode>(
                  value: ThemeMode.light,
                  label: Text('Light'),
                  icon: Icon(Icons.light_mode_outlined),
                ),
                ButtonSegment<ThemeMode>(
                  value: ThemeMode.dark,
                  label: Text('Dark'),
                  icon: Icon(Icons.dark_mode_outlined),
                ),
                ButtonSegment<ThemeMode>(
                  value: ThemeMode.system,
                  label: Text('System'),
                  icon: Icon(Icons.brightness_auto_outlined),
                ),
              ],
              selected: {themeMode},
              onSelectionChanged: (selected) async {
                final mode = selected.first;
                await onThemeModeChanged(mode);
                if (context.mounted) {
                  Navigator.of(context).pop();
                }
              },
            ),
            const SizedBox(height: AppSpacing.xxl),
            Text(
              'Home background',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Background shown on the calendar home. Each appearance has '
              'its own wallpaper.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colors.textSecondary,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Light theme',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                for (var i = 0; i < _lightOptions.length; i++) ...[
                  if (i > 0) SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: _WallpaperChoiceTile(
                      assetPath: _lightOptions[i].assetPath,
                      label: _lightOptions[i].displayLabel,
                      selected: lightHomeWallpaper == _lightOptions[i],
                      onTap: () async {
                        await onLightHomeWallpaperChanged(_lightOptions[i]);
                      },
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            Text(
              'Dark theme',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                color: colors.textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: _WallpaperChoiceTile(
                    assetPath: DarkHomeWallpaper.nightMesh.assetPath,
                    label: DarkHomeWallpaper.nightMesh.displayLabel,
                    selected: darkHomeWallpaper == DarkHomeWallpaper.nightMesh,
                    onTap: () async {
                      await onDarkHomeWallpaperChanged(
                        DarkHomeWallpaper.nightMesh,
                      );
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _WallpaperChoiceTile extends StatelessWidget {
  const _WallpaperChoiceTile({
    required this.assetPath,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String assetPath;
  final String label;
  final bool selected;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final radius = BorderRadius.circular(AppRadius.lg);
    final borderColor = selected ? colors.primary : colors.borderDefault;
    final borderWidth = selected ? 2.0 : 1.0;

    return Semantics(
      button: true,
      selected: selected,
      label: '$label home background',
      child: Material(
        color: colors.bgElevated,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () async {
            await onTap();
          },
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(color: borderColor, width: borderWidth),
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.sm),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.asset(
                            assetPath,
                            fit: BoxFit.cover,
                            gaplessPlayback: true,
                          ),
                          if (selected)
                            DecoratedBox(
                              decoration: BoxDecoration(
                                border: Border.all(
                                  color: colors.primary.withValues(alpha: 0.35),
                                  width: 2,
                                ),
                              ),
                            ),
                          if (selected)
                            Align(
                              alignment: Alignment.topRight,
                              child: Padding(
                                padding: const EdgeInsets.all(AppSpacing.xs),
                                child: Icon(
                                  Icons.check_circle,
                                  size: 22,
                                  color: colors.primary,
                                  shadows: const [
                                    Shadow(
                                      color: Color(0x66FFFFFF),
                                      blurRadius: 4,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: selected ? colors.primary : colors.textPrimary,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
