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

/// Read-only day rota: Day / Afternoon / Night with present vs absent.
class TransportRotaScreen extends StatefulWidget {
  const TransportRotaScreen({
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
  State<TransportRotaScreen> createState() => _TransportRotaScreenState();
}

class _TransportRotaScreenState extends State<TransportRotaScreen> {
  late final TransportDashboardRepository _repository;
  late final String _dateYmd;

  List<TransportStaffedLocation> _locations = const [];
  String? _location;
  TransportDayRotaSnapshot? _snapshot;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _dateYmd = transportEffectiveTodayYmd();
    _repository =
        widget.dashboardRepository ??
        TransportDashboardRepository(Supabase.instance.client);
    _initialise();
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
        AppToast.error(context, 'Could not load rota.');
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _load({bool silent = false}) async {
    final location = _location;
    if (location == null) return;
    if (!silent) setState(() => _loading = true);
    try {
      final snapshot = await _repository.loadDayRota(
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
          AppToast.error(context, 'Could not load rota.');
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
            if (_loading && _snapshot == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_snapshot != null) ...[
              for (final shift in const ['day', 'afternoon', 'night']) ...[
                _ShiftCard(
                  shift: shift,
                  people: _snapshot!.staff(shift),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ],
          ],
        ],
      ),
    );

    if (widget.embedded) return body;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: AppBar(title: const Text('Rota')),
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

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({required this.shift, required this.people});

  final String shift;
  final List<TransportDayRotaPerson> people;

  String get _title {
    switch (shift) {
      case 'afternoon':
        return 'Afternoon';
      case 'night':
        return 'Night';
      default:
        return 'Day';
    }
  }

  List<TransportDayRotaPerson> get _ordered {
    final copy = List<TransportDayRotaPerson>.of(people);
    copy.sort((a, b) {
      final byAbsent = (a.isAbsent ? 1 : 0).compareTo(b.isAbsent ? 1 : 0);
      if (byAbsent != 0) return byAbsent;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return copy;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final present = people.where((p) => !p.isAbsent).length;
    final absent = people.where((p) => p.isAbsent).length;
    final ordered = _ordered;

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
                  _title,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: colors.textPrimary,
                  ),
                ),
              ),
              Text(
                '$present',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: colors.textPrimary,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              if (absent > 0) ...[
                const SizedBox(width: AppSpacing.sm),
                Text(
                  '$absent absent',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
          if (people.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                'Nobody scheduled',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            )
          else ...[
            const SizedBox(height: AppSpacing.sm),
            for (var i = 0; i < ordered.length; i++)
              _PersonRow(
                person: ordered[i],
                isLast: i == ordered.length - 1,
              ),
          ],
        ],
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person, required this.isLast});

  final TransportDayRotaPerson person;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final status = person.isAbsent
        ? transportAbsenceLabel(person.attendance ?? '')
        : null;

    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  person.name,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: person.isAbsent
                        ? colors.textSecondary
                        : colors.textPrimary,
                  ),
                ),
              ),
              if (status != null)
                Text(
                  status,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          if (person.note != null && person.note!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xxs),
              child: Text(
                person.note!,
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
