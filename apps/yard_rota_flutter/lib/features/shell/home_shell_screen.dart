import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/models.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/theme/theme_extensions.dart';
import '../../core/theme/home_wallpaper.dart';
import '../../core/ui/app_card.dart';
import '../../core/ui/glass_bar_surface.dart';
import '../../core/ui/nav_pill.dart';
import '../calendar/data/availability_repository.dart';
import '../calendar/data/calendar_repository.dart';
import '../home/data/stage_one_repository.dart';
import '../home/presentation/home_tab_screen.dart';
import '../my_rota/data/my_rota_repository.dart';
import '../my_rota/presentation/my_rota_screen.dart';
import '../pre_check/data/pre_check_repository.dart';
import '../pre_check/presentation/pre_check_screen.dart';
import '../profile/presentation/account_menu_screen.dart';
import '../stage_three/data/stage_three_repository.dart';
import '../stage_two/data/stage_two_repository.dart';
import '../stats/data/stats_repository.dart';
import '../stats/presentation/stats_screen.dart';

enum ShellTab { home, myRota, stats, preCheck, account }

/// Signed-in layout for shunters and admins: Home (calendar) first, with a
/// bottom menu for My Rota, Stats, PreCheck and Account / Admin.
class HomeShellScreen extends StatefulWidget {
  const HomeShellScreen({
    super.key,
    required this.apiClient,
    required this.session,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.myRotaRepository,
    required this.statsRepository,
    this.preCheckRepository,
    this.stageOneRepository,
    this.stageTwoRepository,
    this.stageThreeRepository,
    required this.onLogout,
    required this.onProfileSaved,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
  });

  final ApiClient apiClient;
  final UserSession session;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final MyRotaRepository myRotaRepository;
  final StatsRepository statsRepository;
  final PreCheckRepository? preCheckRepository;
  final StageOneRepository? stageOneRepository;
  final StageTwoRepository? stageTwoRepository;
  final StageThreeRepository? stageThreeRepository;
  final Future<void> Function() onLogout;
  final ValueChanged<UserProfile> onProfileSaved;
  final ThemeMode themeMode;
  final Future<void> Function(ThemeMode mode) onThemeModeChanged;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final Future<void> Function(LightHomeWallpaper wallpaper)
  onLightHomeWallpaperChanged;
  final Future<void> Function(DarkHomeWallpaper wallpaper)
  onDarkHomeWallpaperChanged;

  @override
  State<HomeShellScreen> createState() => _HomeShellScreenState();
}

class _HomeShellScreenState extends State<HomeShellScreen> {
  final GlobalKey<HomeTabScreenState> _homeTabKey =
      GlobalKey<HomeTabScreenState>();
  ShellTab _current = ShellTab.home;

  /// Tabs are built on first visit so start-up only loads the calendar.
  final Set<ShellTab> _visited = <ShellTab>{ShellTab.home};
  late final String _trackingSessionId;

  @override
  void initState() {
    super.initState();
    _trackingSessionId =
        'flutter_${DateTime.now().millisecondsSinceEpoch}_${widget.session.userId}';
    _track('/calendar', 'Calendar');
  }

  void _select(ShellTab tab) {
    if (tab == _current) {
      if (tab == ShellTab.home) {
        _homeTabKey.currentState?.showCalendar();
      }
      return;
    }
    setState(() {
      _current = tab;
      _visited.add(tab);
    });
    final (path, title) = switch (tab) {
      ShellTab.home => ('/calendar', 'Calendar'),
      ShellTab.myRota => ('/my-rota', 'My Rota'),
      ShellTab.stats => ('/performance', 'Stats'),
      ShellTab.preCheck => ('/precheck', 'PreCheck'),
      ShellTab.account =>
        widget.session.isAdmin ? ('/admin', 'Admin') : ('/profile', 'Account'),
    };
    _track(path, title);
  }

  void _track(String path, String title) {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    repository
        .trackPageVisit(
          userId: widget.session.userId,
          path: path,
          title: title,
          sessionId: _trackingSessionId,
        )
        .catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isAdmin = widget.session.isAdmin;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBody: true,
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
          IndexedStack(
            index: _current.index,
            sizing: StackFit.expand,
            children: [
              for (final tab in ShellTab.values)
                _visited.contains(tab)
                    ? _buildTab(tab)
                    : const SizedBox.shrink(),
            ],
          ),
        ],
      ),
      bottomNavigationBar: GlassBarSurface(
        edge: GlassBarEdge.bottom,
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: AppComponentTokens.bottomNavHeight,
            child: Row(
              children: [
                for (final tab in ShellTab.values)
                  Expanded(
                    child: _ShellNavItem(
                      destination: _destinationFor(tab, isAdmin: isAdmin),
                      selected: tab == _current,
                      onTap: () => _select(tab),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  _NavDestination _destinationFor(ShellTab tab, {required bool isAdmin}) {
    return switch (tab) {
      ShellTab.home => const _NavDestination(
        'Home',
        Icons.home_outlined,
        Icons.home_rounded,
      ),
      ShellTab.myRota => const _NavDestination(
        'My Rota',
        Icons.calendar_view_week_outlined,
        Icons.calendar_view_week_rounded,
      ),
      ShellTab.stats => const _NavDestination(
        'Stats',
        Icons.query_stats_outlined,
        Icons.query_stats_rounded,
      ),
      ShellTab.preCheck => const _NavDestination(
        'PreCheck',
        Icons.fact_check_outlined,
        Icons.fact_check_rounded,
      ),
      ShellTab.account =>
        isAdmin
            ? const _NavDestination(
                'Admin',
                Icons.admin_panel_settings_outlined,
                Icons.admin_panel_settings_rounded,
              )
            : const _NavDestination(
                'Account',
                Icons.person_outline_rounded,
                Icons.person_rounded,
              ),
    };
  }

  Widget _buildTab(ShellTab tab) {
    return switch (tab) {
      ShellTab.home => HomeTabScreen(
        key: _homeTabKey,
        session: widget.session,
        calendarRepository: widget.calendarRepository,
        availabilityRepository: widget.availabilityRepository,
        stageOneRepository: widget.stageOneRepository,
        lightHomeWallpaper: widget.lightHomeWallpaper,
        darkHomeWallpaper: widget.darkHomeWallpaper,
        onOpenPreCheck: () => _select(ShellTab.preCheck),
        onOpenMyRota: () => _select(ShellTab.myRota),
        onTrack: _track,
      ),
      ShellTab.myRota => MyRotaScreen(
        repository: widget.myRotaRepository,
        session: widget.session,
        lightHomeWallpaper: widget.lightHomeWallpaper,
        darkHomeWallpaper: widget.darkHomeWallpaper,
      ),
      ShellTab.stats => StatsScreen(
        repository: widget.statsRepository,
        session: widget.session,
        lightHomeWallpaper: widget.lightHomeWallpaper,
        darkHomeWallpaper: widget.darkHomeWallpaper,
      ),
      ShellTab.preCheck => _buildPreCheckTab(),
      ShellTab.account => AccountMenuScreen(
        apiClient: widget.apiClient,
        session: widget.session,
        stageOneRepository: widget.stageOneRepository,
        stageTwoRepository: widget.stageTwoRepository,
        stageThreeRepository: widget.stageThreeRepository,
        onLogout: widget.onLogout,
        onProfileSaved: widget.onProfileSaved,
        themeMode: widget.themeMode,
        onThemeModeChanged: widget.onThemeModeChanged,
        lightHomeWallpaper: widget.lightHomeWallpaper,
        darkHomeWallpaper: widget.darkHomeWallpaper,
        onLightHomeWallpaperChanged: widget.onLightHomeWallpaperChanged,
        onDarkHomeWallpaperChanged: widget.onDarkHomeWallpaperChanged,
      ),
    };
  }

  Widget _buildPreCheckTab() {
    final repository = widget.preCheckRepository;
    if (repository == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(AppSpacing.lg),
          child: AppCard(
            child: Text(
              'PreCheck is unavailable. Try again later.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    return PreCheckScreen(
      repository: repository,
      session: widget.session,
      lightHomeWallpaper: widget.lightHomeWallpaper,
      darkHomeWallpaper: widget.darkHomeWallpaper,
    );
  }
}

class _NavDestination {
  const _NavDestination(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class _ShellNavItem extends StatelessWidget {
  const _ShellNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _NavDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Semantics(
      button: true,
      selected: selected,
      child: InkResponse(
        onTap: onTap,
        containedInkWell: true,
        highlightShape: BoxShape.rectangle,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: AppMotion.normal,
              curve: AppMotion.emphasized,
              width: AppNavPill.bottomPillWidth,
              height: AppNavPill.bottomPillHeight,
              decoration: navPillDecoration(colors, selected: selected),
              child: Icon(
                selected ? destination.selectedIcon : destination.icon,
                size: AppNavPill.bottomIconSize,
                color: navPillForeground(colors, selected: selected),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.labelMedium.copyWith(
                color: selected ? colors.primary : colors.textSecondary,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
