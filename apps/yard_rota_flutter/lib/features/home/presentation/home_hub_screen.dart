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
import '../../pre_check/data/pre_check_repository.dart';
import '../../pre_check/presentation/pre_check_screen.dart';
import '../../profile/presentation/themes_screen.dart';
import '../../stats/data/stats_repository.dart';
import '../../stats/presentation/stats_screen.dart';

class HomeHubScreen extends StatefulWidget {
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
    this.preCheckRepository,
    required this.statsRepository,
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
  final PreCheckRepository? preCheckRepository;
  final StatsRepository statsRepository;

  static const List<_HubTileSpec> _primaryTiles = [
    _HubTileSpec(
      title: 'Calendar',
      icon: Icons.calendar_month_outlined,
      isCalendar: true,
    ),
    _HubTileSpec(
      title: 'Stats',
      icon: Icons.query_stats_outlined,
      isStats: true,
    ),
  ];

  static const List<_HubTileSpec> _workTiles = [
    _HubTileSpec(
      title: 'My Rota',
      icon: Icons.calendar_view_week_outlined,
      isMyRota: true,
    ),
    _HubTileSpec(
      title: 'PreCheck',
      icon: Icons.fact_check_outlined,
      isPreCheck: true,
    ),
    _HubTileSpec(
      title: 'Notifications',
      icon: Icons.notifications_none_outlined,
    ),
  ];

  static const List<_HubTileSpec> _settingsTiles = [
    _HubTileSpec(title: 'Themes', icon: Icons.palette_outlined, isThemes: true),
    _HubTileSpec(title: 'Account', icon: Icons.person_outline, isAccount: true),
  ];

  static const List<_HubTileSpec> _homeCards = [
    ..._primaryTiles,
    ..._workTiles,
    ..._settingsTiles,
  ];

  @override
  State<HomeHubScreen> createState() => _HomeHubScreenState();
}

class _HomeHubScreenState extends State<HomeHubScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _titleEntranceController;

  @override
  void initState() {
    super.initState();
    _titleEntranceController = AnimationController(
      vsync: this,
      duration:
          AppLuxuryHomeGradient.textEntrancePerCard *
          HomeHubScreen._homeCards.length,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _titleEntranceController.forward();
      }
    });
  }

  @override
  void dispose() {
    _titleEntranceController.dispose();
    super.dispose();
  }

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
                lightWallpaper: widget.lightHomeWallpaper,
                darkWallpaper: widget.darkHomeWallpaper,
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
                    return GridView.builder(
                      padding: EdgeInsets.zero,
                      itemCount: HomeHubScreen._homeCards.length,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: AppSpacing.sm,
                            mainAxisSpacing: AppSpacing.sm,
                            childAspectRatio: 1,
                          ),
                      itemBuilder: (context, index) {
                        final spec = HomeHubScreen._homeCards[index];
                        return _HubSquareTile(
                          spec: spec,
                          index: index,
                          cardCount: HomeHubScreen._homeCards.length,
                          titleEntranceAnimation: _titleEntranceController,
                          onTap: () => _onTileTap(ctx, spec),
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
            displayName: widget.session.displayName,
            calendarRepository: widget.calendarRepository,
            availabilityRepository: widget.availabilityRepository,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
          ),
        ),
      );
      return;
    }
    if (spec.isThemes) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => ThemesScreen(
            themeMode: widget.themeMode,
            onThemeModeChanged: widget.onThemeModeChanged,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
            onLightHomeWallpaperChanged: widget.onLightHomeWallpaperChanged,
            onDarkHomeWallpaperChanged: widget.onDarkHomeWallpaperChanged,
          ),
        ),
      );
      return;
    }
    if (spec.isMyRota) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => MyRotaScreen(
            repository: widget.myRotaRepository,
            session: widget.session,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
          ),
        ),
      );
      return;
    }
    if (spec.isPreCheck) {
      final repository = widget.preCheckRepository;
      if (repository == null) {
        AppToast.show(context, 'PreCheck is coming soon.');
        return;
      }
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => PreCheckScreen(
            repository: repository,
            session: widget.session,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
          ),
        ),
      );
      return;
    }
    if (spec.isStats) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => StatsScreen(
            repository: widget.statsRepository,
            session: widget.session,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
          ),
        ),
      );
      return;
    }
    if (spec.isAccount) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => _AccountScreen(
            session: widget.session,
            lightHomeWallpaper: widget.lightHomeWallpaper,
            darkHomeWallpaper: widget.darkHomeWallpaper,
            onLogout: widget.onLogout,
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

class _AccountScreen extends StatelessWidget {
  const _AccountScreen({
    required this.session,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLogout,
  });

  final UserSession session;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function() onLogout;

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
        title: const Text('Account'),
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
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _AccountInfoCard(session: session),
                    const SizedBox(height: AppSpacing.sm),
                    _AccountActionCard(
                      title: 'Sign out',
                      subtitle: 'End this session and return to sign in.',
                      icon: Icons.logout,
                      onTap: onLogout,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountInfoCard extends StatelessWidget {
  const _AccountInfoCard({required this.session});

  final UserSession session;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final role = session.userRole?.trim();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.bgElevated.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: colors.borderDefault),
        boxShadow: [
          BoxShadow(
            color: colors.shadow.withValues(alpha: 0.12),
            blurRadius: AppElevation.level4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: colors.infoBg,
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(color: colors.borderDefault),
              ),
              child: Icon(Icons.person_outline, color: colors.info),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    session.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: colors.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (role != null && role.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      role,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountActionCard extends StatelessWidget {
  const _AccountActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Material(
        color: colors.bgElevated.withValues(alpha: 0.9),
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              border: Border.all(color: colors.borderDefault),
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: colors.dangerBg,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: colors.borderDefault),
                    ),
                    child: Icon(icon, color: colors.danger),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                color: colors.textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          subtitle,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: colors.textSecondary,
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

class _HubTileSpec {
  const _HubTileSpec({
    required this.title,
    required this.icon,
    this.isCalendar = false,
    this.isThemes = false,
    this.isMyRota = false,
    this.isPreCheck = false,
    this.isStats = false,
    this.isAccount = false,
  });

  final String title;
  final IconData icon;
  final bool isCalendar;
  final bool isThemes;
  final bool isMyRota;
  final bool isPreCheck;
  final bool isStats;
  final bool isAccount;
}

class _HubSquareTile extends StatelessWidget {
  const _HubSquareTile({
    required this.spec,
    required this.index,
    required this.cardCount,
    required this.titleEntranceAnimation,
    required this.onTap,
  });

  final _HubTileSpec spec;
  final int index;
  final int cardCount;
  final Animation<double> titleEntranceAnimation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final contentColor = isDark
        ? AppLuxuryHomeGradient.darkContent
        : AppLuxuryHomeGradient.lightContent;
    final overlayColor = isDark ? Colors.black : Colors.white;
    final titleAnimation = CurvedAnimation(
      parent: titleEntranceAnimation,
      curve: Interval(
        index / cardCount,
        (index + 1) / cardCount,
        curve: AppMotion.emphasized,
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.lg),
              boxShadow: [
                BoxShadow(
                  color: colors.shadow.withValues(alpha: 0.14),
                  blurRadius: AppElevation.level4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                _LuxuryGradientSlice(index: index),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        overlayColor.withValues(
                          alpha: AppLuxuryHomeGradient.contentOverlayStartAlpha,
                        ),
                        overlayColor.withValues(
                          alpha: AppLuxuryHomeGradient.contentOverlayEndAlpha,
                        ),
                      ],
                    ),
                  ),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    border: Border.all(
                      color: contentColor.withValues(
                        alpha: AppLuxuryHomeGradient.borderAlpha,
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: contentColor.withValues(
                            alpha: AppLuxuryHomeGradient.iconSurfaceAlpha,
                          ),
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(
                            color: contentColor.withValues(
                              alpha: AppLuxuryHomeGradient.borderAlpha,
                            ),
                          ),
                        ),
                        child: Icon(spec.icon, color: contentColor, size: 22),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      ClipRect(
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(
                              AppLuxuryHomeGradient.textEntranceSlideX,
                              0,
                            ),
                            end: Offset.zero,
                          ).animate(titleAnimation),
                          child: FadeTransition(
                            opacity: titleAnimation,
                            child: Text(
                              spec.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.labelMedium
                                  ?.copyWith(
                                    color: contentColor,
                                    fontWeight: FontWeight.w700,
                                    shadows: [
                                      Shadow(
                                        color:
                                            (isDark
                                                    ? Colors.black
                                                    : Colors.white)
                                                .withValues(
                                                  alpha: AppLuxuryHomeGradient
                                                      .textShadowAlpha,
                                                ),
                                        blurRadius: AppElevation.level4,
                                        offset: const Offset(0, 1),
                                      ),
                                    ],
                                  ),
                            ),
                          ),
                        ),
                      ),
                    ],
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

class _LuxuryGradientSlice extends StatelessWidget {
  const _LuxuryGradientSlice({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        return ClipRect(
          child: OverflowBox(
            alignment: Alignment.topCenter,
            minWidth: width,
            maxWidth: width,
            minHeight: AppLuxuryHomeGradient.virtualHeight,
            maxHeight: AppLuxuryHomeGradient.virtualHeight,
            child: Transform.translate(
              offset: Offset(0, -index * AppLuxuryHomeGradient.sliceStride),
              child: SizedBox(
                width: width,
                height: AppLuxuryHomeGradient.virtualHeight,
                child: const _LuxuryGradientCanvas(),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _LuxuryGradientCanvas extends StatelessWidget {
  const _LuxuryGradientCanvas();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final gradientColors = isDark
        ? AppLuxuryHomeGradient.darkColors
        : AppLuxuryHomeGradient.lightColors;
    final veilColor = isDark ? Colors.black : Colors.white;
    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: gradientColors,
              stops: AppLuxuryHomeGradient.stops,
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0.86, -0.78),
              radius: 0.92,
              colors: [
                gradientColors[5].withValues(alpha: isDark ? 0.38 : 0.30),
                gradientColors[2].withValues(alpha: isDark ? 0.16 : 0.20),
                Colors.transparent,
              ],
              stops: const [0.0, 0.42, 1.0],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(-0.8, 0.25),
              radius: 0.86,
              colors: [
                gradientColors[3].withValues(alpha: isDark ? 0.34 : 0.26),
                gradientColors[1].withValues(alpha: isDark ? 0.15 : 0.22),
                Colors.transparent,
              ],
              stops: const [0.0, 0.48, 1.0],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: const Alignment(0.18, 0.92),
              radius: 0.78,
              colors: [
                gradientColors[4].withValues(alpha: isDark ? 0.30 : 0.24),
                Colors.transparent,
              ],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                veilColor.withValues(alpha: isDark ? 0.02 : 0.08),
                veilColor.withValues(alpha: isDark ? 0.24 : 0.18),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
