import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../../core/ui/nav_pill.dart';
import '../../../core/ui/status_badge.dart';
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

class _BreaksPanelState extends State<BreaksPanel> {
  List<ScheduledBreak> _breaks = const <ScheduledBreak>[];
  List<String> _locations = const <String>[];

  /// Profile defaults. Filter changes are kept in memory only, so every app
  /// start begins from the user's own hub and shift.
  BreakFilters _defaults = const BreakFilters();
  BreakFilters _filters = const BreakFilters();
  bool _filtersInitialized = false;
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
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
    final picked = await showModalBottomSheet<_LocationChoice>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) =>
          _LocationSheet(locations: _locations, selected: _filters.location),
    );
    if (picked != null && mounted) {
      _setFilters(_filters.withLocation(picked.name));
    }
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

    final visible = BreakWindowLogic.visibleBreaks(
      breaks: _breaks,
      now: DateTime.now(),
      filters: _filters,
    );

    final content = <Widget>[
      _BreakFilterRow(
        filters: _filters,
        canReset: _filters != _defaults,
        onPickLocation: _pickLocation,
        onToggleShift: (shift) => _setFilters(_filters.toggleShift(shift)),
        onReset: () => _setFilters(_defaults),
      ),
      const SizedBox(height: AppSpacing.sm),
      if (visible.isEmpty)
        _EmptyBreaks(
          filters: _filters,
          onShowAll: () => _setFilters(const BreakFilters()),
        )
      else
        ...visible.map(
          (entry) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: _BreakCard(
              entry: entry,
              isCurrentUser: entry.breakItem.userId == widget.session.userId,
            ),
          ),
        ),
    ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: content,
      ),
    );
  }
}

/// Sheet result; `name == null` means all locations.
class _LocationChoice {
  const _LocationChoice(this.name);

  final String? name;
}

class _LocationSheet extends StatelessWidget {
  const _LocationSheet({required this.locations, required this.selected});

  final List<String> locations;
  final String? selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    Widget option(String label, String? value) {
      final isSelected = value == selected;
      return ListTile(
        leading: Icon(
          value == null ? Icons.public_rounded : Icons.place_outlined,
          color: isSelected ? colors.primary : colors.textSecondary,
        ),
        title: Text(
          label,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: colors.textPrimary,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
          ),
        ),
        trailing: isSelected
            ? Icon(Icons.check_rounded, color: colors.primary)
            : null,
        onTap: () => Navigator.of(context).pop(_LocationChoice(value)),
      );
    }

    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: Text(
              'Location',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          option('All locations', null),
          for (final location in locations) option(location, location),
        ],
      ),
    );
  }
}

class _BreakFilterRow extends StatelessWidget {
  const _BreakFilterRow({
    required this.filters,
    required this.canReset,
    required this.onPickLocation,
    required this.onToggleShift,
    required this.onReset,
  });

  final BreakFilters filters;
  final bool canReset;
  final VoidCallback onPickLocation;
  final ValueChanged<BreakShift> onToggleShift;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      // Room for the selected pill glow, which would otherwise be clipped.
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          _FilterPill(
            label: filters.location ?? 'All locations',
            icon: Icons.place_outlined,
            trailingIcon: Icons.arrow_drop_down_rounded,
            selected: false,
            semanticsLabel: 'Location: ${filters.location ?? 'All locations'}',
            onTap: onPickLocation,
          ),
          for (final shift in BreakShift.values) ...[
            const SizedBox(width: AppSpacing.sm),
            _FilterPill(
              label: shift.label,
              selected: filters.includes(shift),
              onTap: () => onToggleShift(shift),
            ),
          ],
          if (canReset) ...[
            const SizedBox(width: AppSpacing.sm),
            _FilterPill(
              label: 'Reset',
              icon: Icons.restart_alt_rounded,
              selected: false,
              semanticsLabel: 'Reset to my shift',
              onTap: onReset,
            ),
          ],
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.trailingIcon,
    this.semanticsLabel,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final IconData? trailingIcon;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final foreground = selected ? colors.onPrimary : colors.textPrimary;
    final decoration = selected
        ? navPillDecoration(colors, selected: true)
        : BoxDecoration(
            color: colors.bgElevated.withValues(alpha: AppOpacity.subtle),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: colors.borderDefault),
          );
    return Semantics(
      button: true,
      selected: selected,
      label: semanticsLabel,
      excludeSemantics: semanticsLabel != null,
      child: AnimatedContainer(
        duration: AppMotion.normal,
        curve: AppMotion.emphasized,
        height: AppNavPill.chipHeight,
        decoration: decoration,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon case final icon?) ...[
                    Icon(
                      icon,
                      size: AppNavPill.chipIconSize,
                      color: selected ? foreground : colors.primary,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                  Text(
                    label,
                    style: AppTypography.labelLarge.copyWith(
                      color: foreground,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  if (trailingIcon case final trailingIcon?)
                    Icon(
                      trailingIcon,
                      size: AppNavPill.chipIconSize + AppSpacing.xs,
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
      surfaceOpacity: AppOpacity.subtle,
      child: Column(
        children: [
          Icon(Icons.free_breakfast_outlined, color: colors.textTertiary),
          const SizedBox(height: AppSpacing.sm),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
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

class _BreakCard extends StatelessWidget {
  const _BreakCard({required this.entry, required this.isCurrentUser});

  final VisibleBreak entry;
  final bool isCurrentUser;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final item = entry.breakItem;
    final end = _timeLabel(entry.end);
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            entry.isActive ? Icons.timer_outlined : Icons.schedule_outlined,
            color: entry.isActive ? colors.success : colors.info,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item.displayName}${isCurrentUser ? ' (You)' : ''}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${item.startTime}–$end • ${item.shift.label}'
                  '${item.location == null ? '' : ' • ${item.location}'}',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: colors.textSecondary),
                ),
                if (entry.isActive) ...[
                  const SizedBox(height: AppSpacing.sm),
                  LinearProgressIndicator(
                    value: _progress(entry),
                    color: colors.success,
                    backgroundColor: colors.successBg,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          StatusBadge(
            label: entry.isActive ? 'Active' : 'Upcoming',
            variant: entry.isActive ? BadgeVariant.success : BadgeVariant.info,
          ),
        ],
      ),
    );
  }

  double _progress(VisibleBreak value) {
    final total = value.end.difference(value.start).inSeconds;
    if (total <= 0) return 0;
    return DateTime.now().difference(value.start).inSeconds.clamp(0, total) /
        total;
  }

  String _timeLabel(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:'
      '${value.minute.toString().padLeft(2, '0')}';
}
