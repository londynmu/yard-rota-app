import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/nav_pill.dart';
import '../../../core/ui/shell_bottom_nav.dart';
import '../../home/data/stage_one_repository.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../profile/presentation/account_menu_screen.dart';
import '../../push/push_messaging_service.dart'
    show PushMessagingService, PushNavigationTarget, pushNavigationTargetForType;
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../data/transport_dashboard_repository.dart';
import '../domain/transport_dashboard_models.dart';
import 'transport_breaks_live_screen.dart';
import 'transport_rota_screen.dart';
import 'transport_today_screen.dart';

enum TransportManagerTab { today, rota, breaks, account }

/// Root chrome for pure `transport_manager`: wallpaper, top bell, Today first.
class TransportManagerShell extends StatefulWidget {
  const TransportManagerShell({
    super.key,
    required this.apiClient,
    required this.session,
    required this.onLogout,
    required this.onProfileSaved,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onLightHomeWallpaperChanged,
    required this.onDarkHomeWallpaperChanged,
    this.stageOneRepository,
    this.stageTwoRepository,
    this.stageThreeRepository,
    this.pushMessaging,
    this.dashboardRepository,
  });

  final ApiClient apiClient;
  final UserSession session;
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
  final StageOneRepository? stageOneRepository;
  final StageTwoRepository? stageTwoRepository;
  final StageThreeRepository? stageThreeRepository;
  final PushMessagingService? pushMessaging;
  final TransportDashboardRepository? dashboardRepository;

  @override
  State<TransportManagerShell> createState() => _TransportManagerShellState();
}

class _TransportManagerShellState extends State<TransportManagerShell> {
  TransportManagerTab _current = TransportManagerTab.today;
  final Set<TransportManagerTab> _visited = {
    TransportManagerTab.today,
  };
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _refreshBadge();
    widget.pushMessaging?.setNavigationHandler(_onPushNavigate);
  }

  @override
  void dispose() {
    widget.pushMessaging?.setNavigationHandler(null);
    super.dispose();
  }

  void _onPushNavigate(String type, Map<String, String> data) {
    if (!mounted) return;
    if (pushNavigationTargetForType(type) ==
        PushNavigationTarget.notifications) {
      _openNotifications();
    }
  }

  Future<void> _refreshBadge() async {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    try {
      final count = await repository.loadNotificationBadgeCount(
        isAdmin: widget.session.isAdmin,
      );
      if (!mounted) return;
      setState(() => _unread = count);
    } catch (_) {}
  }

  Future<void> _openNotifications() async {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => NotificationsScreen(
          repository: repository,
          session: widget.session,
          lightHomeWallpaper: widget.lightHomeWallpaper,
          darkHomeWallpaper: widget.darkHomeWallpaper,
        ),
      ),
    );
    await _refreshBadge();
  }

  void _select(TransportManagerTab tab) {
    setState(() {
      _current = tab;
      _visited.add(tab);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final topInset = MediaQuery.paddingOf(context).top;

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
              for (final tab in TransportManagerTab.values)
                _visited.contains(tab)
                    ? _buildTab(tab, topInset: topInset)
                    : const SizedBox.shrink(),
            ],
          ),
          if (_current != TransportManagerTab.account)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: GlassBarSurface(
                edge: GlassBarEdge.top,
                child: SafeArea(
                  bottom: false,
                  child: SizedBox(
                    height: AppComponentTokens.appBarHeight,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  switch (_current) {
                                    TransportManagerTab.today => 'Today',
                                    TransportManagerTab.rota => 'Rota',
                                    TransportManagerTab.breaks => 'Breaks',
                                    TransportManagerTab.account => 'Account',
                                  },
                                  style: Theme.of(context).textTheme.titleLarge
                                      ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: colors.textPrimary,
                                        height: 1.15,
                                      ),
                                ),
                                Text(
                                  transportFormatDisplayDate(
                                    transportEffectiveTodayYmd(),
                                  ),
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                        color: colors.textSecondary,
                                        height: 1.2,
                                      ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          _BellButton(
                            unreadCount: _unread,
                            onPressed: _openNotifications,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: ShellBottomNavBar(
        destinations: const [
          ShellBottomNavDestination(
            label: 'Today',
            icon: Icons.today_outlined,
          ),
          ShellBottomNavDestination(
            label: 'Rota',
            icon: Icons.calendar_view_day_outlined,
          ),
          ShellBottomNavDestination(
            label: 'Breaks',
            icon: Icons.free_breakfast_outlined,
          ),
          ShellBottomNavDestination(
            label: 'Account',
            icon: Icons.person_outline_rounded,
          ),
        ],
        selectedIndex: _current.index,
        onDestinationSelected: (index) =>
            _select(TransportManagerTab.values[index]),
      ),
    );
  }

  Widget _buildTab(TransportManagerTab tab, {required double topInset}) {
    final contentTop = topInset + AppComponentTokens.appBarHeight;
    final bottomPad =
        MediaQuery.paddingOf(context).bottom +
        AppComponentTokens.bottomNavHeight +
        AppSpacing.sm;

    return switch (tab) {
      TransportManagerTab.today => Padding(
        padding: EdgeInsets.only(top: contentTop),
        child: TransportTodayScreen(
          session: widget.session,
          dashboardRepository: widget.dashboardRepository,
          embedded: true,
          onOpenRota: () => _select(TransportManagerTab.rota),
          onOpenBreaks: () => _select(TransportManagerTab.breaks),
          bottomPadding: bottomPad,
        ),
      ),
      TransportManagerTab.rota => Padding(
        padding: EdgeInsets.only(top: contentTop),
        child: TransportRotaScreen(
          session: widget.session,
          dashboardRepository: widget.dashboardRepository,
          embedded: true,
          bottomPadding: bottomPad,
        ),
      ),
      TransportManagerTab.breaks => Padding(
        padding: EdgeInsets.only(top: contentTop),
        child: TransportBreaksLiveScreen(
          session: widget.session,
          dashboardRepository: widget.dashboardRepository,
          embedded: true,
          bottomPadding: bottomPad,
        ),
      ),
      TransportManagerTab.account => AccountMenuScreen(
        apiClient: widget.apiClient,
        session: widget.session,
        stageOneRepository: widget.stageOneRepository,
        stageTwoRepository: widget.stageTwoRepository,
        stageThreeRepository: widget.stageThreeRepository,
        pushMessaging: widget.pushMessaging,
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
}

class _BellButton extends StatelessWidget {
  const _BellButton({required this.unreadCount, required this.onPressed});

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bellColor = bottomNavIconColor(
      colors,
      selected: false,
      isDark: isDark,
    );
    return SizedBox(
      width: AppHomeTabs.bellSegmentWidth,
      height: AppHomeTabs.bellSegmentWidth,
      child: Tooltip(
        message: 'Notifications',
        child: Semantics(
          button: true,
          label: unreadCount > 0
              ? 'Notifications, $unreadCount unread'
              : 'Notifications',
          excludeSemantics: true,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: onPressed,
              child: Center(
                child: Badge(
                  isLabelVisible: unreadCount > 0,
                  label: Text(unreadCount > 99 ? '99+' : '$unreadCount'),
                  backgroundColor: colors.danger,
                  textColor: colors.onDanger,
                  child: navBarIcon(
                    Icons.notifications_none_outlined,
                    size: AppHomeTabs.segmentIconSize,
                    color: bellColor,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

