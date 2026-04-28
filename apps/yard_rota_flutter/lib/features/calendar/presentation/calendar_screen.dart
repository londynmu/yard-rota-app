import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/network/network_policy.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../../core/ui/status_badge.dart';
import '../data/calendar_repository.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({
    super.key,
    required this.displayName,
    required this.calendarRepository,
    required this.onLogout,
  });

  final String displayName;
  final CalendarRepository calendarRepository;
  final Future<void> Function() onLogout;

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late DateTime _visibleMonth;
  CalendarMonthData? _monthData;
  DateTime? _selectedDay;
  bool _isLoading = true;
  bool _isRefreshing = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _visibleMonth = DateTime(now.year, now.month);
    _selectedDay = DateTime(now.year, now.month, now.day);
    _loadMonth(showGlobalLoader: true);
  }

  Future<void> _loadMonth({required bool showGlobalLoader}) async {
    if (showGlobalLoader) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _isRefreshing = true;
        _errorMessage = null;
      });
    }

    final cached = widget.calendarRepository.readCachedMonth(
      year: _visibleMonth.year,
      month: _visibleMonth.month,
    );
    if (cached != null) {
      setState(() {
        _monthData = cached;
        _selectedDay = DateTime(
          _visibleMonth.year,
          _visibleMonth.month,
          _selectedDay?.day ?? 1,
        );
        _isLoading = false;
      });
    }

    try {
      final fresh = await widget.calendarRepository.loadMonth(
        year: _visibleMonth.year,
        month: _visibleMonth.month,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _monthData = fresh;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      if (_monthData == null) {
        setState(() {
          _errorMessage = 'Calendar could not be loaded. Please retry.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isRefreshing = false;
        });
      }
    }
  }

  Future<void> _shiftMonth(int delta) async {
    final switched = DateTime(_visibleMonth.year, _visibleMonth.month + delta);
    setState(() {
      _visibleMonth = DateTime(switched.year, switched.month);
      _selectedDay = DateTime(switched.year, switched.month, 1);
    });

    final stopwatch = Stopwatch()..start();
    await _loadMonth(showGlobalLoader: false);
    stopwatch.stop();

    if (mounted &&
        stopwatch.elapsed > NetworkPolicy.monthSwitchCachedSlo &&
        widget.calendarRepository.readCachedMonth(
              year: _visibleMonth.year,
              month: _visibleMonth.month,
            ) !=
            null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Month switch exceeded cache SLO target.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Calendar • ${widget.displayName}',
      actions: [
        IconButton(
          tooltip: 'Sign out',
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout),
        ),
      ],
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_isLoading && _monthData == null) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null && _monthData == null) {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: AppCard(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _errorMessage!,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: 'Retry',
                  onPressed: () => _loadMonth(showGlobalLoader: true),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final data = _monthData!;
    return ListView(
      children: [
        _buildMonthHeader(context, data),
        const SizedBox(height: AppSpacing.lg),
        _buildCalendarGrid(context, data),
        const SizedBox(height: AppSpacing.lg),
        _buildSelectedDayDetails(context, data),
      ],
    );
  }

  Widget _buildMonthHeader(BuildContext context, CalendarMonthData data) {
    final monthLabel = _monthName(data.month);
    final colors = context.appColors;
    return AppCard(
      child: Row(
        children: [
          IconButton(
            onPressed: () => _shiftMonth(-1),
            icon: const Icon(Icons.chevron_left),
            tooltip: 'Previous month',
          ),
          Expanded(
            child: Text(
              '$monthLabel ${data.year}',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          if (_isRefreshing)
            const SizedBox(
              width: AppComponentTokens.minTouchTarget,
              height: AppComponentTokens.minTouchTarget,
              child: Center(
                child: SizedBox(
                  width: AppSpacing.lg,
                  height: AppSpacing.lg,
                  child: CircularProgressIndicator(strokeWidth: AppStroke.thin),
                ),
              ),
            )
          else
            IconButton(
              onPressed: () => _shiftMonth(1),
              icon: const Icon(Icons.chevron_right),
              tooltip: 'Next month',
            ),
          if (_isRefreshing) const SizedBox(width: AppSpacing.sm),
          Text(
            'SLO: ${NetworkPolicy.monthSwitchCachedSlo.inMilliseconds}ms',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: colors.textTertiary),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarGrid(BuildContext context, CalendarMonthData data) {
    final colors = context.appColors;
    final daysInMonth = DateUtils.getDaysInMonth(data.year, data.month);
    final firstWeekday = DateTime(data.year, data.month, 1).weekday;
    final leading = firstWeekday - 1;
    final totalCells = leading + daysInMonth;

    return AppCard(
      child: Column(
        children: [
          Row(
            children: _weekdayLabels
                .map(
                  (label) => Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(color: colors.textSecondary),
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: totalCells,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 1.0,
              crossAxisSpacing: AppSpacing.xs,
              mainAxisSpacing: AppSpacing.xs,
            ),
            itemBuilder: (context, index) {
              if (index < leading) {
                return const SizedBox.shrink();
              }

              final day = index - leading + 1;
              final date = DateTime(data.year, data.month, day);
              final selected = _selectedDay?.day == day;
              final hasShift = data.scheduleForDay(day) != null;

              final bgColor = selected
                  ? colors.primary
                  : hasShift
                  ? colors.infoBg
                  : colors.bgSecondary;
              final textColor = selected
                  ? colors.onPrimary
                  : hasShift
                  ? colors.info
                  : colors.textPrimary;

              return InkWell(
                borderRadius: BorderRadius.circular(AppRadius.md),
                onTap: () {
                  setState(() {
                    _selectedDay = date;
                  });
                },
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: bgColor,
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    border: Border.all(color: colors.borderDefault),
                  ),
                  child: Text(
                    '$day',
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: textColor),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSelectedDayDetails(
    BuildContext context,
    CalendarMonthData data,
  ) {
    final colors = context.appColors;
    final selected = _selectedDay ?? DateTime(data.year, data.month, 1);
    final schedule = data.scheduleForDay(selected.day);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Selected day details',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '${selected.day.toString().padLeft(2, '0')}/${selected.month.toString().padLeft(2, '0')}/${selected.year}',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          if (schedule == null)
            Text(
              'No assigned shifts.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: schedule.shifts.length,
              itemBuilder: (context, index) {
                final shift = schedule.shifts[index];
                return Padding(
                  padding: EdgeInsets.only(
                    bottom: index == schedule.shifts.length - 1
                        ? 0
                        : AppSpacing.md,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              shift.title,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              '${shift.startTime} - ${shift.endTime} • ${shift.location}',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: colors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      StatusBadge(
                        label: shift.status,
                        variant: shift.status == 'Delayed'
                            ? BadgeVariant.warning
                            : BadgeVariant.success,
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  String _monthName(int month) {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1];
  }
}

const _weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
