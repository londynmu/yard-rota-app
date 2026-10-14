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

/// Card under the Home calendar: today's shift and the user's next break,
/// plus a shortcut to My Rota.
class MyDayCard extends StatefulWidget {
  const MyDayCard({
    super.key,
    required this.repository,
    required this.userId,
    required this.onOpenMyRota,
    this.clock = DateTime.now,
  });

  final StageOneRepository repository;
  final String userId;
  final VoidCallback onOpenMyRota;
  final DateTime Function() clock;

  @override
  State<MyDayCard> createState() => MyDayCardState();
}

class MyDayCardState extends State<MyDayCard> with WidgetsBindingObserver {
  /// Keeps the "in 25m" / "15m left" countdown current.
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
    final colors = context.appColors;
    final divider = Divider(
      height: AppStroke.thin,
      thickness: AppStroke.thin,
      color: colors.divider,
    );
    return AppCard(
      padding: EdgeInsets.zero,
      surfaceOpacity: AppOpacity.homeCard,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Column(
          children: [
            _TodayRow(data: _data, failed: _failed, now: _now),
            divider,
            MenuTile(
              icon: Icons.view_week_outlined,
              title: 'Open My Rota',
              subtitle: 'Your shifts this week',
              onTap: widget.onOpenMyRota,
            ),
          ],
        ),
      ),
    );
  }
}

class _TodayRow extends StatelessWidget {
  const _TodayRow({
    required this.data,
    required this.failed,
    required this.now,
  });

  final MyDayData? data;
  final bool failed;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final textTheme = Theme.of(context).textTheme;
    final content = _content(colors);

    return ConstrainedBox(
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
              icon: Icons.timer_outlined,
              foreground: colors.warning,
              background: colors.warningBg,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    content.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.titleSmall?.copyWith(
                      color: colors.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    content.subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodySmall?.copyWith(
                      color: content.isAlert
                          ? colors.danger
                          : colors.textSecondary,
                      fontWeight: content.isAlert ? FontWeight.w700 : null,
                    ),
                  ),
                ],
              ),
            ),
            if (content.badge case final badge?) ...[
              const SizedBox(width: AppSpacing.sm),
              badge,
            ],
          ],
        ),
      ),
    );
  }

  _RowContent _content(AppColorsScheme colors) {
    final value = data;
    if (value == null) {
      return _RowContent(
        title: 'Today',
        subtitle: failed
            ? 'Could not load your shift. Pull down to retry.'
            : 'Loading your shift...',
      );
    }

    final summary = MyDayLogic.summarise(
      shifts: value.shifts,
      breaks: value.breaks,
      now: now,
    );
    final shift = summary.current;
    if (shift == null) {
      final next = summary.next;
      return _RowContent(
        title: 'Day off today',
        subtitle: next == null
            ? 'No shifts in the next 7 days'
            : 'Next: ${_dayLabel(next.start)} ${next.shiftLabel} '
                  '${MyDayLogic.formatTime(next.start)}',
      );
    }

    final title =
        'Today · ${shift.shiftLabel} '
        '${MyDayLogic.formatTime(shift.start)}–'
        '${MyDayLogic.formatTime(shift.end)}';
    String withLocation(String detail) =>
        shift.location.isEmpty ? detail : '${shift.location} · $detail';

    if (shift.absence case final absence?) {
      return _RowContent(
        title: title,
        subtitle: withLocation(absence),
        isAlert: true,
      );
    }

    final status = summary.breakStatus ?? const MyBreakStatus.none();
    final more = status.moreCount > 0 ? ' +${status.moreCount}' : '';
    return switch (status.kind) {
      MyBreakKind.upcoming => _RowContent(
        title: title,
        subtitle: withLocation(
          'Break ${MyDayLogic.formatTime(status.start!)}–'
          '${MyDayLogic.formatTime(status.end!)}$more',
        ),
        badge: StatusBadge(
          label:
              'in ${MyDayLogic.formatDuration(status.start!.difference(now))}',
          variant: BadgeVariant.info,
        ),
      ),
      MyBreakKind.active => _RowContent(
        title: title,
        subtitle: withLocation(
          'On break until ${MyDayLogic.formatTime(status.end!)}$more',
        ),
        badge: StatusBadge(
          label:
              '${MyDayLogic.formatDuration(status.end!.difference(now))} left',
          variant: BadgeVariant.success,
        ),
      ),
      MyBreakKind.done => _RowContent(
        title: title,
        subtitle: withLocation('Breaks done'),
      ),
      MyBreakKind.none => _RowContent(
        title: title,
        subtitle: withLocation('No break scheduled yet'),
      ),
    };
  }

  String _dayLabel(DateTime date) {
    final tomorrow = BreakWindowLogic.dateOnly(
      now,
    ).add(const Duration(days: 1));
    if (BreakWindowLogic.dateOnly(date) == tomorrow) return 'Tomorrow';
    const names = <String>['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return names[date.weekday - 1];
  }
}

class _RowContent {
  const _RowContent({
    required this.title,
    required this.subtitle,
    this.badge,
    this.isAlert = false,
  });

  final String title;
  final String subtitle;
  final Widget? badge;
  final bool isAlert;
}
