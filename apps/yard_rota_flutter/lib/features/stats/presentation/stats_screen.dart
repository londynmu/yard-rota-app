import 'dart:math' as math;
import 'dart:ui';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_toast.dart';
import '../data/stats_repository.dart';
import '../domain/stats_models.dart';

class StatsScreen extends StatefulWidget {
  const StatsScreen({
    super.key,
    required this.repository,
    required this.session,
    required this.lightHomeWallpaper,
    required this.darkHomeWallpaper,
  });

  final StatsRepository repository;
  final UserSession session;
  final LightHomeWallpaper lightHomeWallpaper;
  final DarkHomeWallpaper darkHomeWallpaper;

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  StatsRangeFilter _range = StatsRangeFilter.lastDay;
  StatsSortOption _sort = StatsSortOption.totalMoves;
  StatsShiftFilter _shift = StatsShiftFilter.all;
  StatsDashboardData? _data;
  bool _loading = true;
  bool _refreshing = false;
  String? _error;
  int _requestSerial = 0;
  String? _expandedUserId;

  @override
  void initState() {
    super.initState();
    _loadStats(showGlobalLoader: true);
  }

  Future<void> _loadStats({required bool showGlobalLoader}) async {
    final serial = ++_requestSerial;
    if (showGlobalLoader) {
      setState(() {
        _loading = _data == null;
        _refreshing = _data != null;
        _error = null;
      });
    } else {
      setState(() {
        _refreshing = true;
        _error = null;
      });
    }

    final cached = await widget.repository.loadCachedDashboard(
      currentUserId: widget.session.userId,
      range: _range,
      sort: _sort,
      shiftFilter: _shift,
    );
    if (!mounted || serial != _requestSerial) {
      return;
    }
    if (cached != null) {
      setState(() {
        _data = cached;
        _loading = false;
        _refreshing = true;
      });
    }

    try {
      final fresh = await widget.repository.refreshDashboard(
        currentUserId: widget.session.userId,
        range: _range,
        sort: _sort,
        shiftFilter: _shift,
      );
      if (!mounted || serial != _requestSerial) {
        return;
      }
      setState(() {
        _data = fresh;
        _loading = false;
        _refreshing = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted || serial != _requestSerial) {
        return;
      }
      if (_data != null || cached != null) {
        setState(() {
          _loading = false;
          _refreshing = false;
        });
        AppToast.show(context, 'Stats refresh failed. Showing saved data.');
        return;
      }
      setState(() {
        _loading = false;
        _refreshing = false;
        _error =
            'Stats could not be loaded. Connect to the internet and try again.';
      });
      AppToast.show(context, _error!);
    }
  }

  Future<void> _refresh() => _loadStats(showGlobalLoader: false);

  Future<void> _openRangeSheet() async {
    final picked = await _openOptionSheet<StatsRangeFilter>(
      title: 'Select range',
      options: StatsRangeFilter.values,
      selected: _range,
      labelFor: (value) => value.label,
    );
    if (picked == null || picked == _range) {
      return;
    }
    setState(() {
      _range = picked;
      _expandedUserId = null;
    });
    await _loadStats(showGlobalLoader: true);
  }

  Future<void> _openSortSheet() async {
    final picked = await _openOptionSheet<StatsSortOption>(
      title: 'Sort leaderboard',
      options: StatsSortOption.values,
      selected: _sort,
      labelFor: (value) => value.label,
    );
    if (picked == null || picked == _sort) {
      return;
    }
    setState(() {
      _sort = picked;
      _expandedUserId = null;
    });
    await _loadStats(showGlobalLoader: true);
  }

  Future<void> _openShiftSheet() async {
    final picked = await _openOptionSheet<StatsShiftFilter>(
      title: 'Select shift',
      options: StatsShiftFilter.values,
      selected: _shift,
      labelFor: (value) => value.label,
    );
    if (picked == null || picked == _shift) {
      return;
    }
    setState(() {
      _shift = picked;
      _expandedUserId = null;
    });
    await _loadStats(showGlobalLoader: true);
  }

  Future<T?> _openOptionSheet<T>({
    required String title,
    required List<T> options,
    required T selected,
    required String Function(T value) labelFor,
  }) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: context.appColors.bgElevated,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      builder: (ctx) {
        final colors = ctx.appColors;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  title,
                  style: Theme.of(ctx).textTheme.titleLarge?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                for (final option in options)
                  ListTile(
                    title: Text(
                      labelFor(option),
                      style: TextStyle(
                        color: option == selected
                            ? colors.primary
                            : colors.textPrimary,
                        fontWeight: option == selected
                            ? FontWeight.w700
                            : FontWeight.w500,
                      ),
                    ),
                    onTap: () => Navigator.pop(ctx, option),
                  ),
              ],
            ),
          ),
        );
      },
    );
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
        title: const Text('Stats'),
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
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _data == null
                  ? _ErrorBody(message: _error!, onRetry: _refresh)
                  : _StatsContent(
                      data: _data,
                      refreshing: _refreshing,
                      expandedUserId: _expandedUserId,
                      onRefresh: _refresh,
                      onToggleUser: (userId) {
                        setState(() {
                          _expandedUserId = _expandedUserId == userId
                              ? null
                              : userId;
                        });
                      },
                      onRange: _openRangeSheet,
                      onSort: _openSortSheet,
                      onShift: _openShiftSheet,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsContent extends StatelessWidget {
  const _StatsContent({
    required this.data,
    required this.refreshing,
    required this.expandedUserId,
    required this.onRefresh,
    required this.onToggleUser,
    required this.onRange,
    required this.onSort,
    required this.onShift,
  });

  final StatsDashboardData? data;
  final bool refreshing;
  final String? expandedUserId;
  final Future<void> Function() onRefresh;
  final void Function(String userId) onToggleUser;
  final VoidCallback onRange;
  final VoidCallback onSort;
  final VoidCallback onShift;

  @override
  Widget build(BuildContext context) {
    final current = data;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatsFilterBar(
          range: current?.range ?? StatsRangeFilter.lastDay,
          sort: current?.sort ?? StatsSortOption.totalMoves,
          shift: current?.shiftFilter ?? StatsShiftFilter.all,
          onRange: onRange,
          onSort: onSort,
          onShift: onShift,
        ),
        const SizedBox(height: AppSpacing.md),
        if (refreshing) ...[
          const LinearProgressIndicator(minHeight: 2),
          const SizedBox(height: AppSpacing.sm),
        ],
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                child: current == null
                    ? const _EmptyState(
                        title: 'No saved stats',
                        message: 'Connect to the internet to load stats.',
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _SavedDataLabel(data: current),
                          const SizedBox(height: AppSpacing.sm),
                          if (!current.currentUserHasYardId) ...[
                            const _EmptyState(
                              title: 'Yard System ID required',
                              message:
                                  'You need a Yard System ID to view performance statistics.',
                            ),
                          ] else ...[
                            _MyPerformanceCard(data: current),
                            const SizedBox(height: AppSpacing.md),
                            _TrendCard(
                              points: current.trend,
                              range: current.range,
                            ),
                            const SizedBox(height: AppSpacing.md),
                            _TeamSnapshotCard(team: current.team),
                            const SizedBox(height: AppSpacing.md),
                            _LeaderboardSection(
                              users: current.users,
                              sort: current.sort,
                              expandedUserId: expandedUserId,
                              onToggleUser: onToggleUser,
                            ),
                          ],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _StatsFilterBar extends StatelessWidget {
  const _StatsFilterBar({
    required this.range,
    required this.sort,
    required this.shift,
    required this.onRange,
    required this.onSort,
    required this.onShift,
  });

  final StatsRangeFilter range;
  final StatsSortOption sort;
  final StatsShiftFilter shift;
  final VoidCallback onRange;
  final VoidCallback onSort;
  final VoidCallback onShift;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _FilterButton(label: range.label, onTap: onRange),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _FilterButton(label: sort.label, onTap: onSort),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: _FilterButton(label: shift.label, onTap: onShift),
        ),
      ],
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: Material(
        color: colors.bgElevated.withValues(alpha: 0.82),
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              border: Border.all(color: colors.borderDefault),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Center(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SavedDataLabel extends StatelessWidget {
  const _SavedDataLabel({required this.data});

  final StatsDashboardData data;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final label = data.isFromCache ? 'Saved data' : 'Updated';
    return Text(
      '$label ${_formatTime(data.fetchedAt)}',
      textAlign: TextAlign.right,
      style: Theme.of(
        context,
      ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
    );
  }

  String _formatTime(DateTime date) {
    final h = date.hour.toString().padLeft(2, '0');
    final m = date.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _MyPerformanceCard extends StatelessWidget {
  const _MyPerformanceCard({required this.data});

  final StatsDashboardData data;

  @override
  Widget build(BuildContext context) {
    final user = data.currentUser;
    if (user == null) {
      return const _EmptyState(
        title: 'No personal stats',
        message: 'No performance data is available for you in this period.',
      );
    }
    final colors = context.appColors;
    return _StatsSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: colors.primary.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.borderDefault),
                ),
                child: Center(
                  child: Text(
                    '#${user.rank}',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: colors.primary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'My Performance',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: colors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      '${user.yardSystemId} · ${data.range.label}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                user.totalMoves.toString(),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Moves/day',
                  value: user.movesPerDay.toStringAsFixed(1),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricTile(
                  label: 'Days',
                  value: user.daysWorked.toString(),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Collect',
                  value: user.avgCollectLabel,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricTile(label: 'Travel', value: user.avgTravelLabel),
              ),
            ],
          ),
          if (user.teamAverageRatio != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              '${(user.teamAverageRatio! * 100).round()}% of team average',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      constraints: const BoxConstraints(
        minHeight: AppStatsCard.metricMinHeight,
      ),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.bgSecondary.withValues(alpha: 0.68),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: colors.borderDefault),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _TrendCard extends StatefulWidget {
  const _TrendCard({required this.points, required this.range});

  final List<StatsTrendPoint> points;
  final StatsRangeFilter range;

  @override
  State<_TrendCard> createState() => _TrendCardState();
}

class _TrendCardState extends State<_TrendCard> {
  static const int _windowSize = 31;
  static const double _swipeThreshold = 40;

  int _windowStartIndex = 0;
  double? _touchStartX;

  bool get _usesWindow =>
      widget.range == StatsRangeFilter.all &&
      widget.points.length > _windowSize;

  int get _maxWindowStart => math.max(0, widget.points.length - _windowSize);

  @override
  void initState() {
    super.initState();
    _resetWindow();
  }

  @override
  void didUpdateWidget(covariant _TrendCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.points != widget.points || oldWidget.range != widget.range) {
      _resetWindow();
    }
  }

  void _resetWindow() {
    _windowStartIndex = _usesWindow ? _maxWindowStart : 0;
  }

  List<StatsTrendPoint> get _visiblePoints {
    if (!_usesWindow) {
      return widget.points;
    }
    final start = _windowStartIndex.clamp(0, _maxWindowStart);
    final end = math.min(widget.points.length, start + _windowSize);
    return widget.points.sublist(start, end);
  }

  bool get _canGoOlder => _usesWindow && _windowStartIndex > 0;

  bool get _canGoNewer => _usesWindow && _windowStartIndex < _maxWindowStart;

  void _moveOlder() {
    if (!_canGoOlder) {
      return;
    }
    setState(() {
      _windowStartIndex = math.max(0, _windowStartIndex - _windowSize);
    });
  }

  void _moveNewer() {
    if (!_canGoNewer) {
      return;
    }
    setState(() {
      _windowStartIndex = math.min(
        _maxWindowStart,
        _windowStartIndex + _windowSize,
      );
    });
  }

  void _handleHorizontalDragStart(DragStartDetails details) {
    _touchStartX = details.globalPosition.dx;
  }

  void _handleHorizontalDragEnd(DragEndDetails details) {
    if (!_usesWindow || _touchStartX == null) {
      _touchStartX = null;
      return;
    }
    final velocity = details.primaryVelocity ?? 0;
    if (velocity.abs() < _swipeThreshold) {
      _touchStartX = null;
      return;
    }
    if (velocity > 0) {
      _moveOlder();
    } else {
      _moveNewer();
    }
    _touchStartX = null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final visiblePoints = _visiblePoints;
    return _StatsSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Daily Moves Trend',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (_usesWindow) ...[
                _ChartNavButton(
                  label: 'Prev',
                  enabled: _canGoOlder,
                  onTap: _moveOlder,
                ),
                const SizedBox(width: AppSpacing.xs),
                _ChartNavButton(
                  label: 'Next',
                  enabled: _canGoNewer,
                  onTap: _moveNewer,
                ),
              ],
            ],
          ),
          if (_usesWindow) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Swipe left/right to browse month windows.',
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: _handleHorizontalDragStart,
            onHorizontalDragEnd: _handleHorizontalDragEnd,
            child: SizedBox(
              height: AppStatsChart.chartHeight,
              child: visiblePoints.isEmpty
                  ? Center(
                      child: Text(
                        'No trend data for this period.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    )
                  : _AnimatedStatsTrendChart(
                      points: visiblePoints,
                      barColor: colors.primary,
                      guideColor: colors.borderDefault,
                      textColor: colors.textSecondary,
                      tooltipBgColor: colors.bgElevated,
                      tooltipTextColor: colors.textPrimary,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChartNavButton extends StatelessWidget {
  const _ChartNavButton({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: colors.bgSecondary.withValues(alpha: enabled ? 0.8 : 0.35),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: colors.borderDefault),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: enabled ? colors.textPrimary : colors.textDisabled,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _AnimatedStatsTrendChart extends StatelessWidget {
  const _AnimatedStatsTrendChart({
    required this.points,
    required this.barColor,
    required this.guideColor,
    required this.textColor,
    required this.tooltipBgColor,
    required this.tooltipTextColor,
  });

  final List<StatsTrendPoint> points;
  final Color barColor;
  final Color guideColor;
  final Color textColor;
  final Color tooltipBgColor;
  final Color tooltipTextColor;

  @override
  Widget build(BuildContext context) {
    final maxMoves = points.fold<int>(
      0,
      (maxValue, point) => math.max(maxValue, point.totalMoves),
    );
    final maxY = math.max(4.0, maxMoves * 1.18);
    final barWidth = points.length > 24
        ? 7.0
        : points.length > 12
        ? 10.0
        : 14.0;

    return BarChart(
      BarChartData(
        minY: 0,
        maxY: maxY,
        alignment: BarChartAlignment.spaceAround,
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: maxY / 4,
          getDrawingHorizontalLine: (_) =>
              FlLine(color: guideColor.withValues(alpha: 0.58), strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 34,
              interval: maxY / 2,
              getTitlesWidget: (value, meta) {
                if (value <= 0) {
                  return const SizedBox.shrink();
                }
                return Text(
                  value.round().toString(),
                  style: Theme.of(
                    context,
                  ).textTheme.labelSmall?.copyWith(color: textColor),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index < 0 || index >= points.length) {
                  return const SizedBox.shrink();
                }
                final showLabel =
                    index == 0 ||
                    index == points.length - 1 ||
                    index == points.length ~/ 2;
                if (!showLabel) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(
                    _shortDate(points[index].dateYmd),
                    style: Theme.of(
                      context,
                    ).textTheme.labelSmall?.copyWith(color: textColor),
                  ),
                );
              },
            ),
          ),
        ),
        barTouchData: BarTouchData(
          enabled: true,
          touchTooltipData: BarTouchTooltipData(
            getTooltipColor: (_) => tooltipBgColor,
            tooltipBorderRadius: BorderRadius.circular(AppRadius.md),
            tooltipPadding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            getTooltipItem: (group, groupIndex, rod, rodIndex) {
              if (groupIndex < 0 || groupIndex >= points.length) {
                return null;
              }
              final point = points[groupIndex];
              return BarTooltipItem(
                '${_longDate(point.dateYmd)}\n${point.totalMoves} moves',
                TextStyle(
                  color: tooltipTextColor,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                  height: 1.35,
                ),
              );
            },
          ),
        ),
        barGroups: [
          for (var i = 0; i < points.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: math.max(
                    AppStatsChart.minBarHeight,
                    points[i].totalMoves.toDouble(),
                  ),
                  color: barColor,
                  width: barWidth,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppStatsChart.barRadius),
                  ),
                  backDrawRodData: BackgroundBarChartRodData(
                    show: true,
                    toY: maxY,
                    color: guideColor.withValues(alpha: 0.16),
                  ),
                ),
              ],
            ),
        ],
      ),
      duration: AppMotion.slow,
      curve: AppMotion.emphasized,
    );
  }

  String _shortDate(String ymd) {
    final date = statsParseYmd(ymd);
    if (date == null) {
      return ymd;
    }
    return '${date.day}/${date.month}';
  }

  String _longDate(String ymd) {
    final date = statsParseYmd(ymd);
    if (date == null) {
      return ymd;
    }
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }
}

class _TeamSnapshotCard extends StatelessWidget {
  const _TeamSnapshotCard({required this.team});

  final StatsTeamSummary team;

  @override
  Widget build(BuildContext context) {
    return _StatsSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Team Snapshot',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: context.appColors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Team moves',
                  value: team.totalMoves.toString(),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricTile(
                  label: 'Shunters',
                  value: team.activeShunters.toString(),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Avg/day',
                  value: team.avgMovesPerDay.toString(),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: _MetricTile(
                  label: 'Full loc',
                  value: team.totalFullLocations.toString(),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LeaderboardSection extends StatelessWidget {
  const _LeaderboardSection({
    required this.users,
    required this.sort,
    required this.expandedUserId,
    required this.onToggleUser,
  });

  final List<StatsUserSummary> users;
  final StatsSortOption sort;
  final String? expandedUserId;
  final void Function(String userId) onToggleUser;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    if (users.isEmpty) {
      return const _EmptyState(
        title: 'No leaderboard data',
        message: 'No shunters match the current filters.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Leaderboard',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: colors.textPrimary,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final user in users) ...[
          _LeaderboardCard(
            user: user,
            sort: sort,
            expanded: expandedUserId == user.userId,
            onTap: () => onToggleUser(user.userId),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}

class _LeaderboardCard extends StatelessWidget {
  const _LeaderboardCard({
    required this.user,
    required this.sort,
    required this.expanded,
    required this.onTap,
  });

  final StatsUserSummary user;
  final StatsSortOption sort;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final value = switch (sort) {
      StatsSortOption.perDay => user.movesPerDay.toStringAsFixed(1),
      StatsSortOption.totalMoves => user.totalMoves.toString(),
    };
    final label = switch (sort) {
      StatsSortOption.perDay => 'per day',
      StatsSortOption.totalMoves => 'moves',
    };
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: Material(
        color: colors.bgElevated.withValues(alpha: 0.86),
        child: InkWell(
          onTap: onTap,
          child: AnimatedSize(
            duration: AppMotion.normal,
            curve: AppMotion.emphasized,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                children: [
                  Row(
                    children: [
                      _RankBadge(rank: user.rank),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleSmall
                                  ?.copyWith(
                                    color: colors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                  ),
                            ),
                            const SizedBox(height: AppSpacing.xxs),
                            Text(
                              '${user.yardSystemId} · ${_shiftLabel(user.shiftPreference)}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(color: colors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            value,
                            style: Theme.of(context).textTheme.titleLarge
                                ?.copyWith(
                                  color: colors.textPrimary,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          Text(
                            label,
                            style: Theme.of(context).textTheme.labelMedium
                                ?.copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (expanded) ...[
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          child: _MetricTile(
                            label: 'Collect',
                            value: user.avgCollectLabel,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: _MetricTile(
                            label: 'Travel',
                            value: user.avgTravelLabel,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: _MetricTile(
                            label: 'Days',
                            value: user.daysWorked.toString(),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: _MetricTile(
                            label: 'Full loc',
                            value: user.totalFullLocations.toString(),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _shiftLabel(String? raw) {
    switch ((raw ?? '').trim().toLowerCase()) {
      case 'day':
        return 'Day';
      case 'afternoon':
        return 'Afternoon';
      case 'night':
        return 'Night';
      default:
        return 'Shift not set';
    }
  }
}

class _RankBadge extends StatelessWidget {
  const _RankBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Container(
      width: AppStatsCard.leaderboardAvatarSize,
      height: AppStatsCard.leaderboardAvatarSize,
      decoration: BoxDecoration(
        color: colors.bgSecondary,
        shape: BoxShape.circle,
        border: Border.all(color: colors.borderDefault),
      ),
      child: Center(
        child: Text(
          rank.toString(),
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: colors.textPrimary,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _StatsSurface extends StatelessWidget {
  const _StatsSurface({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
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
        child: child,
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _StatsSurface(
      child: Column(
        children: [
          Icon(Icons.query_stats_rounded, color: colors.textTertiary, size: 42),
          const SizedBox(height: AppSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Center(
      child: _StatsSurface(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, color: colors.warning, size: 42),
            const SizedBox(height: AppSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: AppSpacing.lg),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
