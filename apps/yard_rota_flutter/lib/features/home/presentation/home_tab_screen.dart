import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/glass_bar_surface.dart';
import '../../../core/ui/nav_pill.dart';
import '../../breaks/presentation/breaks_screen.dart';
import '../../calendar/data/availability_repository.dart';
import '../../calendar/data/calendar_repository.dart';
import '../../calendar/presentation/calendar_screen.dart';
import '../../induction/presentation/induction_guide_screen.dart';
import '../../my_rota/data/my_rota_repository.dart';
import '../../my_rota/presentation/your_shifts_this_week_card.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../today/presentation/today_screen.dart';
import '../data/stage_one_repository.dart';

enum HomeSection { calendar, breaks, info }

/// Home tab: Calendar / Breaks / Info switcher with the notification bell.
class HomeTabScreen extends StatefulWidget {
  const HomeTabScreen({
    super.key,
    required this.session,
    required this.calendarRepository,
    required this.availabilityRepository,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
    required this.onOpenPreCheck,
    required this.onTrack,
    this.stageOneRepository,
    this.myRotaRepository,
    this.onOpenMyRota,
  });

  final UserSession session;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final VoidCallback onOpenPreCheck;
  final void Function(String path, String title) onTrack;
  final StageOneRepository? stageOneRepository;
  final MyRotaRepository? myRotaRepository;
  final VoidCallback? onOpenMyRota;

  @override
  State<HomeTabScreen> createState() => HomeTabScreenState();
}

class HomeTabScreenState extends State<HomeTabScreen>
    with WidgetsBindingObserver {
  HomeSection _section = HomeSection.calendar;
  final Set<HomeSection> _visited = <HomeSection>{HomeSection.calendar};
  int _unreadNotifications = 0;
  int _infoGeneration = 0;
  bool _needsPreCheck = false;
  Timer? _preCheckTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUnreadNotifications();
    _loadPreCheckReminder();
    // Re-check so the card appears when rota start_time is reached.
    _preCheckTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      _loadPreCheckReminder();
    });
  }

  @override
  void dispose() {
    _preCheckTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadPreCheckReminder();
      _loadUnreadNotifications();
    }
  }

  Future<void> _loadPreCheckReminder() async {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    try {
      final needs = await repository.needsPreCheck(
        userId: widget.session.userId,
      );
      if (!mounted) return;
      if (needs == _needsPreCheck) return;
      setState(() => _needsPreCheck = needs);
    } catch (_) {
      // Reminder is optional; calendar still works without it.
    }
  }

  void showCalendar() => _selectSection(HomeSection.calendar);

  /// Used when a break push notification is opened.
  void showBreaks() => _selectSection(HomeSection.breaks);

  void _selectSection(HomeSection section) {
    if (section == _section) return;
    setState(() {
      _section = section;
      _visited.add(section);
    });
    final (path, title) = switch (section) {
      HomeSection.calendar => ('/calendar', 'Calendar'),
      HomeSection.breaks => ('/brakes', 'Breaks'),
      HomeSection.info => ('/calendar/info', 'Info'),
    };
    widget.onTrack(path, title);
  }

  Future<void> _loadUnreadNotifications() async {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    try {
      final count = await repository.loadNotificationBadgeCount(
        isAdmin: widget.session.isAdmin,
      );
      if (!mounted) return;
      setState(() => _unreadNotifications = count);
    } catch (_) {
      // The badge is a hint only; the notifications screen reports errors.
    }
  }

  Future<void> _openNotifications() async {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    widget.onTrack('/notifications', 'Notifications');
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
    await _loadUnreadNotifications();
  }

  void _openGuide() {
    final repository = widget.stageOneRepository;
    if (repository == null) return;
    widget.onTrack('/yard-guide', 'Yard induction guide');
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => InductionGuideScreen(
          repository: repository,
          lightHomeWallpaper: widget.lightHomeWallpaper,
          darkHomeWallpaper: widget.darkHomeWallpaper,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topInset = mq.padding.top + AppComponentTokens.appBarHeight;

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBodyBehindAppBar: true,
      // Not an AppBar: its title slot adds extra trailing space, and the bar
      // must line up exactly with the content column below.
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(AppComponentTokens.appBarHeight),
        child: GlassBarSurface(
          edge: GlassBarEdge.top,
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: AppComponentTokens.appBarHeight,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: Center(
                  child: _HomeSectionBar(
                    selected: _section,
                    onSelected: _selectSection,
                    unreadNotifications: _unreadNotifications,
                    onBellPressed: widget.stageOneRepository == null
                        ? null
                        : _openNotifications,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          topInset + AppSpacing.sm,
          AppSpacing.lg,
          mq.padding.bottom + AppSpacing.lg,
        ),
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          removeBottom: true,
          child: IndexedStack(
            index: _section.index,
            sizing: StackFit.expand,
            children: [
              for (final section in HomeSection.values)
                _visited.contains(section)
                    ? _buildSection(section)
                    : const SizedBox.shrink(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSection(HomeSection section) {
    final repository = widget.stageOneRepository;
    switch (section) {
      case HomeSection.calendar:
        final myRota = widget.myRotaRepository;
        // PreCheck banner stays pinned above the calendar (outside its scroll)
        // whenever the daily check is still outstanding — not dismissible.
        // SizedBox.expand gives the Column a bounded height so Expanded works
        // inside IndexedStack.
        return SizedBox.expand(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_needsPreCheck) ...[
                PreCheckReminderCard(onOpen: widget.onOpenPreCheck),
                const SizedBox(height: AppSpacing.sm),
              ],
              Expanded(
                child: CalendarScreen(
                  embedded: true,
                  displayName: widget.session.displayName,
                  calendarRepository: widget.calendarRepository,
                  availabilityRepository: widget.availabilityRepository,
                  lightHomeWallpaper: widget.lightHomeWallpaper,
                  darkHomeWallpaper: widget.darkHomeWallpaper,
                  onRefresh: _loadPreCheckReminder,
                  footer: myRota == null
                      ? null
                      : YourShiftsThisWeekCard(
                          repository: myRota,
                          session: widget.session,
                          onOpenMyRota: widget.onOpenMyRota,
                        ),
                ),
              ),
            ],
          ),
        );
      case HomeSection.breaks:
        if (repository == null) {
          return const _UnavailableCard(
            message: 'Breaks are unavailable. Try again later.',
          );
        }
        return BreaksPanel(repository: repository, session: widget.session);
      case HomeSection.info:
        if (repository == null) {
          return const _UnavailableCard(
            message: 'Info is unavailable. Try again later.',
          );
        }
        return RefreshIndicator(
          onRefresh: () async => setState(() => _infoGeneration++),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              TodayPanel(
                key: ValueKey<int>(_infoGeneration),
                repository: repository,
                onOpenGuide: _openGuide,
              ),
            ],
          ),
        );
    }
  }
}

class _HomeSectionBar extends StatelessWidget {
  const _HomeSectionBar({
    required this.selected,
    required this.onSelected,
    required this.unreadNotifications,
    this.onBellPressed,
  });

  final HomeSection selected;
  final ValueChanged<HomeSection> onSelected;
  final int unreadNotifications;

  /// Bell is hidden when notifications are unavailable.
  final VoidCallback? onBellPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      height: AppHomeTabs.segmentHeight + AppHomeTabs.trackPadding * 2,
      padding: const EdgeInsets.all(AppHomeTabs.trackPadding),
      decoration: BoxDecoration(
        color: colors.bgPrimary.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: colors.borderDefault.withValues(alpha: 0.45),
          width: AppStroke.thin,
        ),
      ),
      child: Row(
        children: [
          for (final section in HomeSection.values)
            Expanded(
              child: _HomeSectionSegment(
                section: section,
                selected: section == selected,
                onTap: () => onSelected(section),
              ),
            ),
          if (onBellPressed case final onBellPressed?)
            _BellSegment(
              unreadCount: unreadNotifications,
              onPressed: onBellPressed,
            ),
        ],
      ),
    );
  }
}

class _HomeSectionSegment extends StatelessWidget {
  const _HomeSectionSegment({
    required this.section,
    required this.selected,
    required this.onTap,
  });

  final HomeSection section;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (label, icon) = switch (section) {
      HomeSection.calendar => ('Calendar', Icons.calendar_month_outlined),
      HomeSection.breaks => ('Breaks', Icons.free_breakfast_outlined),
      HomeSection.info => ('Info', Icons.info_outline),
    };
    final foreground = bottomNavIconColor(
      colors,
      selected: selected,
      isDark: isDark,
    );
    final labelColor = bottomNavLabelColor(
      colors,
      selected: selected,
      isDark: isDark,
    );

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    navBarIcon(
                      icon,
                      size: AppHomeTabs.segmentIconSize,
                      color: foreground,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.labelSmall.copyWith(
                          color: labelColor,
                          fontWeight: FontWeight.w400,
                          fontSize: AppNavPill.bottomLabelFontSize,
                        ),
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppNavPill.bottomIndicatorInset,
                  ),
                  child: AnimatedContainer(
                    duration: AppMotion.normal,
                    curve: AppMotion.emphasized,
                    margin: const EdgeInsets.only(top: AppSpacing.xxs),
                    width: double.infinity,
                    height: AppNavPill.bottomIndicatorHeight,
                    decoration: BoxDecoration(
                      color: selected
                          ? colors.primary.withValues(
                              alpha: isDark
                                  ? AppNavPill.bottomIndicatorAlpha
                                  : AppNavPill.bottomIndicatorAlphaLight,
                            )
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppRadius.full),
                    ),
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

class _BellSegment extends StatelessWidget {
  const _BellSegment({required this.unreadCount, required this.onPressed});

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

class _UnavailableCard extends StatelessWidget {
  const _UnavailableCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: AppCard(
        child: SizedBox(
          width: double.infinity,
          child: Text(message, textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
