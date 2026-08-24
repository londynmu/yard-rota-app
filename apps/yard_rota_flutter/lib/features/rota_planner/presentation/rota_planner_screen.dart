import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';

class RotaPlannerScreen extends StatefulWidget {
  const RotaPlannerScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageTwoRepository repository;
  final UserSession session;

  @override
  State<RotaPlannerScreen> createState() => _RotaPlannerScreenState();
}

class _RotaPlannerScreenState extends State<RotaPlannerScreen> {
  DateTime _date = DateTime.now();
  bool _weekView = false;
  String? _location;
  List<LocationOption> _locations = const [];
  List<RotaSlot> _slots = const [];
  List<StaffProfile> _users = const [];
  Map<String, Map<String, AdminAvailability>> _availability = const {};
  bool _loading = true;

  DateTime get _rangeStart => _weekView ? stageTwoWeekStart(_date) : _date;
  DateTime get _rangeEnd =>
      _weekView ? _rangeStart.add(const Duration(days: 6)) : _date;

  @override
  void initState() {
    super.initState();
    _initialise();
  }

  Future<void> _initialise() async {
    try {
      widget.repository.requireAdmin(widget.session);
      final values = await Future.wait([
        widget.repository.loadLocations(),
        widget.repository.loadUsers(widget.session),
      ]);
      final locations = values[0] as List<LocationOption>;
      if (!mounted) return;
      setState(() {
        _locations = locations;
        _users = values[1] as List<StaffProfile>;
        _location = locations.isEmpty ? null : locations.first.name;
      });
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not open Rota Planner.');
      setState(() => _loading = false);
    }
  }

  Future<void> _load() async {
    if (_location == null) return;
    setState(() => _loading = true);
    try {
      final values = await Future.wait([
        widget.repository.loadRota(
          session: widget.session,
          startYmd: stageTwoYmd(_rangeStart),
          endYmd: stageTwoYmd(_rangeEnd),
          location: _location!,
        ),
        widget.repository.loadAvailabilityWeek(
          session: widget.session,
          weekStartYmd: stageTwoYmd(stageTwoWeekStart(_date)),
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _slots = values[0] as List<RotaSlot>;
        _availability =
            values[1] as Map<String, Map<String, AdminAvailability>>;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load the rota.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grouped = <String, List<RotaSlot>>{};
    for (final slot in _slots) {
      grouped.putIfAbsent(slot.dateYmd, () => []).add(slot);
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Rota Planner'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Export and templates',
            onSelected: _action,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'csv', child: Text('Share CSV')),
              PopupMenuItem(value: 'pdf', child: Text('Share PDF / Email')),
              PopupMenuItem(
                value: 'saveTemplate',
                child: Text('Save template'),
              ),
              PopupMenuItem(
                value: 'applyTemplate',
                child: Text('Apply template'),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _editSlot(),
        icon: const Icon(Icons.add),
        label: const Text('Add slot'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.xxl * 2,
          ),
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Day')),
                ButtonSegment(value: true, label: Text('Week')),
              ],
              selected: {_weekView},
              onSelectionChanged: (value) {
                setState(() => _weekView = value.first);
                _load();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous',
                  onPressed: () {
                    setState(
                      () => _date = _date.subtract(
                        Duration(days: _weekView ? 7 : 1),
                      ),
                    );
                    _load();
                  },
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _pickDate,
                    child: Text(
                      _weekView
                          ? '${stageTwoYmd(_rangeStart)} — ${stageTwoYmd(_rangeEnd)}'
                          : stageTwoYmd(_date),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Next',
                  onPressed: () {
                    setState(
                      () =>
                          _date = _date.add(Duration(days: _weekView ? 7 : 1)),
                    );
                    _load();
                  },
                  icon: const Icon(Icons.chevron_right),
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
              onChanged: (value) {
                setState(() => _location = value);
                _load();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              onPressed: _copyPrevious,
              icon: const Icon(Icons.content_copy_outlined),
              label: Text(
                _weekView ? 'Copy previous week' : 'Copy previous day',
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_slots.isEmpty)
              const AppCard(child: Text('No rota slots in this period.'))
            else
              for (final date in grouped.keys.toList()..sort())
                _RotaDay(
                  dateYmd: date,
                  slots: grouped[date]!,
                  onEdit: (slot) => _editSlot(slot),
                  onDelete: _deleteSlot,
                  onAssign: _assign,
                  onUnassign: _unassign,
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final value = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (value == null) return;
    setState(() => _date = value);
    await _load();
  }

  Future<void> _editSlot([RotaSlot? slot]) async {
    final result = await showDialog<RotaSlotDraft>(
      context: context,
      builder: (_) => _RotaSlotDialog(
        slot: slot,
        dateYmd: slot?.dateYmd ?? stageTwoYmd(_date),
        location: slot?.location ?? _location ?? '',
      ),
    );
    if (result == null) return;
    try {
      if (slot == null) {
        await widget.repository.createRotaSlot(widget.session, result);
      } else {
        await widget.repository.updateRotaSlot(
          session: widget.session,
          original: slot,
          draft: result,
        );
      }
      if (mounted) AppToast.show(context, 'Rota slot saved.');
      await _load();
    } catch (error) {
      if (mounted) AppToast.show(context, 'Could not save rota slot.');
    }
  }

  Future<void> _deleteSlot(RotaSlot slot) async {
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Delete rota slot'),
            content: const Text('Delete this slot and all assignments?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              OutlinedButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;
    await widget.repository.deleteRotaSlot(widget.session, slot);
    if (mounted) AppToast.show(context, 'Rota slot deleted.');
    await _load();
  }

  Future<void> _assign(RotaSlot slot) async {
    final assigned = slot.assignments.map((item) => item.userId).toSet();
    final candidates = _users
        .where((user) => !assigned.contains(user.id))
        .toList();
    final selection = await showModalBottomSheet<(StaffProfile, String)>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _StaffAssignmentSheet(
        slot: slot,
        candidates: candidates,
        availability: _availability,
      ),
    );
    if (selection == null) return;
    try {
      await widget.repository.assignRotaStaff(
        session: widget.session,
        slot: slot,
        userId: selection.$1.id,
        task: selection.$2,
      );
      if (mounted) AppToast.show(context, 'Staff member assigned.');
      await _load();
    } catch (error) {
      if (mounted) AppToast.show(context, error.toString());
    }
  }

  Future<void> _unassign(RotaAssignment assignment) async {
    await widget.repository.unassignRotaStaff(
      session: widget.session,
      assignmentRowId: assignment.rowId,
    );
    if (mounted) AppToast.show(context, 'Staff member unassigned.');
    await _load();
  }

  Future<void> _copyPrevious() async {
    try {
      await widget.repository.copyPrevious(
        session: widget.session,
        targetStart: _rangeStart,
        week: _weekView,
        location: _location!,
      );
      if (mounted) AppToast.show(context, 'Previous schedule copied.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not copy schedule.');
    }
  }

  Future<void> _action(String action) async {
    if (action == 'csv') return _shareCsv();
    if (action == 'pdf') return _sharePdf();
    if (action == 'saveTemplate') return _saveTemplate();
    if (action == 'applyTemplate') return _applyTemplate();
  }

  String _csv() {
    final buffer = StringBuffer(
      'Date,Shift,Location,Start,End,Capacity,Staff,Task\n',
    );
    for (final slot in _slots) {
      if (slot.assignments.isEmpty) {
        buffer.writeln(
          '${slot.dateYmd},${slot.shift},${slot.location},${slot.startTime},${slot.endTime},${slot.capacity},,',
        );
      }
      for (final assignment in slot.assignments) {
        String clean(String value) => '"${value.replaceAll('"', '""')}"';
        buffer.writeln(
          '${slot.dateYmd},${slot.shift},${clean(slot.location)},${slot.startTime},${slot.endTime},${slot.capacity},${clean(assignment.name)},${clean(assignment.task ?? '')}',
        );
      }
    }
    return buffer.toString();
  }

  Future<void> _shareCsv() async {
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}/rota-${stageTwoYmd(_rangeStart)}.csv');
    await file.writeAsString(_csv());
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'text/csv')],
        subject: 'Yard rota ${stageTwoYmd(_rangeStart)}',
      ),
    );
  }

  Future<void> _sharePdf() async {
    final document = pw.Document();
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4.landscape,
        build: (_) => [
          pw.Header(level: 0, text: 'Yard Rota · ${_location ?? ''}'),
          pw.TableHelper.fromTextArray(
            headers: const ['Date', 'Shift', 'Time', 'Staff', 'Task'],
            data: [
              for (final slot in _slots)
                if (slot.assignments.isEmpty)
                  [
                    slot.dateYmd,
                    slot.shift,
                    '${slot.startTime}-${slot.endTime}',
                    'Unassigned',
                    '',
                  ]
                else
                  for (final person in slot.assignments)
                    [
                      slot.dateYmd,
                      slot.shift,
                      '${slot.startTime}-${slot.endTime}',
                      person.name,
                      person.task ?? '',
                    ],
            ],
          ),
        ],
      ),
    );
    await Printing.sharePdf(
      bytes: await document.save(),
      filename: 'rota-${stageTwoYmd(_rangeStart)}.pdf',
    );
  }

  Future<void> _saveTemplate() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Save rota template'),
        content: AppTextField(controller: controller, label: 'Template name'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          OutlinedButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.trim().isEmpty) return;
    await widget.repository.saveTemplate(
      session: widget.session,
      name: name,
      slots: _slots,
    );
    if (mounted) AppToast.show(context, 'Template saved.');
  }

  Future<void> _applyTemplate() async {
    final templates = await widget.repository.loadTemplates(widget.session);
    if (!mounted) return;
    final selected = await showDialog<RotaTemplate>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Apply template'),
        children: templates
            .map(
              (template) => SimpleDialogOption(
                onPressed: () => Navigator.pop(context, template),
                child: Text(template.name),
              ),
            )
            .toList(),
      ),
    );
    if (selected == null) return;
    await widget.repository.applyTemplate(
      session: widget.session,
      template: selected,
      dateYmd: stageTwoYmd(_date),
      location: _location!,
    );
    if (mounted) AppToast.show(context, 'Template applied.');
    await _load();
  }
}

class _RotaDay extends StatelessWidget {
  const _RotaDay({
    required this.dateYmd,
    required this.slots,
    required this.onEdit,
    required this.onDelete,
    required this.onAssign,
    required this.onUnassign,
  });

  final String dateYmd;
  final List<RotaSlot> slots;
  final ValueChanged<RotaSlot> onEdit;
  final ValueChanged<RotaSlot> onDelete;
  final ValueChanged<RotaSlot> onAssign;
  final ValueChanged<RotaAssignment> onUnassign;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Text(
          dateYmd,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      for (final slot in slots)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${slot.shift} · ${slot.startTime}–${slot.endTime}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Edit slot',
                      onPressed: () => onEdit(slot),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                    IconButton(
                      tooltip: 'Delete slot',
                      onPressed: () => onDelete(slot),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
                Text(
                  '${slot.assignments.length}/${slot.capacity} assigned · ${slot.location}',
                ),
                for (final assignment in slot.assignments)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(assignment.name),
                    subtitle: assignment.task == null
                        ? null
                        : Text(assignment.task!),
                    trailing: IconButton(
                      tooltip: 'Unassign',
                      onPressed: () => onUnassign(assignment),
                      icon: const Icon(Icons.person_remove_outlined),
                    ),
                  ),
                OutlinedButton.icon(
                  onPressed: slot.assignments.length >= slot.capacity
                      ? null
                      : () => onAssign(slot),
                  icon: const Icon(Icons.person_add_alt),
                  label: const Text('Assign staff'),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}

class _RotaSlotDialog extends StatefulWidget {
  const _RotaSlotDialog({
    required this.slot,
    required this.dateYmd,
    required this.location,
  });
  final RotaSlot? slot;
  final String dateYmd;
  final String location;

  @override
  State<_RotaSlotDialog> createState() => _RotaSlotDialogState();
}

class _RotaSlotDialogState extends State<_RotaSlotDialog> {
  late final TextEditingController _date;
  late final TextEditingController _location;
  late final TextEditingController _start;
  late final TextEditingController _end;
  late final TextEditingController _capacity;
  late String _shift;

  @override
  void initState() {
    super.initState();
    final slot = widget.slot;
    _date = TextEditingController(text: slot?.dateYmd ?? widget.dateYmd);
    _location = TextEditingController(text: slot?.location ?? widget.location);
    _start = TextEditingController(text: slot?.startTime ?? '05:45');
    _end = TextEditingController(text: slot?.endTime ?? '18:00');
    _capacity = TextEditingController(text: '${slot?.capacity ?? 1}');
    _shift = slot?.shift ?? 'day';
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.slot == null ? 'Add rota slot' : 'Edit rota slot'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppTextField(controller: _date, label: 'Date (YYYY-MM-DD)'),
          const SizedBox(height: AppSpacing.sm),
          DropdownButtonFormField<String>(
            initialValue: _shift,
            decoration: const InputDecoration(labelText: 'Shift'),
            items: const [
              DropdownMenuItem(value: 'day', child: Text('Day')),
              DropdownMenuItem(value: 'afternoon', child: Text('Afternoon')),
              DropdownMenuItem(value: 'night', child: Text('Night')),
            ],
            onChanged: (value) => setState(() => _shift = value ?? _shift),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(controller: _location, label: 'Location'),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(controller: _start, label: 'Start time'),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(controller: _end, label: 'End time'),
          const SizedBox(height: AppSpacing.sm),
          AppTextField(
            controller: _capacity,
            label: 'Capacity',
            keyboardType: TextInputType.number,
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      OutlinedButton(
        onPressed: () => Navigator.pop(
          context,
          RotaSlotDraft(
            dateYmd: _date.text,
            shift: _shift,
            location: _location.text,
            startTime: _start.text,
            endTime: _end.text,
            capacity: int.tryParse(_capacity.text) ?? 1,
          ),
        ),
        child: const Text('Save'),
      ),
    ],
  );
}

class _StaffAssignmentSheet extends StatefulWidget {
  const _StaffAssignmentSheet({
    required this.slot,
    required this.candidates,
    required this.availability,
  });
  final RotaSlot slot;
  final List<StaffProfile> candidates;
  final Map<String, Map<String, AdminAvailability>> availability;

  @override
  State<_StaffAssignmentSheet> createState() => _StaffAssignmentSheetState();
}

class _StaffAssignmentSheetState extends State<_StaffAssignmentSheet> {
  final _task = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final available = <StaffProfile>[];
    final otherShift = <StaffProfile>[];
    final otherLocation = <StaffProfile>[];
    for (final user in widget.candidates) {
      final status = widget.availability[user.id]?[widget.slot.dateYmd];
      if (status?.status == AvailabilityStatus.unavailable ||
          status?.status == AvailabilityStatus.holiday) {
        continue;
      }
      if (user.preferredLocation != null &&
          user.preferredLocation != widget.slot.location) {
        otherLocation.add(user);
      } else if (user.shift != widget.slot.shift) {
        otherShift.add(user);
      } else {
        available.add(user);
      }
    }
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.lg,
          right: AppSpacing.lg,
          top: AppSpacing.lg,
          bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.75,
          child: Column(
            children: [
              AppTextField(controller: _task, label: 'Task (optional)'),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: ListView(
                  children: [
                    _group('Available', available),
                    _group('Other shifts', otherShift),
                    _group('Other locations', otherLocation),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _group(String label, List<StaffProfile> users) => ExpansionTile(
    initiallyExpanded: label == 'Available',
    title: Text('$label (${users.length})'),
    children: users
        .map(
          (user) => ListTile(
            title: Text(user.displayName),
            subtitle: Text(
              [
                user.shift,
                user.preferredLocation,
                widget.availability[user.id]?[widget.slot.dateYmd]?.comment,
              ].whereType<String>().join(' · '),
            ),
            onTap: () => Navigator.pop(context, (user, _task.text)),
          ),
        )
        .toList(),
  );
}
