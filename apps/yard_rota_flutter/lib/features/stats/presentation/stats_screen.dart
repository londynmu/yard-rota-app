import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/home_wallpaper.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_option_sheet.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/nav_pill.dart';
import '../data/stats_repository.dart';
import '../domain/stats_models.dart';

/// Tablet portrait (≥700) or landscape phone/tablet (≥600 wide).
bool statsIsWideLayout(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final landscape = size.width > size.height;
  if (landscape && size.width >= 600) {
    return true;
  }
  return size.width >= 700;
}

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
        AppToast.error(context, 'Stats refresh failed. Showing saved data.');
        return;
      }
      setState(() {
        _loading = false;
        _refreshing = false;
        _error =
            'Stats could not be loaded. Connect to the internet and try again.';
      });
      AppToast.error(context, _error!);
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
    return showAppOptionSheet<T>(
      context: context,
      title: title,
      options: options,
      selected: selected,
      labelFor: labelFor,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mq = MediaQuery.of(context);
    // Shell uses extendBody — keep viewport full height; clear bottom nav in scroll.
    final scrollBottomInset =
        mq.padding.bottom +
        AppComponentTokens.bottomNavHeight +
        AppSpacing.md;

    return Scaffold(
      backgroundColor: Colors.transparent,
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
                mq.padding.top + AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _data == null
                  ? _ErrorBody(message: _error!, onRetry: _refresh)
                  : _StatsContent(
                      data: _data,
                      refreshing: _refreshing,
                      expandedUserId: _expandedUserId,
                      scrollBottomInset: scrollBottomInset,
                      onRefresh: _refresh,
                      onToggleUser: (userId) {
                        HapticFeedback.selectionClick();
                        setState(() {
                          _expandedUserId = _expandedUserId == userId
                              ? null
                              : userId;
                        });
                      },
                      onRange: () {
                        HapticFeedback.selectionClick();
                        _openRangeSheet();
                      },
                      onSort: () {
                        HapticFeedback.selectionClick();
                        _openSortSheet();
                      },
                      onShift: () {
                        HapticFeedback.selectionClick();
                        _openShiftSheet();
                      },
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
    required this.scrollBottomInset,
    required this.onRefresh,
    required this.onToggleUser,
    required this.onRange,
    required this.onSort,
    required this.onShift,
  });

  final StatsDashboardData? data;
  final bool refreshing;
  final String? expandedUserId;
  final double scrollBottomInset;
  final Future<void> Function() onRefresh;
  final void Function(String userId) onToggleUser;
  final VoidCallback onRange;
  final VoidCallback onSort;
  final VoidCallback onShift;

  @override
  Widget build(BuildContext context) {
    final current = data;
    final wide = statsIsWideLayout(context);
    final colors = context.appColors;
    final filters = _StatsFilterBar(
      range: current?.range ?? StatsRangeFilter.lastDay,
      sort: current?.sort ?? StatsSortOption.totalMoves,
      shift: current?.shiftFilter ?? StatsShiftFilter.all,
      vertical: wide,
      onRange: onRange,
      onSort: onSort,
      onShift: onShift,
    );

    final list = RefreshIndicator(
      onRefresh: onRefresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (refreshing)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.sm),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            ),
          if (current == null)
            const SliverToBoxAdapter(
              child: _EmptyState(
                title: 'No saved stats',
                message: 'Connect to the internet to load stats.',
              ),
            )
          else if (!current.currentUserHasYardId)
            const SliverToBoxAdapter(
              child: _EmptyState(
                title: 'Yard System ID required',
                message:
                    'You need a Yard System ID to view performance statistics.',
              ),
            )
          else ...[
            SliverToBoxAdapter(
              child: wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _MyPerformanceCard(data: current)),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: _TeamSnapshotCard(team: current.team),
                        ),
                      ],
                    )
                  : _MyPerformanceCard(data: current),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md)),
            if (!wide) ...[
              SliverToBoxAdapter(
                child: _TrendCard(
                  points: current.trend,
                  range: current.range,
                ),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.md),
              ),
              SliverToBoxAdapter(
                child: _TeamSnapshotCard(team: current.team),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.md),
              ),
            ] else ...[
              SliverToBoxAdapter(
                child: _TrendCard(
                  points: current.trend,
                  range: current.range,
                ),
              ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppSpacing.md),
              ),
            ],
            SliverToBoxAdapter(
              child: Text(
                'Leaderboard',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
            if (current.users.isEmpty)
              const SliverToBoxAdapter(
                child: _EmptyState(
                  title: 'No leaderboard data',
                  message: 'No shunters match the current filters.',
                ),
              )
            else
              SliverList.builder(
                itemCount: current.users.length,
                itemBuilder: (context, index) {
                  final user = current.users[index];
                  return Padding(
                    padding: EdgeInsets.only(
                      bottom: index == current.users.length - 1
                          ? 0
                          : AppSpacing.sm,
                    ),
                    child: _LeaderboardCard(
                      user: user,
                      sort: current.sort,
                      expanded: expandedUserId == user.userId,
                      onTap: () => onToggleUser(user.userId),
                    ),
                  );
                },
              ),
          ],
          SliverToBoxAdapter(
            child: SizedBox(height: scrollBottomInset),
          ),
        ],
      ),
    );

    if (wide) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 220,
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(right: AppSpacing.md),
              child: filters,
            ),
          ),
          Expanded(child: list),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        filters,
        const SizedBox(height: AppSpacing.md),
        Expanded(child: list),
      ],
    );
  }
}

/// Same quiet track shell as My Rota / Home Calendar–Breaks–Info.
class _StatsFilterBar extends StatelessWidget {
  const _StatsFilterBar({
    required this.range,
    required this.sort,
    required this.shift,
    required this.onRange,
    required this.onSort,
    required this.onShift,
    this.vertical = false,
  });

  final StatsRangeFilter range;
  final StatsSortOption sort;
  final StatsShiftFilter shift;
  final VoidCallback onRange;
  final VoidCallback onSort;
  final VoidCallback onShift;
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final segments = <Widget>[
      _FilterSegment(
        label: range.label,
        semanticLabel: 'Range: ${range.label}',
        onTap: onRange,
      ),
      _FilterSegment(
        label: sort.label,
        semanticLabel: 'Sort: ${sort.label}',
        onTap: onSort,
      ),
      _FilterSegment(
        label: shift.label,
        semanticLabel: 'Shift: ${shift.label}',
        onTap: onShift,
      ),
    ];

    if (vertical) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < segments.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            AppQuietFilterTrack(child: segments[i]),
          ],
        ],
      );
    }

    return AppQuietFilterTrack(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final segment in segments) Expanded(child: segment),
        ],
      ),
    );
  }
}

class _FilterSegment extends StatelessWidget {
  const _FilterSegment({
    required this.label,
    required this.onTap,
    this.semanticLabel,
  });

  final String label;
  final VoidCallback onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelColor = bottomNavLabelColor(
      colors,
      selected: false,
      isDark: isDark,
    );

    return Semantics(
      button: true,
      label: semanticLabel ?? label,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppComponentTokens.minTouchTarget,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              child: Center(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: labelColor,
                    fontWeight: FontWeight.w400,
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
    final teamAverageRatio = user.teamAverageRatio;
    return _StatsSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: AppStatsCard.compactRankBadgeSize,
                height: AppStatsCard.compactRankBadgeSize,
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
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
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
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
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
              const SizedBox(width: AppSpacing.sm),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    user.totalMoves.toString(),
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: colors.textPrimary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  Text(
                    'moves',
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          _CompactStatList(
            items: [
              _CompactStatItem(
                label: 'Moves/day',
                value: user.movesPerDay.toStringAsFixed(1),
              ),
              _CompactStatItem(
                label: 'Days',
                value: user.daysWorked.toString(),
              ),
              _CompactStatItem(label: 'Collect', value: user.avgCollectLabel),
              _CompactStatItem(label: 'Travel', value: user.avgTravelLabel),
              if (teamAverageRatio != null)
                _CompactStatItem(
                  label: 'Team avg',
                  value: '${(teamAverageRatio * 100).round()}%',
                  highlighted: teamAverageRatio >= 1,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CompactStatItem {
  const _CompactStatItem({
    required this.label,
    required this.value,
    this.highlighted = false,
  });

  final String label;
  final String value;
  final bool highlighted;
}

class _CompactStatList extends StatelessWidget {
  const _CompactStatList({required this.items});

  final List<_CompactStatItem> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    // Flat rows inside the parent card — avoid a nested bordered box.
    return Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          _CompactStatRow(item: items[i]),
          if (i != items.length - 1)
            Divider(height: 1, thickness: 1, color: colors.divider),
        ],
      ],
    );
  }
}

class _CompactStatRow extends StatelessWidget {
  const _CompactStatRow({required this.item});

  final _CompactStatItem item;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final valueColor = item.highlighted ? colors.primary : colors.textPrimary;
    return ConstrainedBox(
      constraints: const BoxConstraints(
        minHeight: AppStatsCard.compactRowMinHeight,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppStatsCard.compactRowHorizontalPadding,
          vertical: AppStatsCard.compactRowVerticalPadding,
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: colors.textSecondary),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Text(
              item.value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: valueColor,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
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
        color: colors.bgSecondary.withValues(alpha: AppOpacity.subtle),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
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
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.2,
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
    return Semantics(
      button: true,
      enabled: enabled,
      label: label == 'Prev'
          ? 'Previous trend window'
          : 'Next trend window',
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppComponentTokens.minTouchTarget,
              minWidth: AppComponentTokens.minTouchTarget,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.bgSecondary.withValues(
                  alpha: enabled ? AppOpacity.subtle : AppOpacity.disabled,
                ),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: enabled ? colors.textPrimary : colors.textDisabled,
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
              reservedSize: 40,
              interval: maxY / 2,
              getTitlesWidget: (value, meta) {
                if (value <= 0) {
                  return const SizedBox.shrink();
                }
                // Skip near-duplicates from chart rounding at maxY.
                if ((value - meta.max).abs() < 0.5 && value != meta.max) {
                  return const SizedBox.shrink();
                }
                return Text(
                  value.round().toString(),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: textColor,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
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
              final tooltipStyle =
                  Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: tooltipTextColor,
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  ) ??
                  TextStyle(
                    color: tooltipTextColor,
                    fontWeight: FontWeight.w700,
                    height: 1.35,
                  );
              return BarTooltipItem(
                '${_longDate(point.dateYmd)}\n${point.totalMoves} moves',
                tooltipStyle,
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
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : AppMotion.slow,
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
    final colors = context.appColors;
    return _StatsSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Team Snapshot',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _CompactStatList(
            items: [
              _CompactStatItem(
                label: 'Team moves',
                value: team.totalMoves.toString(),
              ),
              _CompactStatItem(
                label: 'Shunters',
                value: team.activeShunters.toString(),
              ),
              _CompactStatItem(
                label: 'Avg/day',
                value: team.avgMovesPerDay.toString(),
              ),
              _CompactStatItem(
                label: 'Full loc',
                value: team.totalFullLocations.toString(),
              ),
            ],
          ),
        ],
      ),
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
    return AppCard(
      surfaceOpacity: AppOpacity.homeCard,
      padding: EdgeInsets.zero,
      child: Semantics(
        button: true,
        expanded: expanded,
        label: '${user.displayName}, rank ${user.rank}, $value $label',
        hint: expanded ? 'Collapse details' : 'Expand details',
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.lg),
            onTap: onTap,
            child: AnimatedSize(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : AppMotion.normal,
              curve: AppMotion.emphasized,
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: AppComponentTokens.minTouchTarget,
                ),
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
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(
                                        color: colors.textPrimary,
                                        fontWeight: FontWeight.w700,
                                      ),
                                ),
                                const SizedBox(height: AppSpacing.xxs),
                                Text(
                                  '${user.yardSystemId} · ${_shiftLabel(user.shiftPreference)}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
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
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                      color: colors.textPrimary,
                                      fontWeight: FontWeight.w700,
                                      fontFeatures: const [
                                        FontFeature.tabularFigures(),
                                      ],
                                    ),
                              ),
                              Text(
                                label,
                                style: Theme.of(context)
                                    .textTheme
                                    .labelMedium
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
            fontWeight: FontWeight.w700,
            fontFeatures: const [FontFeature.tabularFigures()],
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
    return AppCard(
      surfaceOpacity: AppOpacity.homeCard,
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: child,
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
    return AppCard(
      surfaceOpacity: AppOpacity.subtle,
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        children: [
          Icon(
            Icons.query_stats_rounded,
            color: colors.textTertiary,
            size: 36,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: colors.textPrimary,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
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
      child: AppCard(
        surfaceOpacity: AppOpacity.subtle,
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, color: colors.warning, size: 36),
            const SizedBox(height: AppSpacing.md),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: 'Retry',
              variant: AppButtonVariant.secondary,
              onPressed: () => onRetry(),
            ),
          ],
        ),
      ),
    );
  }
}
