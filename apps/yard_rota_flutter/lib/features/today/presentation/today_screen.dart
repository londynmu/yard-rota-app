import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../home/data/stage_one_repository.dart';

class TodayPanel extends StatefulWidget {
  const TodayPanel({
    super.key,
    required this.repository,
    required this.session,
    required this.onOpenPreCheck,
    required this.onOpenGuide,
  });

  final StageOneRepository repository;
  final UserSession session;
  final VoidCallback onOpenPreCheck;
  final VoidCallback onOpenGuide;

  @override
  State<TodayPanel> createState() => _TodayPanelState();
}

class _TodayPanelState extends State<TodayPanel> {
  TodayShiftSummary? _shift;
  List<MonthlyShunterAward> _awards = const <MonthlyShunterAward>[];
  bool _needsPreCheck = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<dynamic>([
        widget.repository.loadTodayShift(userId: widget.session.userId),
        widget.repository.needsPreCheck(userId: widget.session.userId),
        widget.repository.loadRecentAwards(),
      ]);
      if (!mounted) return;
      setState(() {
        _shift = results[0] as TodayShiftSummary?;
        _needsPreCheck = results[1] as bool;
        _awards = results[2] as List<MonthlyShunterAward>;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      AppToast.show(context, 'Today summary could not be refreshed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ShiftCard(shift: _shift),
        if (_needsPreCheck) ...[
          const SizedBox(height: AppSpacing.md),
          _PreCheckReminder(onOpen: widget.onOpenPreCheck),
        ],
        if (_awards.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          _AwardsCard(awards: _awards),
        ],
        const SizedBox(height: AppSpacing.md),
        _GuidePromoCard(onOpen: widget.onOpenGuide),
      ],
    );
  }
}

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({required this.shift});

  final TodayShiftSummary? shift;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.badge_outlined, color: colors.primary),
              const SizedBox(width: AppSpacing.sm),
              Text('Today', style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (shift == null)
            Text(
              'No shift scheduled today.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            )
          else ...[
            Text(
              '${_capitalise(shift!.shiftType)} shift',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${shift!.startTime}–${shift!.endTime} • ${shift!.location}',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }

  String _capitalise(String value) {
    if (value.isEmpty) return 'Scheduled';
    return '${value[0].toUpperCase()}${value.substring(1)}';
  }
}

class _PreCheckReminder extends StatelessWidget {
  const _PreCheckReminder({required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.fact_check_outlined, color: colors.warning),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'Tug PreCheck required',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Complete your daily tug inspection before starting work.',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Start PreCheck',
            onPressed: onOpen,
            variant: AppButtonVariant.secondary,
          ),
        ],
      ),
    );
  }
}

class _AwardsCard extends StatefulWidget {
  const _AwardsCard({required this.awards});

  final List<MonthlyShunterAward> awards;

  @override
  State<_AwardsCard> createState() => _AwardsCardState();
}

class _AwardsCardState extends State<_AwardsCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final grouped = <String, List<MonthlyShunterAward>>{};
    for (final award in widget.awards) {
      grouped.putIfAbsent(award.monthYmd, () => []).add(award);
    }
    return AppCard(
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Row(
              children: [
                Icon(Icons.emoji_events_outlined, color: colors.warning),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    'Shunter of the Month',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  color: colors.textSecondary,
                ),
              ],
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: AppSpacing.md),
            ...grouped.entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: AppSpacing.giant * 2,
                      child: Text(
                        _monthLabel(entry.key),
                        style: Theme.of(context).textTheme.labelMedium,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        entry.value
                            .map(
                              (award) =>
                                  '${_capitalise(award.period)}: ${award.winnerName}',
                            )
                            .join('\n'),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _monthLabel(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return value;
    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[date.month - 1]} ${date.year}';
  }

  String _capitalise(String value) =>
      value.isEmpty ? value : '${value[0].toUpperCase()}${value.substring(1)}';
}

class _GuidePromoCard extends StatelessWidget {
  const _GuidePromoCard({required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      child: InkWell(
        onTap: onOpen,
        child: Row(
          children: [
            Icon(Icons.menu_book_outlined, color: colors.info),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                'Shunter Guide',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            Text(
              'Open',
              style: Theme.of(
                context,
              ).textTheme.labelLarge?.copyWith(color: colors.info),
            ),
          ],
        ),
      ),
    );
  }
}
