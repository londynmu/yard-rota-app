import 'package:flutter/material.dart';

import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../../core/ui/app_toast.dart';
import '../../../core/ui/status_badge.dart';
import '../../home/data/stage_one_repository.dart';
import '../data/break_preferences.dart';
import '../domain/break_models.dart';

class BreaksScreen extends StatelessWidget {
  const BreaksScreen({
    super.key,
    required this.repository,
    required this.currentUserId,
  });

  final StageOneRepository repository;
  final String currentUserId;

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Breaks',
      body: BreaksPanel(repository: repository, currentUserId: currentUserId),
    );
  }
}

class BreaksPanel extends StatefulWidget {
  const BreaksPanel({
    super.key,
    required this.repository,
    required this.currentUserId,
    this.compact = false,
  });

  final StageOneRepository repository;
  final String currentUserId;
  final bool compact;

  @override
  State<BreaksPanel> createState() => _BreaksPanelState();
}

class _BreaksPanelState extends State<BreaksPanel> {
  List<ScheduledBreak> _breaks = const <ScheduledBreak>[];
  BreakFilters _filters = const BreakFilters();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<dynamic>([
        widget.repository.loadBreaks(),
        readBreakFilters(),
      ]);
      if (!mounted) return;
      final breaks = results[0] as List<ScheduledBreak>;
      var filters = results[1] as BreakFilters;
      final locations = breaks
          .map((item) => item.location)
          .whereType<String>()
          .where((value) => value.isNotEmpty)
          .toSet();
      if (filters.location != null && !locations.contains(filters.location)) {
        filters = BreakFilters(
          day: filters.day,
          afternoon: filters.afternoon,
          night: filters.night,
        );
      }
      setState(() {
        _breaks = breaks;
        _filters = filters;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      AppToast.show(context, 'Breaks could not be loaded. Please retry.');
    }
  }

  Future<void> _updateFilters(BreakFilters filters) async {
    setState(() => _filters = filters);
    await writeBreakFilters(filters);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final locations =
        _breaks
            .map((item) => item.location)
            .whereType<String>()
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList()
          ..sort();
    final visible = BreakWindowLogic.visibleBreaks(
      breaks: _breaks,
      now: DateTime.now(),
      filters: _filters,
    );

    final content = <Widget>[
      _BreakFilterBar(
        locations: locations,
        filters: _filters,
        onChanged: _updateFilters,
      ),
      const SizedBox(height: AppSpacing.md),
      if (visible.isEmpty)
        const AppCard(
          child: Center(child: Text('No active or upcoming breaks.')),
        )
      else
        ...visible.map(
          (entry) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: _BreakCard(
              entry: entry,
              isCurrentUser: entry.breakItem.userId == widget.currentUserId,
            ),
          ),
        ),
    ];

    if (widget.compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: content,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: content,
      ),
    );
  }
}

class _BreakFilterBar extends StatelessWidget {
  const _BreakFilterBar({
    required this.locations,
    required this.filters,
    required this.onChanged,
  });

  final List<String> locations;
  final BreakFilters filters;
  final ValueChanged<BreakFilters> onChanged;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: filters.location,
            decoration: const InputDecoration(
              labelText: 'Location',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
            items: <DropdownMenuItem<String>>[
              const DropdownMenuItem<String>(
                value: null,
                child: Text('All locations'),
              ),
              ...locations.map(
                (location) => DropdownMenuItem<String>(
                  value: location,
                  child: Text(location),
                ),
              ),
            ],
            onChanged: (location) => onChanged(
              BreakFilters(
                location: location,
                day: filters.day,
                afternoon: filters.afternoon,
                night: filters.night,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          SegmentedButton<BreakShift>(
            showSelectedIcon: false,
            multiSelectionEnabled: true,
            emptySelectionAllowed: true,
            segments: BreakShift.values
                .map(
                  (shift) => ButtonSegment<BreakShift>(
                    value: shift,
                    label: Text(shift.label),
                  ),
                )
                .toList(growable: false),
            selected: <BreakShift>{
              if (filters.day) BreakShift.day,
              if (filters.afternoon) BreakShift.afternoon,
              if (filters.night) BreakShift.night,
            },
            onSelectionChanged: (selection) => onChanged(
              BreakFilters(
                location: filters.location,
                day: selection.contains(BreakShift.day),
                afternoon: selection.contains(BreakShift.afternoon),
                night: selection.contains(BreakShift.night),
              ),
            ),
          ),
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
