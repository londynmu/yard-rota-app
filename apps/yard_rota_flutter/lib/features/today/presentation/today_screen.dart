import 'package:flutter/material.dart';

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
    required this.onOpenGuide,
  });

  final StageOneRepository repository;
  final VoidCallback onOpenGuide;

  @override
  State<TodayPanel> createState() => _TodayPanelState();
}

class _TodayPanelState extends State<TodayPanel> {
  List<MonthlyShunterAward> _awards = const <MonthlyShunterAward>[];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final awards = await widget.repository.loadRecentAwards();
      if (!mounted) return;
      setState(() {
        _awards = awards;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      AppToast.error(context, 'Today summary could not be refreshed.');
    }
  }

  /// Tablet portrait (≥700) or landscape phone/tablet (≥600 wide).
  bool _isWideLayout(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final landscape = size.width > size.height;
    if (landscape && size.width >= 600) {
      return true;
    }
    return size.width >= 700;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.xl),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final guide = _GuidePromoCard(onOpen: widget.onOpenGuide);
    if (_awards.isEmpty) {
      return guide;
    }
    final awards = _AwardsList(awards: _awards);

    // Wide: awards | guide side-by-side instead of a stretched phone stack.
    if (_isWideLayout(context)) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: awards),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: guide),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        awards,
        const SizedBox(height: AppSpacing.md),
        guide,
      ],
    );
  }
}

bool _preCheckReminderIsWide(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final landscape = size.width > size.height;
  if (landscape && size.width >= 600) {
    return true;
  }
  return size.width >= 700;
}

/// Amber calendar-palette reminder — pinned above the home calendar while due.
class PreCheckReminderCard extends StatelessWidget {
  const PreCheckReminderCard({super.key, required this.onOpen});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final wide = _preCheckReminderIsWide(context);
    final accent = AppAvailabilityTones.note(isDark: isDark);
    final wash = AppAvailabilityTones.noteBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    final icon = ExcludeSemantics(
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: accent.withValues(alpha: isDark ? 0.22 : 0.14),
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
        child: Icon(
          Icons.fact_check_outlined,
          size: 16,
          color: accent,
        ),
      ),
    );

    final copy = Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Tug PreCheck required',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w600,
              color: titleFg,
              height: 1.2,
            ),
          ),
          Text(
            'Complete your daily tug inspection before work.',
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w400,
              height: 1.3,
            ),
          ),
        ],
      ),
    );

    final action = Theme(
      data: Theme.of(context).copyWith(
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: Size(
              wide ? 168 : double.infinity,
              AppComponentTokens.minTouchTarget,
            ),
          ),
        ),
      ),
      child: AppButton(
        label: 'Start PreCheck',
        onPressed: onOpen,
        variant: AppButtonVariant.secondary,
      ),
    );

    return Semantics(
      container: true,
      label:
          'Tug PreCheck required. Complete your daily tug inspection before work.',
      child: AppCard(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          AppSpacing.sm,
        ),
        color: Color.alphaBlend(
          wash.withValues(alpha: isDark ? 0.55 : 0.85),
          colors.bgElevated,
        ),
        borderColor: border,
        child: wide
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  icon,
                  const SizedBox(width: AppSpacing.sm),
                  copy,
                  const SizedBox(width: AppSpacing.md),
                  action,
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      icon,
                      const SizedBox(width: AppSpacing.sm),
                      copy,
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  action,
                ],
              ),
      ),
    );
  }
}

/// Collapsible section: header only when closed; month cards when open.
class _AwardsList extends StatefulWidget {
  const _AwardsList({required this.awards});

  final List<MonthlyShunterAward> awards;

  @override
  State<_AwardsList> createState() => _AwardsListState();
}

class _AwardsListState extends State<_AwardsList> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.award(isDark: isDark);
    final wash = AppAvailabilityTones.awardBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    final grouped = <String, List<MonthlyShunterAward>>{};
    for (final award in widget.awards) {
      grouped.putIfAbsent(award.monthYmd, () => []).add(award);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          padding: EdgeInsets.zero,
          color: Color.alphaBlend(
            wash.withValues(alpha: isDark ? 0.45 : 0.7),
            colors.bgElevated,
          ),
          borderColor: border,
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              borderRadius: BorderRadius.circular(AppRadius.lg),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: AppComponentTokens.buttonHeightMd,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: isDark ? 0.22 : 0.14),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Icon(
                        Icons.emoji_events_outlined,
                        size: 20,
                        color: accent,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Shunter of the Month',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: titleFg,
                                  height: 1.2,
                                ),
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                            _expanded
                                ? 'Tap to hide'
                                : 'Tap to view winners',
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(
                                  color: colors.textSecondary,
                                  fontWeight: FontWeight.w400,
                                ),
                          ),
                        ],
                      ),
                    ),
                      Icon(
                        _expanded
                            ? Icons.expand_less_rounded
                            : Icons.expand_more_rounded,
                        size: 22,
                        color: accent.withValues(alpha: 0.85),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (_expanded) ...[
          const SizedBox(height: AppSpacing.md),
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: grouped.length,
            itemBuilder: (context, index) {
              final month = grouped.entries.elementAt(index);
              return _AwardMonthCard(
                monthLabel: _monthLabel(month.key),
                awards: month.value,
              );
            },
          ),
        ],
      ],
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
}

class _AwardMonthCard extends StatelessWidget {
  const _AwardMonthCard({
    required this.monthLabel,
    required this.awards,
  });

  final String monthLabel;
  final List<MonthlyShunterAward> awards;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final accent = AppAvailabilityTones.award(isDark: isDark);
    final wash = AppAvailabilityTones.awardBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final headerFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );
    final headerBg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.14 : 0.08),
      colors.bgElevated,
    );
    final countLabel =
        awards.length == 1 ? '1 winner' : '${awards.length} winners';

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: AppCard(
        padding: EdgeInsets.zero,
        color: Color.alphaBlend(
          wash.withValues(alpha: isDark ? 0.45 : 0.7),
          colors.bgElevated,
        ),
        borderColor: border,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: headerBg,
                border: Border(
                  bottom: BorderSide(
                    color: border,
                    width: AppStroke.hairline,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      monthLabel,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: headerFg,
                        height: 1.2,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    countLabel,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: headerFg,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: awards.length,
              itemBuilder: (context, index) {
                return _AwardPersonRow(
                  award: awards[index],
                  showDivider: index < awards.length - 1,
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AwardPersonRow extends StatelessWidget {
  const _AwardPersonRow({
    required this.award,
    required this.showDivider,
  });

  final MonthlyShunterAward award;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final period = _capitalise(award.period);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  award.winnerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w400,
                    color: colors.textPrimary,
                    height: 1.2,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                period,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        if (showDivider)
          Padding(
            padding: const EdgeInsets.only(left: AppSpacing.md),
            child: Divider(
              height: 1,
              thickness: AppStroke.hairline,
              color: colors.borderSubtle,
            ),
          ),
      ],
    );
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Violet holiday tone — calendar palette, distinct from amber awards.
    final accent = AppAvailabilityTones.holiday(isDark: isDark);
    final wash = AppAvailabilityTones.holidayBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final titleFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );

    return AppCard(
      padding: EdgeInsets.zero,
      color: Color.alphaBlend(
        wash.withValues(alpha: isDark ? 0.45 : 0.7),
        colors.bgElevated,
      ),
      borderColor: border,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onOpen,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppComponentTokens.buttonHeightMd,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: isDark ? 0.22 : 0.14),
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                    child: Icon(
                      Icons.menu_book_outlined,
                      size: 20,
                      color: accent,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Shunter Guide',
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(
                                fontWeight: FontWeight.w600,
                                color: titleFg,
                                height: 1.2,
                              ),
                        ),
                        const SizedBox(height: AppSpacing.xxs),
                        Text(
                          'Yard induction and how-to',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: colors.textSecondary,
                                fontWeight: FontWeight.w400,
                              ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    'Open',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 20,
                    color: accent.withValues(alpha: 0.8),
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
