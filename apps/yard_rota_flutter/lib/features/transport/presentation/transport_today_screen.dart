import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../data/transport_dashboard_repository.dart';
import '../domain/transport_dashboard_models.dart';

/// Transport Manager Today KPI screen (read-only).
class TransportTodayScreen extends StatefulWidget {
  const TransportTodayScreen({
    super.key,
    required this.session,
    this.dashboardRepository,
    this.embedded = false,
    this.onOpenRota,
    this.onOpenBreaks,
    this.bottomPadding = AppSpacing.xl,
  });

  final UserSession session;
  final TransportDashboardRepository? dashboardRepository;
  final bool embedded;
  final VoidCallback? onOpenRota;
  final VoidCallback? onOpenBreaks;
  final double bottomPadding;

  @override
  State<TransportTodayScreen> createState() => _TransportTodayScreenState();
}

class _TransportTodayScreenState extends State<TransportTodayScreen> {
  late final TransportDashboardRepository _repository;
  late final String _dateYmd;

  List<TransportStaffedLocation> _locations = const [];
  String? _location;
  TransportTodaySnapshot? _snapshot;
  bool _loading = true;
  Timer? _breakTimer;

  String get _firstName {
    final parts = widget.session.displayName.trim().split(RegExp(r'\s+'));
    return parts.isEmpty || parts.first.isEmpty ? 'there' : parts.first;
  }

  @override
  void initState() {
    super.initState();
    // Same operational day as PWA (`getEffectiveTodayYmd` / local clock).
    _dateYmd = transportEffectiveTodayYmd();
    _repository =
        widget.dashboardRepository ??
        TransportDashboardRepository(Supabase.instance.client);
    _initialise();
    _breakTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_location != null) _loadSnapshot(silent: true);
    });
  }

  @override
  void dispose() {
    _breakTimer?.cancel();
    super.dispose();
  }

  Future<void> _initialise() async {
    try {
      _repository.requireTransportRead(widget.session);
      final staffed = await _repository.loadStaffedLocations(
        session: widget.session,
        dateYmd: _dateYmd,
      );
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString('tm_dashboard_location');
      final location = resolveTransportLocationSelection(
        staffed: staffed,
        savedName: saved,
      );
      if (!mounted) return;
      setState(() {
        _locations = staffed;
        _location = location;
      });
      if (location != null) {
        await _loadSnapshot();
      } else {
        setState(() => _loading = false);
      }
    } on StageTwoAuthorizationException {
      if (mounted) {
        AppToast.error(context, 'Transport dashboard access is required.');
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Could not load dashboard.');
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadSnapshot({bool silent = false}) async {
    final location = _location;
    if (location == null) return;
    if (!silent) setState(() => _loading = true);
    try {
      final snapshot = await _repository.loadTodaySnapshot(
        session: widget.session,
        dateYmd: _dateYmd,
        location: location,
      );
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        if (!silent) {
          AppToast.error(context, 'Could not load staffing data.');
        }
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _selectLocation(String location) async {
    setState(() => _location = location);
    (await SharedPreferences.getInstance()).setString(
      'tm_dashboard_location',
      location,
    );
    await _loadSnapshot();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final snapshot = _snapshot;

    final body = RefreshIndicator(
      onRefresh: () => _loadSnapshot(),
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          widget.bottomPadding,
        ),
        children: [
          Text(
            'Hello, $_firstName',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (_locations.isEmpty && !_loading)
            AppCard(
              padding: const EdgeInsets.all(AppSpacing.md),
              surfaceOpacity: AppOpacity.subtle,
              child: Text(
                'No shunters scheduled today at any location.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            )
          else ...[
            _LocationPills(
              locations: _locations,
              selected: _location,
              onSelect: _selectLocation,
            ),
            const SizedBox(height: AppSpacing.sm),
            if (_loading && snapshot == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (snapshot != null) ...[
              _GlanceRow(snapshot: snapshot),
              const SizedBox(height: AppSpacing.sm),
              _AtWorkCard(
                counts: snapshot.atWork,
                onOpen: widget.onOpenRota,
              ),
              const SizedBox(height: AppSpacing.sm),
              _OnBreakCard(
                people: snapshot.onBreakPeople,
                onOpen: widget.onOpenBreaks,
              ),
              const SizedBox(height: AppSpacing.sm),
              _RemovedCard(people: snapshot.removedPeople),
            ],
          ],
        ],
      ),
    );

    if (widget.embedded) return body;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: AppBar(title: const Text('Transport Dashboard')),
      body: body,
    );
  }
}

class _LocationPills extends StatelessWidget {
  const _LocationPills({
    required this.locations,
    required this.selected,
    required this.onSelect,
  });

  final List<TransportStaffedLocation> locations;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final location in locations)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.xs),
              child: ChoiceChip(
                label: Text(
                  location.name,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: location.name == selected
                        ? colors.textPrimary
                        : colors.textSecondary,
                  ),
                ),
                selected: location.name == selected,
                onSelected: (_) => onSelect(location.name),
                selectedColor: colors.bgTertiary,
                backgroundColor: colors.bgElevated,
                side: BorderSide(color: colors.borderSubtle),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
        ],
      ),
    );
  }
}

/// Quiet glance totals — one card, flat columns (no nested metric chips).
class _GlanceRow extends StatelessWidget {
  const _GlanceRow({required this.snapshot});

  final TransportTodaySnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return AppCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.md,
      ),
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      child: Row(
        children: [
          _GlanceCell(label: 'At work', value: snapshot.atWork.total),
          _GlanceCell(label: 'Absent', value: snapshot.absences.total),
          _GlanceCell(label: 'On break', value: snapshot.onBreakCount),
          _GlanceCell(label: 'Removed', value: snapshot.removedCount),
        ],
      ),
    );
  }
}

class _GlanceCell extends StatelessWidget {
  const _GlanceCell({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Expanded(
      child: Column(
        children: [
          Text(
            '$value',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
              height: 1.1,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.child,
    this.trailing,
    this.onTap,
    this.semanticsLabel,
  });

  final String title;
  final Widget child;
  final Widget? trailing;
  final VoidCallback? onTap;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final card = AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.textPrimary,
                  ),
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.sm),
                trailing!,
              ],
              if (onTap != null) ...[
                const SizedBox(width: AppSpacing.xs),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: colors.textTertiary,
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          child,
        ],
      ),
    );

    if (onTap == null) return card;
    return Semantics(
      button: true,
      label: semanticsLabel ?? title,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: card,
        ),
      ),
    );
  }
}

class _AtWorkCard extends StatelessWidget {
  const _AtWorkCard({required this.counts, this.onOpen});

  final TransportShiftCounts counts;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _SectionCard(
      title: 'Shunters today',
      onTap: onOpen,
      semanticsLabel: 'View today rota',
      trailing: Text(
        '${counts.total}',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: colors.textPrimary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      child: Row(
        children: [
          _ShiftColumn(label: 'Day', count: counts.day),
          _ShiftColumn(label: 'Afternoon', count: counts.afternoon),
          _ShiftColumn(label: 'Night', count: counts.night),
        ],
      ),
    );
  }
}

class _ShiftColumn extends StatelessWidget {
  const _ShiftColumn({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Expanded(
      child: Column(
        children: [
          Text(
            '$count',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _OnBreakCard extends StatelessWidget {
  const _OnBreakCard({required this.people, this.onOpen});

  final List<TransportOnBreakPerson> people;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final now = DateTime.now();
    return _SectionCard(
      title: 'On break now',
      onTap: onOpen,
      semanticsLabel: 'View live breaks',
      trailing: Text(
        '${people.length}',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: colors.textPrimary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      child: people.isEmpty
          ? Text(
              'Nobody on break right now',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.textSecondary,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final person in people.take(8))
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            person.name,
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: colors.textPrimary,
                                ),
                          ),
                        ),
                        Text(
                          _minutesLeftLabel(person.minutesLeft(now)),
                          style: Theme.of(context).textTheme.labelMedium
                              ?.copyWith(
                                color: colors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      ],
                    ),
                  ),
                if (people.length > 8)
                  Text(
                    '+${people.length - 8} more',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.textTertiary,
                    ),
                  ),
              ],
            ),
    );
  }

  static String _minutesLeftLabel(int minutes) {
    if (minutes <= 0) return 'Ending…';
    if (minutes == 1) return '1 min left';
    return '$minutes min left';
  }
}

class _RemovedCard extends StatelessWidget {
  const _RemovedCard({required this.people});

  final List<TransportPersonRow> people;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return _SectionCard(
      title: 'Removed from rota',
      trailing: Text(
        '${people.length}',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: colors.textPrimary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      child: people.isEmpty
          ? Text(
              'No removals today',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.textSecondary,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final person in people)
                  _PersonNoteRow(
                    name: person.name,
                    status: transportAbsenceLabel(person.status ?? ''),
                    note: person.note,
                  ),
              ],
            ),
    );
  }
}

class _PersonNoteRow extends StatelessWidget {
  const _PersonNoteRow({
    required this.name,
    required this.status,
    this.note,
  });

  final String name;
  final String status;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: colors.textPrimary,
                  ),
                ),
              ),
              Text(
                status,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          if (note != null && note!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Text(
                note!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
