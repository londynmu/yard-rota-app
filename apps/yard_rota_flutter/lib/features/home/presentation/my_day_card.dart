import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/menu_group.dart';
import '../../../core/ui/status_badge.dart';
import '../../breaks/domain/break_models.dart';
import '../data/stage_one_repository.dart';
import '../domain/my_day_logic.dart';

/// Two tiles under the Home calendar: today's shift (opens My Rota) and the
/// user's own break with a countdown.
class MyDayCard extends StatefulWidget {
  const MyDayCard({
    super.key,
    required this.repository,
    required this.userId,
    required this.onOpenMyRota,
    required this.onOpenBreaks,
    this.clock = DateTime.now,
  });

  final StageOneRepository repository;
  final String userId;
  final VoidCallback onOpenMyRota;
  final VoidCallback onOpenBreaks;
  final DateTime Function() clock;

  @override
  State<MyDayCard> createState() => MyDayCardState();
}

class MyDayCardState extends State<MyDayCard> with WidgetsBindingObserver {
  /// Keeps the "in 25m" / "12m left" countdown current.
  static const Duration _tick = Duration(seconds: 30);

  MyDayData? _data;
  bool _failed = false;
  late DateTime _now = widget.clock();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(_tick, (_) {
      if (mounted) setState(() => _now = widget.clock());
    });
    reload();
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) reload();
  }

  Future<void> reload() async {
    try {
      final data = await widget.repository.loadMyDay(
        userId: widget.userId,
        now: widget.clock(),
      );
      if (!mounted) return;
      setState(() {
        _data = data;
        _failed = false;
        _now = widget.clock();
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return _Tile(
        icon: Icons.event_note_outlined,
        title: 'Today',
        subtitle: _failed
            ? 'Could not load your shift. Pull down to retry.'
            : 'Loading your shift...',
      );
    }

    final summary = MyDayLogic.summarise(
      shifts: data.shifts,
      breaks: data.breaks,
      now: _now,
    );
    final shift = summary.current;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ShiftTile(
          shift: shift,
          next: summary.next,
          now: _now,
          onTap: widget.onOpenMyRota,
        ),
        if (shift != null && !shift.isAbsent) ...[
          const SizedBox(height: AppSpacing.md),
          _BreakTile(
            status: summary.breakStatus ?? const MyBreakStatus.none(),
            now: _now,
            onOpenBreaks: widget.onOpenBreaks,
          ),
        ],
      ],
    );
  }
}

class _ShiftTile extends StatelessWidget {
  const _ShiftTile({
    required this.shift,
    required this.next,
    required this.now,
    required this.onTap,
  });

  final MyShift? shift;
  final MyShift? next;
  final DateTime now;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final value = shift;
    if (value == null) {
      final upcoming = next;
      return _Tile(
        icon: Icons.event_available_outlined,
        title: 'Day off today',
        subtitle: upcoming == null
            ? 'No shifts in the next 7 days'
            : 'Next shift: ${_dayLabel(upcoming.start, now)}, '
                  '${upcoming.shiftLabel} '
                  '${MyDayLogic.formatTime(upcoming.start)}',
        onTap: onTap,
      );
    }

    final details = [
      if (value.location.isNotEmpty) value.location,
      '${value.shiftLabel} shift',
      '${MyDayLogic.formatTime(value.start)}–'
          '${MyDayLogic.formatTime(value.end)}',
    ].join(' · ');

    if (value.isAbsent) {
      return _Tile(
        icon: Icons.event_busy_outlined,
        iconForeground: colors.danger,
        iconBackground: colors.dangerBg,
        title: 'Marked as ${value.absence} today',
        titleColor: colors.danger,
        subtitle: details,
        onTap: onTap,
      );
    }

    return _Tile(
      icon: _shiftIcon(value.shiftType),
      title: "You're working today",
      subtitle: details,
      trailing: value.absence == null
          ? null
          : StatusBadge(label: value.absence!, variant: BadgeVariant.warning),
      onTap: onTap,
    );
  }

  static IconData _shiftIcon(String shiftType) =>
      switch (BreakShift.fromDb(shiftType.trim().toLowerCase())) {
        BreakShift.day => Icons.wb_sunny_outlined,
        BreakShift.afternoon => Icons.wb_twilight_outlined,
        BreakShift.night => Icons.nightlight_outlined,
        null => Icons.work_outline_rounded,
      };
}

class _BreakTile extends StatelessWidget {
  const _BreakTile({
    required this.status,
    required this.now,
    required this.onOpenBreaks,
  });

  final MyBreakStatus status;
  final DateTime now;
  final VoidCallback onOpenBreaks;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    switch (status.kind) {
      case MyBreakKind.none:
        return _Tile(
          icon: Icons.free_breakfast_outlined,
          iconForeground: colors.warning,
          iconBackground: colors.warningBg,
          title: 'No break booked yet',
          subtitle: "Tap to see today's breaks",
          onTap: onOpenBreaks,
        );
      case MyBreakKind.done:
        return _Tile(
          icon: Icons.check_circle_outline_rounded,
          iconForeground: colors.success,
          iconBackground: colors.successBg,
          title: 'Breaks done for today',
          subtitle: 'Last break ended at ${MyDayLogic.formatTime(status.end!)}',
        );
      case MyBreakKind.upcoming:
      case MyBreakKind.active:
        return _countdown(context);
    }
  }

  Widget _countdown(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    final active = status.kind == MyBreakKind.active;
    final accent = active ? colors.success : colors.info;
    final start = status.start!;
    final end = status.end!;

    final counter = active
        ? '${MyDayLogic.formatDuration(end.difference(now))} left'
        : 'in ${MyDayLogic.formatDuration(start.difference(now))}';
    final followingStart = status.followingStart;
    final following = followingStart == null
        ? ''
        : ' · Next ${MyDayLogic.formatTime(followingStart)}–'
              '${MyDayLogic.formatTime(status.followingEnd!)}';
    final detail = active
        ? 'Until ${MyDayLogic.formatTime(end)}$following'
        : '${_dayLabel(start, now)} ${MyDayLogic.formatTime(start)}–'
              '${MyDayLogic.formatTime(end)}$following';

    return AppCard(
      surfaceOpacity: AppOpacity.homeCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconBadge(
                icon: active ? Icons.timer_outlined : Icons.schedule_rounded,
                foreground: accent,
                background: active ? colors.successBg : colors.infoBg,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      active ? 'On break' : 'Your break',
                      style: textTheme.labelLarge?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    Text(
                      counter,
                      style: textTheme.headlineSmall?.copyWith(
                        color: accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      detail,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (active) ...[
            const SizedBox(height: AppSpacing.md),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.full),
              child: LinearProgressIndicator(
                value: MyDayLogic.breakProgress(status, now),
                color: colors.success,
                backgroundColor: colors.successBg,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Card row in the Account menu style: icon badge, title, subtitle and an
/// optional chevron when tappable.
class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.iconForeground,
    this.iconBackground,
    this.titleColor,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color? iconForeground;
  final Color? iconBackground;
  final Color? titleColor;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    return AppCard(
      padding: EdgeInsets.zero,
      surfaceOpacity: AppOpacity.homeCard,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minHeight: AppComponentTokens.listItemMinHeight,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppComponentTokens.cardPadding,
                  vertical: AppComponentTokens.listItemVerticalPadding,
                ),
                child: Row(
                  children: [
                    IconBadge(
                      icon: icon,
                      foreground: iconForeground,
                      background: iconBackground,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.titleSmall?.copyWith(
                              color: titleColor ?? colors.textPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                            subtitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.bodySmall?.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (trailing case final trailing?) ...[
                      const SizedBox(width: AppSpacing.sm),
                      trailing,
                    ],
                    if (onTap != null) ...[
                      const SizedBox(width: AppSpacing.xs),
                      Icon(
                        Icons.chevron_right_rounded,
                        color: colors.textTertiary,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 'Today', 'Tomorrow' or a short weekday name.
String _dayLabel(DateTime date, DateTime now) {
  final day = BreakWindowLogic.dateOnly(date);
  final today = BreakWindowLogic.dateOnly(now);
  if (day == today) return 'Today';
  if (day == today.add(const Duration(days: 1))) return 'Tomorrow';
  const names = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return names[date.weekday - 1];
}
