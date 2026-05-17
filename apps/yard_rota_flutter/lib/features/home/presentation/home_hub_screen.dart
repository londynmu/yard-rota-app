import 'dart:ui';

import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import '../../calendar/data/availability_repository.dart';
import '../../calendar/data/calendar_repository.dart';
import '../../calendar/presentation/calendar_screen.dart';
import '../../my_rota/data/my_rota_repository.dart';
import '../../my_rota/presentation/my_rota_screen.dart';
import '../../profile/presentation/themes_screen.dart';

class HomeHubScreen extends StatelessWidget {
  const HomeHubScreen({
    super.key,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
    required this.onLogout,
    required this.session,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.myRotaRepository,
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
  final UserSession session;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final MyRotaRepository myRotaRepository;

  static const List<_HubTileSpec> _primaryTiles = [
    _HubTileSpec(
      title: 'Calendar',
      icon: Icons.calendar_month_outlined,
      isCalendar: true,
    ),
  ];

  static const List<_HubTileSpec> _workTiles = [
    _HubTileSpec(
      title: 'My Rota',
      icon: Icons.calendar_view_week_outlined,
      isMyRota: true,
    ),
    _HubTileSpec(
      title: 'Notifications',
      icon: Icons.notifications_none_outlined,
    ),
  ];

  static const List<_HubTileSpec> _settingsTiles = [
    _HubTileSpec(title: 'Themes', icon: Icons.palette_outlined, isThemes: true),
    _HubTileSpec(title: 'Account', icon: Icons.person_outline),
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
        title: const Text('Home'),
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
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.lg,
                topContentInset,
                AppSpacing.lg,
                mq.padding.bottom + AppSpacing.lg,
              ),
              child: Material(
                color: Colors.transparent,
                clipBehavior: Clip.none,
                child: Builder(
                  builder: (ctx) {
                    return LayoutBuilder(
                      builder: (context, constraints) {
                        final maxW = constraints.maxWidth.isFinite
                            ? constraints.maxWidth
                            : MediaQuery.sizeOf(context).width -
                                  AppSpacing.lg * 2;
                        final gap = AppSpacing.sm;
                        final primaryTileH = (maxW * 0.42).clamp(150.0, 220.0);
                        final tileW = (maxW - gap) / 2;

                        return SingleChildScrollView(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              SizedBox(
                                height: primaryTileH,
                                child: _HubTileRow(
                                  gap: gap,
                                  tiles: _primaryTiles,
                                  onTileTap: (spec) => _onTileTap(ctx, spec),
                                ),
                              ),
                              SizedBox(height: gap),
                              SizedBox(
                                height: tileW,
                                child: _HubTileRow(
                                  gap: gap,
                                  tiles: _workTiles,
                                  onTileTap: (spec) => _onTileTap(ctx, spec),
                                ),
                              ),
                              SizedBox(height: gap),
                              SizedBox(
                                height: tileW,
                                child: _HubTileRow(
                                  gap: gap,
                                  tiles: _settingsTiles,
                                  onTileTap: (spec) => _onTileTap(ctx, spec),
                                ),
                              ),
                              SizedBox(height: AppSpacing.lg),
                              Center(
                                child: TextButton.icon(
                                  onPressed: onLogout,
                                  icon: const Icon(Icons.logout),
                                  label: const Text('Sign out'),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
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

  Future<void> _onTileTap(BuildContext context, _HubTileSpec spec) async {
    if (spec.isCalendar) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => CalendarScreen(
            displayName: session.displayName,
            calendarRepository: calendarRepository,
            availabilityRepository: availabilityRepository,
            lightHomeWallpaper: lightHomeWallpaper,
            darkHomeWallpaper: darkHomeWallpaper,
          ),
        ),
      );
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
    if (spec.isMyRota) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => MyRotaScreen(
            repository: myRotaRepository,
            session: session,
            lightHomeWallpaper: lightHomeWallpaper,
            darkHomeWallpaper: darkHomeWallpaper,
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

class _HubTileSpec {
  const _HubTileSpec({
    required this.title,
    required this.icon,
    this.isCalendar = false,
    this.isThemes = false,
    this.isMyRota = false,
  });

  final String title;
  final IconData icon;
  final bool isCalendar;
  final bool isThemes;
  final bool isMyRota;
}

/// Row of hub tiles with a one-shot staggered fade and drop from above.
class _HubTileRow extends StatefulWidget {
  const _HubTileRow({
    required this.gap,
    required this.tiles,
    required this.onTileTap,
  });

  final double gap;
  final List<_HubTileSpec> tiles;
  final void Function(_HubTileSpec spec) onTileTap;

  @override
  State<_HubTileRow> createState() => _HubTileRowState();
}

class _HubTileRowState extends State<_HubTileRow>
    with SingleTickerProviderStateMixin {
  static const Duration _enterDuration = Duration(milliseconds: 760);

  /// Vertical offset (px) above rest position when progress is 0.
  static const double _enterDropPx = 56;

  late final AnimationController _enterController;

  @override
  void initState() {
    super.initState();
    _enterController = AnimationController(
      vsync: this,
      duration: _enterDuration,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _enterController.forward();
      }
    });
  }

  @override
  void dispose() {
    _enterController.dispose();
    super.dispose();
  }

  double _entranceProgress(int index) {
    const stagger = 0.12;
    const each = 0.46;
    final t = _enterController.value;
    final start = index * stagger;
    final end = start + each;
    if (t <= start) {
      return 0;
    }
    if (t >= end) {
      return 1;
    }
    return Curves.easeOutCubic.transform((t - start) / (end - start));
  }

  Widget _tileSlot(int index) {
    final p = _entranceProgress(index);
    return Opacity(
      opacity: p.clamp(0.0, 1.0),
      child: Transform.translate(
        offset: Offset(0, -_enterDropPx * (1 - p)),
        child: _HubTileCard(
          spec: widget.tiles[index],
          onTap: () => widget.onTileTap(widget.tiles[index]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _enterController,
      builder: (context, _) {
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < widget.tiles.length; i++) ...[
              if (i > 0) SizedBox(width: widget.gap),
              Expanded(child: _tileSlot(i)),
            ],
          ],
        );
      },
    );
  }
}

class _HubTileCard extends StatelessWidget {
  const _HubTileCard({required this.spec, required this.onTap});

  static const double _meshOpacity = 0.5;

  static const _onMeshLabel = Color(0xFFF2F6FA);
  static const _onMeshIcon = Color(0xFFE8EEF5);

  final _HubTileSpec spec;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: Opacity(opacity: _meshOpacity, child: const _AuroraMesh()),
          ),
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              splashColor: Colors.white24,
              highlightColor: Colors.white10,
              child: Ink(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(spec.icon, size: 32, color: _onMeshIcon),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        spec.title,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: _onMeshLabel,
                          fontWeight: FontWeight.w600,
                          shadows: const [
                            Shadow(
                              color: Color(0x66000000),
                              blurRadius: 8,
                              offset: Offset(0, 1),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Aurora / Bonus (Figma `76:4754`) shared mesh for all hub tiles.
class _AuroraMesh extends StatelessWidget {
  const _AuroraMesh();

  @override
  Widget build(BuildContext context) {
    return const Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: Color(0xFF04030A)),
        _RadialMeshLayer(
          center: Alignment(0.88, -0.72),
          radius: 1.32,
          colors: [
            Color(0xFF6BD4E0),
            Color(0x995868C8),
            Color(0x33221440),
            Color(0x0004030A),
          ],
          stops: [0.0, 0.28, 0.55, 1.0],
        ),
        _RadialMeshLayer(
          center: Alignment(-0.55, 0.75),
          radius: 1.0,
          colors: [Color(0x66402070), Color(0x0004030A)],
          stops: [0.0, 1.0],
        ),
        _RadialMeshLayer(
          center: Alignment(0.35, 0.2),
          radius: 0.85,
          colors: [Color(0x40205080), Color(0x00000000)],
          stops: [0.0, 1.0],
        ),
      ],
    );
  }
}

class _RadialMeshLayer extends StatelessWidget {
  const _RadialMeshLayer({
    required this.center,
    required this.radius,
    required this.colors,
    required this.stops,
  });

  final Alignment center;
  final double radius;
  final List<Color> colors;
  final List<double> stops;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: center,
          radius: radius,
          colors: colors,
          stops: stops,
        ),
      ),
    );
  }
}
