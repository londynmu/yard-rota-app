import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_option_sheet.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../home/data/stage_one_repository.dart';
import '../domain/break_models.dart';

class BreaksScreen extends StatelessWidget {
  const BreaksScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageOneRepository repository;
  final UserSession session;

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Breaks',
      body: BreaksPanel(repository: repository, session: session),
    );
  }
}

class BreaksPanel extends StatefulWidget {
  const BreaksPanel({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageOneRepository repository;
  final UserSession session;

  @override
  State<BreaksPanel> createState() => _BreaksPanelState();
}

class _BreaksPanelState extends State<BreaksPanel> with WidgetsBindingObserver {
  List<ScheduledBreak> _breaks = const <ScheduledBreak>[];
  List<String> _locations = const <String>[];

  /// Profile defaults. Filter changes are kept in memory only, so every app
  /// start begins from the user's own hub and shift.
  BreakFilters _defaults = const BreakFilters();
  BreakFilters _filters = const BreakFilters();
  bool _filtersInitialized = false;
  bool _loading = true;
  Object? _error;

  /// Live clock for countdowns — listeners rebuild without a full panel setState.
  final ValueNotifier<DateTime> _nowNotifier = ValueNotifier(DateTime.now());
  String _windowKey = '';
  Timer? _minuteTimer;

  static String _epochKey(DateTime now) {
    final inNight =
        now.hour >= BreakWindowLogic.nightStartHour ||
        now.hour < BreakWindowLogic.dayStartHour;
    return '${inNight ? 'night' : 'day'}:${BreakWindowLogic.nightStartYmd(now)}';
  }

  static bool _sameVisibleKeys(List<VisibleBreak> a, List<VisibleBreak> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].breakItem.id != b[i].breakItem.id) return false;
    }
    return true;
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
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _nowNotifier.value = DateTime.now();
    _windowKey = _epochKey(_nowNotifier.value);
    _load();
    // Tick every second for live countdowns; only setState when membership changes.
    _minuteTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      final nextKey = _epochKey(now);
      if (nextKey != _windowKey) {
        _windowKey = nextKey;
        _nowNotifier.value = now;
        _load();
        return;
      }
      final before = BreakWindowLogic.visibleBreaks(
        breaks: _breaks,
        now: _nowNotifier.value,
        filters: _filters,
      );
      final after = BreakWindowLogic.visibleBreaks(
        breaks: _breaks,
        now: now,
        filters: _filters,
      );
      _nowNotifier.value = now;
      if (!_sameVisibleKeys(before, after)) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _minuteTimer?.cancel();
    _nowNotifier.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final now = DateTime.now();
      final nextKey = _epochKey(now);
      _nowNotifier.value = now;
      if (nextKey != _windowKey) {
        _windowKey = nextKey;
      }
      _load();
    }
  }

  @override
  void didUpdateWidget(BreaksPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final before = oldWidget.session;
    final after = widget.session;
    if (before.preferredLocation != after.preferredLocation ||
        before.shiftPreference != after.shiftPreference) {
      final defaults = _profileDefaults(_locations);
      setState(() {
        _defaults = defaults;
        _filters = defaults;
      });
    }
  }

  BreakFilters _profileDefaults(List<String> locations) {
    return BreakFilters.forProfile(
      location: widget.session.preferredLocation,
      shift: widget.session.shiftPreference,
      activeLocations: locations,
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        widget.repository.loadBreaks(),
        widget.repository.loadActiveLocations().catchError(
          (_) => const <String>[],
        ),
      ]);
      if (!mounted) return;
      final breaks = results[0] as List<ScheduledBreak>;
      var locations = results[1] as List<String>;
      if (locations.isEmpty) {
        locations = _locationsFromBreaks(breaks);
      }
      final defaults = _profileDefaults(locations);
      setState(() {
        _breaks = breaks;
        _locations = locations;
        _defaults = defaults;
        if (!_filtersInitialized) {
          _filters = defaults;
          _filtersInitialized = true;
        } else if (_filters.location != null &&
            !locations.contains(_filters.location)) {
          _filters = _filters.withLocation(null);
        }
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  List<String> _locationsFromBreaks(List<ScheduledBreak> breaks) {
    return breaks
        .map((item) => item.location)
        .whereType<String>()
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList()
      ..sort();
  }

  void _setFilters(BreakFilters filters) => setState(() => _filters = filters);

  Future<void> _pickLocation() async {
    // Empty string = all locations (sheet cancel also returns null).
    const allKey = '';
    final picked = await showAppOptionSheet<String>(
      context: context,
      title: 'Location',
      subtitle: 'Filter breaks by hub',
      selected: _filters.location ?? allKey,
      options: [allKey, ..._locations],
      labelFor: (value) => value.isEmpty ? 'All locations' : value,
      selectAndClose: true,
    );
    if (picked == null || !mounted) return;
    _setFilters(_filters.withLocation(picked.isEmpty ? null : picked));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: AppCard(
            surfaceOpacity: AppOpacity.subtle,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Could not load breaks.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(label: 'Retry', onPressed: _load),
              ],
            ),
          ),
        ),
      );
    }

    final filters = _BreakFilterBar(
      filters: _filters,
      canReset: _filters != _defaults,
      vertical: _isWideLayout(context),
      onPickLocation: _pickLocation,
      onToggleShift: (shift) => _setFilters(_filters.toggleShift(shift)),
      onReset: () => _setFilters(_defaults),
    );

    final list = ListenableBuilder(
      listenable: _nowNotifier,
      builder: (context, _) {
        final now = _nowNotifier.value;
        final visible = BreakWindowLogic.visibleBreaks(
          breaks: _breaks,
          now: now,
          filters: _filters,
        );
        final groups = _groupBreaksByTime(visible);

        return RefreshIndicator(
          onRefresh: _load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              if (visible.isEmpty)
                SliverToBoxAdapter(
                  child: _EmptyBreaks(
                    filters: _filters,
                    onShowAll: () => _setFilters(const BreakFilters()),
                  ),
                )
              else
                _buildGroupsSliver(groups, now),
            ],
          ),
        );
      },
    );

    // Phone: filters above list. Wide: filters rail + list side-by-side.
    if (_isWideLayout(context)) {
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
        const SizedBox(height: AppSpacing.xs),
        Expanded(child: list),
      ],
    );
  }

  Widget _buildGroupsSliver(List<_BreakTimeBucket> groups, DateTime now) {
    return SliverList.builder(
      itemCount: groups.length,
      itemBuilder: (context, index) {
        return _BreakTimeGroup(
          group: groups[index],
          currentUserId: widget.session.userId,
          now: now,
        );
      },
    );
  }
}

class _BreakFilterBar extends StatelessWidget {
  const _BreakFilterBar({
    required this.filters,
    required this.canReset,
    required this.onPickLocation,
    required this.onToggleShift,
    required this.onReset,
    this.vertical = false,
  });

  final BreakFilters filters;
  final bool canReset;
  final VoidCallback onPickLocation;
  final ValueChanged<BreakShift> onToggleShift;
  final VoidCallback onReset;

  /// Wide layout: stack pills in a rail instead of a horizontal strip.
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final pills = <Widget>[
      // Location / sort control — always muted, never highlighted.
      _FilterPill(
        label: filters.location ?? 'All locations',
        icon: Icons.place_outlined,
        trailingIcon: Icons.arrow_drop_down_rounded,
        selected: false,
        expanded: vertical,
        semanticsLabel: 'Location: ${filters.location ?? 'All locations'}',
        onTap: onPickLocation,
      ),
      for (final shift in BreakShift.values)
        _FilterPill(
          label: shift.label,
          // Only active shift filters are highlighted (e.g. Night by default).
          selected: filters.includes(shift),
          expanded: vertical,
          onTap: () => onToggleShift(shift),
        ),
      if (canReset)
        _FilterPill(
          label: 'Reset',
          icon: Icons.restart_alt_rounded,
          selected: false,
          expanded: vertical,
          semanticsLabel: 'Reset to my shift',
          onTap: onReset,
        ),
    ];

    if (vertical) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < pills.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.xs),
            pills[i],
          ],
        ],
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          for (var i = 0; i < pills.length; i++) ...[
            if (i > 0) const SizedBox(width: AppSpacing.xs),
            pills[i],
          ],
        ],
      ),
    );
  }
}

/// Muted slate only — filter bar stays neutral (no green / amber / violet).
_ShiftAccent _slateAccent(BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return _ShiftAccent(
    fg: AppAvailabilityTones.unavailable(isDark: isDark),
    bg: AppAvailabilityTones.unavailableBg(isDark: isDark),
    border: AppAvailabilityTones.unavailable(isDark: isDark),
  );
}

class _ShiftAccent {
  const _ShiftAccent({
    required this.fg,
    required this.bg,
    required this.border,
  });

  final Color fg;
  final Color bg;
  final Color border;
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.trailingIcon,
    this.semanticsLabel,
    this.expanded = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final IconData? trailingIcon;
  final String? semanticsLabel;

  /// Stretch to rail width on tablet / landscape.
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final slate = _slateAccent(context);
    // Selected = soft slate wash; unselected = quiet elevated chip. No bright accents.
    final foreground = selected ? slate.fg : colors.textPrimary;
    final decoration = BoxDecoration(
      color: selected
          ? slate.bg
          : colors.bgElevated.withValues(alpha: AppOpacity.subtle),
      borderRadius: BorderRadius.circular(AppRadius.full),
      border: Border.all(
        color: selected
            ? slate.border.withValues(alpha: 0.55)
            : colors.borderDefault,
        width: AppStroke.thin,
      ),
    );

    return Semantics(
      button: true,
      selected: selected,
      label: semanticsLabel,
      excludeSemantics: semanticsLabel != null,
      child: AnimatedContainer(
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : AppMotion.normal,
        curve: AppMotion.emphasized,
        height: AppNavPill.chipHeight,
        width: expanded ? double.infinity : null,
        constraints: const BoxConstraints(
          minWidth: AppNavPill.chipHeight,
          minHeight: AppNavPill.chipHeight,
        ),
        decoration: decoration,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Row(
                mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
                mainAxisAlignment: expanded
                    ? MainAxisAlignment.start
                    : MainAxisAlignment.center,
                children: [
                  if (icon case final icon?) ...[
                    Icon(
                      icon,
                      size: AppNavPill.chipIconSize,
                      color: selected ? slate.fg : colors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.xxs),
                  ],
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: foreground,
                        fontWeight:
                            selected ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                  ),
                  if (trailingIcon case final trailingIcon?)
                    Icon(
                      trailingIcon,
                      size: AppNavPill.chipIconSize + 2,
                      color: colors.textSecondary,
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

class _EmptyBreaks extends StatelessWidget {
  const _EmptyBreaks({required this.filters, required this.onShowAll});

  final BreakFilters filters;
  final VoidCallback onShowAll;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final scope = <String>[
      ?filters.location,
      if (!filters.allShifts)
        BreakShift.values
            .where(filters.includes)
            .map((shift) => shift.label)
            .join(', '),
    ].where((part) => part.isNotEmpty).join(' · ');
    final message = scope.isEmpty
        ? 'No active or upcoming breaks.'
        : 'No active or upcoming breaks for $scope.';

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      surfaceOpacity: AppOpacity.subtle,
      child: Column(
        children: [
          Icon(
            Icons.free_breakfast_outlined,
            size: 22,
            color: colors.textTertiary,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: colors.textSecondary),
          ),
          if (!filters.showsEverything) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              label: 'Show all breaks',
              variant: AppButtonVariant.secondary,
              isExpanded: false,
              onPressed: onShowAll,
            ),
          ],
        ],
      ),
    );
  }
}

class _BreakTimeBucket {
  const _BreakTimeBucket({required this.label, required this.entries});

  final String label;
  final List<VisibleBreak> entries;
}

/// Group visible breaks by wall-clock window (e.g. 20:00–21:00).
List<_BreakTimeBucket> _groupBreaksByTime(List<VisibleBreak> visible) {
  final buckets = <String, List<VisibleBreak>>{};
  final order = <String>[];
  for (final entry in visible) {
    final label =
        '${_formatHm(entry.start)}–${_formatHm(entry.end)}';
    final list = buckets.putIfAbsent(label, () {
      order.add(label);
      return <VisibleBreak>[];
    });
    list.add(entry);
  }
  for (final list in buckets.values) {
    list.sort(
      (a, b) => a.breakItem.displayName.compareTo(b.breakItem.displayName),
    );
  }
  return [
    for (final label in order)
      _BreakTimeBucket(label: label, entries: buckets[label]!),
  ];
}

String _formatHm(DateTime value) =>
    '${value.hour.toString().padLeft(2, '0')}:'
    '${value.minute.toString().padLeft(2, '0')}';

class _BreakTimeGroup extends StatelessWidget {
  const _BreakTimeGroup({
    required this.group,
    required this.currentUserId,
    required this.now,
  });

  final _BreakTimeBucket group;
  final String currentUserId;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hasActive = group.entries.any(
      (entry) => _isBreakActive(entry, now),
    );
    // Same card shell as Info Guide / Shunter of the Month:
    // tinted wash + accent border + rounded AppCard.
    // Active → green; upcoming → award teal (same as Shunter of the Month).
    final accent = hasActive
        ? AppAvailabilityTones.available(colors)
        : AppAvailabilityTones.award(isDark: isDark);
    final wash = hasActive
        ? AppAvailabilityTones.availableBg(colors)
        : AppAvailabilityTones.awardBg(isDark: isDark);
    final border = accent.withValues(alpha: isDark ? 0.35 : 0.28);
    final headerFg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.45 : 0.35),
      colors.textPrimary,
    );
    final headerBg = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.14 : 0.08),
      colors.bgElevated,
    );
    final sample = group.entries.first;
    final countdown = _breakCountdownLabel(sample, now);

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
                      group.label,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: headerFg,
                        height: 1.2,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(
                    countdown,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: headerFg,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            for (var i = 0; i < group.entries.length; i++)
              _BreakPersonRow(
                entry: group.entries[i],
                isCurrentUser:
                    group.entries[i].breakItem.userId == currentUserId,
                now: now,
                showDivider: i < group.entries.length - 1,
              ),
          ],
        ),
      ),
    );
  }
}

bool _isBreakActive(VisibleBreak entry, DateTime now) =>
    !now.isBefore(entry.start) && now.isBefore(entry.end);

/// English countdown labels for Active / Upcoming rows.
String _breakCountdownLabel(VisibleBreak entry, DateTime now) {
  if (_isBreakActive(entry, now)) {
    final left = entry.end.difference(now);
    if (left.inSeconds <= 0) return 'Ending…';
    if (left.inMinutes < 1) return 'Less than 1 min left';
    final mins = left.inMinutes;
    return mins == 1 ? '1 min left' : '$mins min left';
  }
  final until = entry.start.difference(now);
  if (until.inSeconds <= 0) return 'Starting…';
  if (until.inMinutes < 1) return 'Starting soon';
  final mins = until.inMinutes;
  if (mins < 60) {
    return mins == 1 ? 'in 1 min' : 'in $mins min';
  }
  final hours = mins ~/ 60;
  final rem = mins % 60;
  if (rem == 0) {
    return hours == 1 ? 'in 1 h' : 'in $hours h';
  }
  return 'in ${hours}h ${rem}m';
}

class _BreakPersonRow extends StatelessWidget {
  const _BreakPersonRow({
    required this.entry,
    required this.isCurrentUser,
    required this.now,
    this.showDivider = false,
  });

  final VisibleBreak entry;
  final bool isCurrentUser;
  final DateTime now;

  /// Inset hairline under the row (iOS Settings separators start after leading).
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final item = entry.breakItem;
    final isActive = _isBreakActive(entry, now);
    final progressFg = AppAvailabilityTones.available(colors);
    final progressBg = AppAvailabilityTones.availableBg(colors);

    // Highlight + You chip only for the signed-in user (no status badges).
    final mineFill = isCurrentUser
        ? Color.alphaBlend(
            colors.primary.withValues(alpha: isDark ? 0.18 : 0.08),
            colors.bgElevated,
          )
        : Colors.transparent;

    // md + strip ≈ header lg inset — names share the header text column.
    const contentInset = AppSpacing.md;

    return ColoredBox(
      color: mineFill,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (isCurrentUser)
                  Container(
                    width: AppPreCheckCard.accentStripWidth,
                    color: colors.primary,
                  )
                else
                  const SizedBox(width: AppPreCheckCard.accentStripWidth),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: contentInset,
                      vertical: AppSpacing.sm,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                item.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(
                                      fontWeight: isCurrentUser
                                          ? FontWeight.w500
                                          : FontWeight.w400,
                                      color: colors.textPrimary,
                                      height: 1.2,
                                    ),
                              ),
                            ),
                            if (isCurrentUser) ...[
                              const SizedBox(width: AppSpacing.sm),
                              _YouChip(colors: colors),
                            ],
                          ],
                        ),
                        if (isActive) ...[
                          const SizedBox(height: AppSpacing.xs),
                          ClipRRect(
                            borderRadius:
                                BorderRadius.circular(AppRadius.full),
                            child: LinearProgressIndicator(
                              value: _breakProgress(entry, now),
                              minHeight: 3,
                              color: progressFg,
                              backgroundColor: progressBg,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (showDivider)
            Padding(
              padding: const EdgeInsets.only(
                left: AppPreCheckCard.accentStripWidth + contentInset,
              ),
              child: Divider(
                height: 1,
                thickness: AppStroke.hairline,
                color: colors.borderSubtle,
              ),
            ),
        ],
      ),
    );
  }
}

double _breakProgress(VisibleBreak entry, DateTime now) {
  final total = entry.end.difference(entry.start).inSeconds;
  if (total <= 0) return 0;
  return now.difference(entry.start).inSeconds.clamp(0, total) / total;
}

/// Compact “You” marker — second cue so “mine” is not colour-only.
class _YouChip extends StatelessWidget {
  const _YouChip({required this.colors});

  final AppColorsScheme colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.xs,
        vertical: AppSpacing.xxs,
      ),
      decoration: BoxDecoration(
        color: colors.primary.withValues(alpha: AppNavPill.subtleFillAlpha),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: colors.primary.withValues(alpha: 0.45),
          width: AppStroke.hairline,
        ),
      ),
      child: Text(
        'You',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: colors.primary,
          fontWeight: FontWeight.w500,
          height: 1.1,
        ),
      ),
    );
  }
}
