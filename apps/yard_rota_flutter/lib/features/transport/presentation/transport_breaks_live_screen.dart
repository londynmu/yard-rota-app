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
import '../domain/tm_break_now.dart';
import '../domain/transport_dashboard_models.dart';

/// Live breaks board: current slot + next slot. Read-only.
class TransportBreaksLiveScreen extends StatefulWidget {
  const TransportBreaksLiveScreen({
    super.key,
    required this.session,
    this.dashboardRepository,
    this.embedded = false,
    this.bottomPadding = AppSpacing.xl,
  });

  final UserSession session;
  final TransportDashboardRepository? dashboardRepository;
  final bool embedded;
  final double bottomPadding;

  @override
  State<TransportBreaksLiveScreen> createState() =>
      _TransportBreaksLiveScreenState();
}

class _TransportBreaksLiveScreenState extends State<TransportBreaksLiveScreen> {
  late final TransportDashboardRepository _repository;
  late final String _dateYmd;

  List<TransportStaffedLocation> _locations = const [];
  String? _location;
  List<TransportOnBreakPerson> _now = const [];
  List<TransportOnBreakPerson> _upcoming = const [];
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _dateYmd = transportEffectiveTodayYmd();
    _repository =
        widget.dashboardRepository ??
        TransportDashboardRepository(Supabase.instance.client);
    _initialise();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_location != null) _load(silent: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
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
        await _load();
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
        AppToast.error(context, 'Could not load breaks.');
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _load({bool silent = false}) async {
    final location = _location;
    if (location == null) return;
    if (!silent) setState(() => _loading = true);
    try {
      final board = await _repository.loadLiveBreaks(
        session: widget.session,
        location: location,
      );
      if (!mounted) return;
      setState(() {
        _now = board.now;
        _upcoming = board.upcoming;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        if (!silent) {
          AppToast.error(context, 'Could not load breaks.');
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
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final clockNow = DateTime.now();
    final board = tmBuildLiveBreakBoardView(now: _now, upcoming: _upcoming);

    final body = RefreshIndicator(
      onRefresh: () => _load(),
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.md,
          AppSpacing.sm,
          AppSpacing.md,
          widget.bottomPadding,
        ),
        children: [
          Text(
            'Live board',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: colors.textPrimary,
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
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final location in _locations)
                    Padding(
                      padding: const EdgeInsets.only(right: AppSpacing.xs),
                      child: ChoiceChip(
                        label: Text(
                          location.name,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: location.name == _location
                                ? colors.textPrimary
                                : colors.textSecondary,
                          ),
                        ),
                        selected: location.name == _location,
                        onSelected: (_) => _selectLocation(location.name),
                        selectedColor: colors.bgTertiary,
                        backgroundColor: colors.bgElevated,
                        side: BorderSide(color: colors.borderSubtle),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (_loading && _now.isEmpty && _upcoming.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              )
            else ...[
              if (board.current != null)
                _SlotCard(
                  slot: board.current!,
                  now: clockNow,
                  showMinutesLeft: true,
                )
              else
                AppCard(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  surfaceOpacity: AppOpacity.subtle,
                  borderColor: colors.borderSubtle,
                  child: Text(
                    'Nobody on break right now',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
              if (board.next != null) ...[
                const SizedBox(height: AppSpacing.sm),
                _SlotCard(
                  slot: board.next!,
                  now: clockNow,
                  showMinutesLeft: false,
                ),
              ] else if (board.current == null) ...[
                const SizedBox(height: AppSpacing.sm),
                AppCard(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  surfaceOpacity: AppOpacity.subtle,
                  borderColor: colors.borderSubtle,
                  child: Text(
                    'No breaks in the next 2 hours',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
              ],
            ],
          ],
        ],
      ),
    );

    if (widget.embedded) return body;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: AppBar(title: const Text('Breaks')),
      body: body,
    );
  }
}

class _SlotCard extends StatelessWidget {
  const _SlotCard({
    required this.slot,
    required this.now,
    required this.showMinutesLeft,
  });

  final TmBreakSlotGroup slot;
  final DateTime now;
  final bool showMinutesLeft;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final timeRange = tmBreakSlotTimeRange(slot.start, slot.end);
    final trailing = showMinutesLeft
        ? tmBreakSlotMinutesLeftLabel(slot.end, now)
        : null;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      surfaceOpacity: AppOpacity.subtle,
      borderColor: colors.borderSubtle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  timeRange,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: colors.textPrimary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Text(
                  trailing,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final person in slot.people)
            _DriverSlotRow(name: person.name),
        ],
      ),
    );
  }
}

class _DriverSlotRow extends StatelessWidget {
  const _DriverSlotRow({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Text(
        name,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: colors.textPrimary,
        ),
      ),
    );
  }
}