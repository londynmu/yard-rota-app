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
import '../../notifications/presentation/notifications_screen.dart';
import '../../today/presentation/today_screen.dart';
import '../data/stage_one_repository.dart';
import 'my_day_card.dart';

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
    required this.onOpenMyRota,
    required this.onTrack,
    this.stageOneRepository,
  });

  final UserSession session;
  final CalendarRepository calendarRepository;
  final AvailabilityRepository availabilityRepository;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;
  final VoidCallback onOpenPreCheck;
  final VoidCallback onOpenMyRota;
  final void Function(String path, String title) onTrack;
  final StageOneRepository? stageOneRepository;

  @override
  State<HomeTabScreen> createState() => HomeTabScreenState();
}

class HomeTabScreenState extends State<HomeTabScreen> {
  HomeSection _section = HomeSection.calendar;
  final Set<HomeSection> _visited = <HomeSection>{HomeSection.calendar};
  final GlobalKey<MyDayCardState> _myDayKey = GlobalKey<MyDayCardState>();
  int _unreadNotifications = 0;
  int _infoGeneration = 0;

  @override
  void initState() {
    super.initState();
    _loadUnreadNotifications();
  }

  void showCalendar() => _selectSection(HomeSection.calendar);

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
      final notifications = await repository.loadNotifications();
      if (!mounted) return;
      setState(() {
        _unreadNotifications = notifications
            .where((item) => !item.isRead)
            .length;
      });
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
        builder: (_) => InductionGuideScreen(repository: repository),
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
        return CalendarScreen(
          embedded: true,
          displayName: widget.session.displayName,
          calendarRepository: widget.calendarRepository,
          availabilityRepository: widget.availabilityRepository,
          lightHomeWallpaper: widget.lightHomeWallpaper,
          darkHomeWallpaper: widget.darkHomeWallpaper,
          footer: repository == null
              ? null
              : MyDayCard(
                  key: _myDayKey,
                  repository: repository,
                  userId: widget.session.userId,
                  onOpenMyRota: widget.onOpenMyRota,
                  onOpenBreaks: () => _selectSection(HomeSection.breaks),
                ),
          onRefresh: () async => _myDayKey.currentState?.reload(),
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
                session: widget.session,
                onOpenPreCheck: widget.onOpenPreCheck,
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
        color: colors.bgPrimary.withValues(
          alpha: AppOpacity.segmentedTrackFill,
        ),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: colors.borderDefault),
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
    final (label, icon) = switch (section) {
      HomeSection.calendar => ('Calendar', Icons.calendar_month_outlined),
      HomeSection.breaks => ('Breaks', Icons.free_breakfast_outlined),
      HomeSection.info => ('Info', Icons.info_outline),
    };
    final foreground = navPillForeground(colors, selected: selected);

    return Semantics(
      button: true,
      selected: selected,
      child: AnimatedContainer(
        duration: AppMotion.normal,
        curve: AppMotion.emphasized,
        decoration: navPillDecoration(colors, selected: selected),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
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
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: foreground,
                        fontWeight: selected
                            ? FontWeight.w700
                            : FontWeight.w600,
                      ),
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

class _BellSegment extends StatelessWidget {
  const _BellSegment({required this.unreadCount, required this.onPressed});

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
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
                  child: Icon(
                    Icons.notifications_none_outlined,
                    size: AppHomeTabs.segmentIconSize + AppSpacing.xs,
                    color: colors.textSecondary,
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
