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

  static const double _cardFillOpacity = 0.5;

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
    _ProfileTileSpec(title: 'Logout', icon: Icons.logout, isLogout: true),
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
                    crossAxisCount: 3,
                    mainAxisSpacing: AppSpacing.sm,
                    crossAxisSpacing: AppSpacing.sm,
                    childAspectRatio: 1.0,
                  ),
                  itemCount: _tiles.length,
                  itemBuilder: (context, index) {
                    final spec = _tiles[index];
                    return _AnimatedProfileGridCard(
                      index: index,
                      fillOpacity: _cardFillOpacity,
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

/// Staggered fade/slide-in plus a gentle vertical drift so tiles feel alive.
class _AnimatedProfileGridCard extends StatefulWidget {
  const _AnimatedProfileGridCard({
    required this.index,
    required this.fillOpacity,
    required this.spec,
    required this.onTap,
  });

  final int index;
  final double fillOpacity;
  final _ProfileTileSpec spec;
  final VoidCallback onTap;

  @override
  State<_AnimatedProfileGridCard> createState() =>
      _AnimatedProfileGridCardState();
}

class _AnimatedProfileGridCardState extends State<_AnimatedProfileGridCard>
    with TickerProviderStateMixin {
  late final AnimationController _enter;
  late final AnimationController _float;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  static const Duration _enterDuration = Duration(milliseconds: 460);
  static const int _staggerMs = 70;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(vsync: this, duration: _enterDuration);
    _float = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: 2480 + widget.index * 220),
    )..repeat(reverse: true);

    _fade = CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.14),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _enter, curve: Curves.easeOutCubic));

    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(
        Duration(milliseconds: _staggerMs * widget.index),
        () {
          if (mounted) {
            _enter.forward();
          }
        },
      );
    });
  }

  @override
  void dispose() {
    _enter.dispose();
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_enter, _float]),
      builder: (context, _) {
        final bob = -2.2 + 4.4 * _float.value;
        final iconTilt = (_float.value - 0.5) * 0.06;
        return Transform.translate(
          offset: Offset(0, bob),
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: _slide,
              child: _ProfileTileSurface(
                fillOpacity: widget.fillOpacity,
                spec: widget.spec,
                onTap: widget.onTap,
                iconTilt: iconTilt,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Tile chrome; [iconTilt] is driven by the parent float loop.
class _ProfileTileSurface extends StatelessWidget {
  const _ProfileTileSurface({
    required this.fillOpacity,
    required this.spec,
    required this.onTap,
    required this.iconTilt,
  });

  final double fillOpacity;
  final _ProfileTileSpec spec;
  final VoidCallback onTap;
  final double iconTilt;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            color: colors.bgElevated.withValues(alpha: fillOpacity),
            borderRadius: BorderRadius.circular(AppRadius.lg),
            border: Border.all(color: colors.borderDefault),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Transform.rotate(
                  angle: iconTilt,
                  child: Icon(spec.icon, size: 32, color: colors.primary),
                ),
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
