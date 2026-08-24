import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';

class TransportDashboardScreen extends StatefulWidget {
  const TransportDashboardScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageTwoRepository repository;
  final UserSession session;

  @override
  State<TransportDashboardScreen> createState() =>
      _TransportDashboardScreenState();
}

class _TransportDashboardScreenState extends State<TransportDashboardScreen> {
  DateTime _date = DateTime.now();
  List<LocationOption> _locations = const [];
  String? _location;
  List<ManagerRotaEntry> _entries = const [];
  bool _loading = true;
  String? _expandedShift;

  @override
  void initState() {
    super.initState();
    _initialise();
  }

  Future<void> _initialise() async {
    try {
      widget.repository.requireTransportRead(widget.session);
      final locations = await widget.repository.loadLocations();
      final saved = (await SharedPreferences.getInstance()).getString(
        'tm_dashboard_location',
      );
      final location = locations.any((item) => item.name == saved)
          ? saved
          : (locations.isEmpty ? null : locations.first.name);
      if (!mounted) return;
      setState(() {
        _locations = locations;
        _location = location;
      });
      await _load();
    } catch (error) {
      if (mounted) AppToast.show(context, 'Could not load dashboard.');
      setState(() => _loading = false);
    }
  }

  Future<void> _load() async {
    if (_location == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final rows = await widget.repository.loadTransportWeek(
        session: widget.session,
        weekStartYmd: stageTwoYmd(stageTwoWeekStart(_date)),
        location: _location!,
      );
      if (mounted) setState(() => _entries = rows);
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load staffing data.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final summary = ManagerDaySummary(
      _entries
          .where((item) => item.dateYmd == stageTwoYmd(_date))
          .toList(growable: false),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Transport Dashboard')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.calendar_today_outlined),
                    label: Text(stageTwoYmd(_date)),
                    onPressed: _selectDate,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                OutlinedButton(
                  onPressed: () {
                    setState(() => _date = DateTime.now());
                    _load();
                  },
                  child: const Text('Today'),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            DropdownButtonFormField<String>(
              initialValue: _location,
              decoration: const InputDecoration(labelText: 'Location'),
              items: _locations
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.name,
                      child: Text(item.name),
                    ),
                  )
                  .toList(),
              onChanged: (value) async {
                if (value == null) return;
                setState(() => _location = value);
                (await SharedPreferences.getInstance()).setString(
                  'tm_dashboard_location',
                  value,
                );
                await _load();
              },
            ),
            const SizedBox(height: AppSpacing.lg),
            AppCard(
              child: Column(
                children: [
                  Text(
                    '${summary.headcount('day') + summary.headcount('afternoon') + summary.headcount('night')}',
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: colors.textPrimary,
                    ),
                  ),
                  const Text('Total shunters'),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else
              for (final shift in const ['day', 'afternoon', 'night'])
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _ShiftCard(
                    shift: shift,
                    summary: summary,
                    expanded: _expandedShift == shift,
                    onTap: () => setState(
                      () => _expandedShift = _expandedShift == shift
                          ? null
                          : shift,
                    ),
                  ),
                ),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Absence breakdown',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _AbsenceRow(
                    label: 'No show',
                    count: summary.absences('no_show'),
                  ),
                  _AbsenceRow(label: 'Sick', count: summary.absences('sick')),
                  _AbsenceRow(label: 'Late', count: summary.absences('late')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      _date = picked;
      _expandedShift = null;
    });
    await _load();
  }
}

class _ShiftCard extends StatelessWidget {
  const _ShiftCard({
    required this.shift,
    required this.summary,
    required this.expanded,
    required this.onTap,
  });

  final String shift;
  final ManagerDaySummary summary;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final staff = summary.staff(shift);
    return AppCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        initiallyExpanded: expanded,
        onExpansionChanged: (_) => onTap(),
        title: Text(
          '${shift[0].toUpperCase()}${shift.substring(1)}',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text('${summary.absences('no_show', shift: shift)} no show'),
        trailing: Text(
          '${summary.headcount(shift)}',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            color: colors.textPrimary,
            fontWeight: FontWeight.w800,
          ),
        ),
        children: staff.isEmpty
            ? const [ListTile(title: Text('No staff scheduled'))]
            : staff
                  .map(
                    (item) => ListTile(
                      dense: true,
                      title: Text(
                        item.name,
                        style: item.attendance == 'no_show'
                            ? TextStyle(
                                color: colors.danger,
                                fontWeight: FontWeight.w700,
                              )
                            : null,
                      ),
                      subtitle: item.attendance == null
                          ? null
                          : Text(item.attendance!.replaceAll('_', ' ')),
                    ),
                  )
                  .toList(),
      ),
    );
  }
}

class _AbsenceRow extends StatelessWidget {
  const _AbsenceRow({required this.label, required this.count});
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [Text(label), Text('$count')],
    ),
  );
}
