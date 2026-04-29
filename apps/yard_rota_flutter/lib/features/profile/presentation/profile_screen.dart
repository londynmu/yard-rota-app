import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import 'themes_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
    required this.onLogout,
  });

  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
  onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
  onDarkHomeWallpaperChanged;
  final Future<void> Function() onLogout;

  /// Fixed profile grid: 3 columns × 4 rows.
  static const int _gridCrossAxisCount = 3;
  static const int _gridRowCount = 4;
  static const int _gridCellCount = _gridCrossAxisCount * _gridRowCount;

  static const List<_ProfileTileSpec> _tiles = [
    _ProfileTileSpec(
      title: 'Themes',
      icon: Icons.palette_outlined,
      isThemes: true,
    ),
    _ProfileTileSpec(
      title: 'Notifications',
      icon: Icons.notifications_none_outlined,
    ),
    _ProfileTileSpec(title: 'Privacy', icon: Icons.lock_outline),
    _ProfileTileSpec(title: 'Logout', icon: Icons.logout, isLogout: true),
    _ProfileTileSpec(title: 'About', icon: Icons.info_outline),
    _ProfileTileSpec(title: 'Account', icon: Icons.person_outline),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    final topContentInset = mq.padding.top + kToolbarHeight;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        flexibleSpace: ClipRect(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: isDark
                      ? [
                          colors.bgPrimary.withValues(alpha: 0.0),
                          colors.bgPrimary.withValues(alpha: 0.28),
                        ]
                      : [
                          Colors.white.withValues(alpha: 0.0),
                          Colors.white.withValues(alpha: 0.42),
                        ],
                ),
              ),
            ),
          ),
        ),
        title: const Text('Profile'),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Image.asset(
              homeBackgroundAssetPath(
                brightness: isDark ? Brightness.dark : Brightness.light,
                lightWallpaper: lightHomeWallpaper,
                darkWallpaper: darkHomeWallpaper,
              ),
              fit: BoxFit.cover,
              alignment: Alignment.center,
              gaplessPlayback: true,
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              topContentInset,
              AppSpacing.lg,
              mq.padding.bottom + AppSpacing.lg,
            ),
            child: Material(
              color: Colors.transparent,
              clipBehavior: Clip.hardEdge,
              child: ClipRect(
                child: GridView.builder(
                  // Same overscroll “stretch” as Calendar: scrollable even when content fits.
                  physics: const AlwaysScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: _gridCrossAxisCount,
                    mainAxisSpacing: AppSpacing.sm,
                    crossAxisSpacing: AppSpacing.sm,
                    childAspectRatio: 1.0,
                  ),
                  itemCount: _gridCellCount,
                  itemBuilder: (context, index) {
                    if (index >= _tiles.length) {
                      return const _ProfileGridEmptySlot();
                    }
                    final spec = _tiles[index];
                    return _ProfileGridCard(
                      spec: spec,
                      onTap: () => _onTileTap(context, spec),
                    );
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onTileTap(BuildContext context, _ProfileTileSpec spec) async {
    if (spec.isLogout) {
      await onLogout();
      return;
    }
    if (spec.isThemes) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => ThemesScreen(
            themeMode: themeMode,
            onThemeModeChanged: onThemeModeChanged,
            lightHomeWallpaper: lightHomeWallpaper,
            darkHomeWallpaper: darkHomeWallpaper,
            onLightHomeWallpaperChanged: onLightHomeWallpaperChanged,
            onDarkHomeWallpaperChanged: onDarkHomeWallpaperChanged,
          ),
        ),
      );
      return;
    }
    if (!context.mounted) {
      return;
    }
    AppToast.show(context, '${spec.title} is coming soon.');
  }
}

class _ProfileTileSpec {
  const _ProfileTileSpec({
    required this.title,
    required this.icon,
    this.isThemes = false,
    this.isLogout = false,
  });

  final String title;
  final IconData icon;
  final bool isThemes;
  final bool isLogout;
}

class _ProfileGridCard extends StatelessWidget {
  const _ProfileGridCard({required this.spec, required this.onTap});

  final _ProfileTileSpec spec;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Material(
      color: colors.bgElevated,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(spec.icon, size: 32, color: colors.primary),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  spec.title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Same footprint as [_ProfileGridCard], no action (fills 3×4 grid slots).
class _ProfileGridEmptySlot extends StatelessWidget {
  const _ProfileGridEmptySlot();

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgElevated.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: colors.borderDefault.withValues(alpha: 0.55)),
      ),
    );
  }
}
