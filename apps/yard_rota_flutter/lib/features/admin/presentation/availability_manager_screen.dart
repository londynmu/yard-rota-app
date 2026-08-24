import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';

class AvailabilityManagerScreen extends StatefulWidget {
  const AvailabilityManagerScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageTwoRepository repository;
  final UserSession session;

  @override
  State<AvailabilityManagerScreen> createState() =>
      _AvailabilityManagerScreenState();
}

class _AvailabilityManagerScreenState extends State<AvailabilityManagerScreen> {
  DateTime _week = stageTwoWeekStart(DateTime.now());
  List<StaffProfile> _users = const [];
  Map<String, Map<String, AdminAvailability>> _availability = const {};
  String _query = '';
  String _shift = 'all';
  bool _loading = true;

  List<DateTime> get _days =>
      List.generate(7, (index) => _week.add(Duration(days: index)));

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final values = await Future.wait([
        widget.repository.loadUsers(widget.session),
        widget.repository.loadAvailabilityWeek(
          session: widget.session,
          weekStartYmd: stageTwoYmd(_week),
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _users = values[0] as List<StaffProfile>;
        _availability =
            values[1] as Map<String, Map<String, AdminAvailability>>;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load availability.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = _query.toLowerCase();
    final users =
        _users
            .where(
              (user) =>
                  (_shift == 'all' || user.shift == _shift) &&
                  user.displayName.toLowerCase().contains(query),
            )
            .toList()
          ..sort((a, b) => a.displayName.compareTo(b.displayName));
    return Scaffold(
      appBar: AppBar(title: const Text('Availability')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      tooltip: 'Previous week',
                      onPressed: () {
                        setState(
                          () => _week = _week.subtract(const Duration(days: 7)),
                        );
                        _load();
                      },
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text(
                      '${stageTwoYmd(_week)} — ${stageTwoYmd(_week.add(const Duration(days: 6)))}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    IconButton(
                      tooltip: 'Next week',
                      onPressed: () {
                        setState(
                          () => _week = _week.add(const Duration(days: 7)),
                        );
                        _load();
                      },
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                AppTextField(
                  label: 'Search users',
                  onChanged: (value) => setState(() => _query = value),
                ),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: _shift,
                  decoration: const InputDecoration(labelText: 'Shift'),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('All shifts')),
                    DropdownMenuItem(value: 'day', child: Text('Day')),
                    DropdownMenuItem(
                      value: 'afternoon',
                      child: Text('Afternoon'),
                    ),
                    DropdownMenuItem(value: 'night', child: Text('Night')),
                  ],
                  onChanged: (value) => setState(() => _shift = value ?? 'all'),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SingleChildScrollView(
                      child: DataTable(
                        columns: [
                          const DataColumn(label: Text('User')),
                          for (final day in _days)
                            DataColumn(
                              label: Text(
                                '${_weekday(day.weekday)}\n${day.day}',
                                textAlign: TextAlign.center,
                              ),
                            ),
                        ],
                        rows: users
                            .map(
                              (user) => DataRow(
                                cells: [
                                  DataCell(
                                    SizedBox(
                                      width: 130,
                                      child: Text(
                                        user.displayName,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ),
                                  for (final day in _days)
                                    DataCell(
                                      _AvailabilityDot(
                                        item:
                                            _availability[user.id]?[stageTwoYmd(
                                              day,
                                            )],
                                        onTap: () => _edit(user, day),
                                      ),
                                    ),
                                ],
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  String _weekday(int weekday) =>
      const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];

  Future<void> _edit(StaffProfile user, DateTime date) async {
    final current = _availability[user.id]?[stageTwoYmd(date)];
    final result = await showDialog<(AvailabilityStatus, String)>(
      context: context,
      builder: (_) =>
          _AvailabilityDialog(user: user, date: date, current: current),
    );
    if (result == null) return;
    try {
      await widget.repository.saveUserAvailability(
        session: widget.session,
        userId: user.id,
        dateYmd: stageTwoYmd(date),
        status: result.$1,
        comment: result.$2,
      );
      if (mounted) AppToast.show(context, 'Availability updated.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not update availability.');
    }
  }
}

class _AvailabilityDot extends StatelessWidget {
  const _AvailabilityDot({required this.item, required this.onTap});
  final AdminAvailability? item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final color = switch (item?.status) {
      AvailabilityStatus.available => colors.success,
      AvailabilityStatus.unavailable => colors.danger,
      AvailabilityStatus.holiday => colors.info,
      null => colors.bgTertiary,
    };
    return IconButton(
      tooltip: item?.comment ?? 'Set availability',
      onPressed: onTap,
      icon: Icon(
        item == null ? Icons.add_circle_outline : Icons.circle,
        color: color,
      ),
    );
  }
}

class _AvailabilityDialog extends StatefulWidget {
  const _AvailabilityDialog({
    required this.user,
    required this.date,
    required this.current,
  });

  final StaffProfile user;
  final DateTime date;
  final AdminAvailability? current;

  @override
  State<_AvailabilityDialog> createState() => _AvailabilityDialogState();
}

class _AvailabilityDialogState extends State<_AvailabilityDialog> {
  late AvailabilityStatus _status;
  late final TextEditingController _comment;

  @override
  void initState() {
    super.initState();
    _status = widget.current?.status ?? AvailabilityStatus.available;
    _comment = TextEditingController(text: widget.current?.comment);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('${widget.user.displayName} · ${stageTwoYmd(widget.date)}'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        DropdownButtonFormField<AvailabilityStatus>(
          initialValue: _status,
          decoration: const InputDecoration(labelText: 'Status'),
          items: AvailabilityStatus.values
              .map(
                (status) => DropdownMenuItem(
                  value: status,
                  child: Text(status.dbValue),
                ),
              )
              .toList(),
          onChanged: (value) => setState(() => _status = value ?? _status),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(controller: _comment, label: 'Comment', maxLines: 3),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      OutlinedButton(
        onPressed: () => Navigator.pop(context, (_status, _comment.text)),
        child: const Text('Save'),
      ),
    ],
  );
}
