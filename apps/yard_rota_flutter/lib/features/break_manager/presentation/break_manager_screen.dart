import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';

class BreakManagerScreen extends StatefulWidget {
  const BreakManagerScreen({
    super.key,
    required this.repository,
    required this.session,
  });

  final StageTwoRepository repository;
  final UserSession session;

  @override
  State<BreakManagerScreen> createState() => _BreakManagerScreenState();
}

class _BreakManagerScreenState extends State<BreakManagerScreen> {
  final _captureKey = GlobalKey();
  DateTime _date = DateTime.now();
  String? _location;
  String _shift = 'day';
  List<LocationOption> _locations = const [];
  List<BreakSlot> _slots = const [];
  List<StaffProfile> _users = const [];
  List<RotaSlot> _rota = const [];
  Map<String, String?> _attendance = const {};
  bool _loading = true;

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
      if (mounted) AppToast.show(context, 'Could not open Break Manager.');
      setState(() => _loading = false);
    }
  }

  Future<void> _load() async {
    if (_location == null) return;
    setState(() => _loading = true);
    final date = stageTwoYmd(_date);
    try {
      final values = await Future.wait([
        widget.repository.loadBreakSlots(
          session: widget.session,
          dateYmd: date,
          location: _location!,
          shift: _shift,
        ),
        widget.repository.loadRota(
          session: widget.session,
          startYmd: date,
          endYmd: date,
          location: _location!,
        ),
      ]);
      final rota = (values[1] as List<RotaSlot>)
          .where((slot) => slot.shift == _shift)
          .toList();
      final userIds = rota
          .expand((slot) => slot.assignments)
          .map((item) => item.userId)
          .toSet();
      final attendance = await widget.repository.loadAttendanceForUsers(
        session: widget.session,
        dateYmd: date,
        userIds: userIds,
      );
      if (!mounted) return;
      setState(() {
        _slots = values[0] as List<BreakSlot>;
        _rota = rota;
        _attendance = attendance;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load break schedule.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.session.isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Break Manager')),
        body: const Center(child: Text('Administrative privileges required.')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Break Manager'),
        actions: [
          IconButton(
            tooltip: 'Share image',
            onPressed: _shareImage,
            icon: const Icon(Icons.ios_share_outlined),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _editSlot(),
        icon: const Icon(Icons.add),
        label: const Text('Custom slot'),
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
            OutlinedButton.icon(
              onPressed: _pickDate,
              icon: const Icon(Icons.calendar_today_outlined),
              label: Text(stageTwoYmd(_date)),
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
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'day', label: Text('Day')),
                ButtonSegment(value: 'afternoon', label: Text('Afternoon')),
                ButtonSegment(value: 'night', label: Text('Night')),
              ],
              selected: {_shift},
              onSelectionChanged: (value) {
                setState(() => _shift = value.first);
                _load();
              },
            ),
            const SizedBox(height: AppSpacing.sm),
            OutlinedButton.icon(
              onPressed: _addStandardSlots,
              icon: const Icon(Icons.auto_awesome_outlined),
              label: const Text('Add standard slots'),
            ),
            const SizedBox(height: AppSpacing.lg),
            RepaintBoundary(
              key: _captureKey,
              child: ColoredBox(
                color: Theme.of(context).scaffoldBackgroundColor,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.xs),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        '${stageTwoYmd(_date)} · ${_location ?? ''} · $_shift',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      if (_loading)
                        const Center(child: CircularProgressIndicator())
                      else if (_slots.isEmpty)
                        const AppCard(child: Text('No break slots.'))
                      else
                        for (final slot in _slots)
                          Padding(
                            padding: const EdgeInsets.only(
                              bottom: AppSpacing.sm,
                            ),
                            child: _BreakSlotCard(
                              slot: slot,
                              onEdit: () => _editSlot(slot),
                              onDelete: () => _delete(slot),
                              onAssign: () => _assign(slot),
                              onUnassign: _unassign,
                            ),
                          ),
                    ],
                  ),
                ),
              ),
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

  Future<void> _editSlot([BreakSlot? slot]) async {
    final draft = await showDialog<BreakSlotDraft>(
      context: context,
      builder: (_) => _BreakSlotDialog(
        slot: slot,
        dateYmd: stageTwoYmd(_date),
        shift: _shift,
        location: _location ?? '',
      ),
    );
    if (draft == null) return;
    try {
      if (slot == null) {
        await widget.repository.createBreakSlot(widget.session, draft);
      } else {
        await widget.repository.updateBreakSlot(
          session: widget.session,
          original: slot,
          draft: draft,
        );
      }
      if (mounted) AppToast.show(context, 'Break slot saved.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not save break slot.');
    }
  }

  Future<void> _delete(BreakSlot slot) async {
    await widget.repository.deleteBreakSlot(widget.session, slot);
    if (mounted) AppToast.show(context, 'Break slot deleted.');
    await _load();
  }

  List<StaffProfile> get _scheduledStaff {
    final ids = _rota
        .expand((slot) => slot.assignments)
        .map((item) => item.userId)
        .toSet();
    return _users
        .where(
          (user) =>
              ids.contains(user.id) &&
              _attendance[user.id] == null &&
              user.isActive,
        )
        .toList();
  }

  Future<void> _assign(BreakSlot slot) async {
    final assigned = slot.assignments.map((item) => item.userId).toSet();
    final available = _scheduledStaff
        .where((user) => !assigned.contains(user.id))
        .toList();
    final selected = await showModalBottomSheet<StaffProfile>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          children: [
            const ListTile(
              title: Text(
                'Scheduled staff',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            for (final user in available)
              ListTile(
                title: Text(user.displayName),
                subtitle: Text(
                  '${user.shift} · ${user.preferredLocation ?? ''}',
                ),
                onTap: () => Navigator.pop(context, user),
              ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    try {
      await widget.repository.assignBreakStaff(
        session: widget.session,
        slot: slot,
        userId: selected.id,
      );
      if (mounted) AppToast.show(context, 'Break assigned.');
      await _load();
    } catch (error) {
      if (mounted) AppToast.show(context, error.toString());
    }
  }

  Future<void> _unassign(BreakAssignment assignment) async {
    await widget.repository.unassignBreakStaff(
      session: widget.session,
      assignmentRowId: assignment.rowId,
    );
    if (mounted) AppToast.show(context, 'Break unassigned.');
    await _load();
  }

  Future<void> _addStandardSlots() async {
    final standards = switch (_shift) {
      'day' => const [
        ('09:00', 15, 2, 'Break 1 (15 min)'),
        ('09:30', 15, 2, 'Break 1 (15 min)'),
        ('12:00', 45, 2, 'Break 2 (45 min)'),
        ('12:45', 45, 2, 'Break 2 (45 min)'),
      ],
      'afternoon' => const [
        ('18:00', 60, 2, 'Afternoon Break (60 min)'),
        ('19:00', 60, 2, 'Afternoon Break (60 min)'),
        ('20:00', 60, 2, 'Afternoon Break (60 min)'),
      ],
      _ => const [
        ('21:00', 60, 3, 'Night Break (60 min)'),
        ('22:00', 60, 3, 'Night Break (60 min)'),
        ('23:00', 60, 3, 'Night Break (60 min)'),
        ('00:00', 60, 3, 'Night Break (60 min)'),
        ('01:00', 60, 3, 'Night Break (60 min)'),
        ('02:00', 60, 3, 'Night Break (60 min)'),
      ],
    };
    final existing = _slots.map((slot) => slot.startTime).toSet();
    for (final item in standards.where((item) => !existing.contains(item.$1))) {
      await widget.repository.createBreakSlot(
        widget.session,
        BreakSlotDraft(
          dateYmd: stageTwoYmd(_date),
          shift: _shift,
          location: _location!,
          startTime: item.$1,
          durationMinutes: item.$2,
          capacity: item.$3,
          breakType: item.$4,
        ),
      );
    }
    if (mounted) AppToast.show(context, 'Standard slots added.');
    await _load();
  }

  Future<void> _shareImage() async {
    try {
      final boundary =
          _captureKey.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) throw StateError('Capture unavailable');
      final image = await boundary.toImage(pixelRatio: 2);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('Capture unavailable');
      final file = File(
        '${(await getTemporaryDirectory()).path}/breaks-${stageTwoYmd(_date)}.png',
      );
      await file.writeAsBytes(data.buffer.asUint8List());
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          subject: 'Break schedule ${stageTwoYmd(_date)}',
        ),
      );
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not share break image.');
    }
  }
}

class _BreakSlotCard extends StatelessWidget {
  const _BreakSlotCard({
    required this.slot,
    required this.onEdit,
    required this.onDelete,
    required this.onAssign,
    required this.onUnassign,
  });

  final BreakSlot slot;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onAssign;
  final ValueChanged<BreakAssignment> onUnassign;

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${slot.startTime} · ${slot.breakType}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(
              tooltip: 'Edit',
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: 'Delete',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        ),
        Text(
          '${slot.durationMinutes} min · ${slot.assignments.length}/${slot.capacity}',
        ),
        for (final assignment in slot.assignments)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(assignment.name),
            subtitle: assignment.attendance == null
                ? null
                : Text(assignment.attendance!.replaceAll('_', ' ')),
            trailing: IconButton(
              tooltip: 'Unassign',
              onPressed: () => onUnassign(assignment),
              icon: const Icon(Icons.person_remove_outlined),
            ),
          ),
        OutlinedButton.icon(
          onPressed: slot.assignments.length >= slot.capacity ? null : onAssign,
          icon: const Icon(Icons.person_add_alt),
          label: const Text('Assign staff'),
        ),
      ],
    ),
  );
}

class _BreakSlotDialog extends StatefulWidget {
  const _BreakSlotDialog({
    required this.slot,
    required this.dateYmd,
    required this.shift,
    required this.location,
  });
  final BreakSlot? slot;
  final String dateYmd;
  final String shift;
  final String location;

  @override
  State<_BreakSlotDialog> createState() => _BreakSlotDialogState();
}

class _BreakSlotDialogState extends State<_BreakSlotDialog> {
  late final TextEditingController _start;
  late final TextEditingController _duration;
  late final TextEditingController _capacity;
  late final TextEditingController _type;

  @override
  void initState() {
    super.initState();
    _start = TextEditingController(text: widget.slot?.startTime ?? '09:00');
    _duration = TextEditingController(
      text: '${widget.slot?.durationMinutes ?? 15}',
    );
    _capacity = TextEditingController(text: '${widget.slot?.capacity ?? 2}');
    _type = TextEditingController(
      text: widget.slot?.breakType ?? 'Custom break',
    );
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.slot == null ? 'Create break slot' : 'Edit break slot'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppTextField(controller: _start, label: 'Start time'),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: _duration,
          label: 'Duration (minutes)',
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: _capacity,
          label: 'Capacity',
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(controller: _type, label: 'Break type'),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      OutlinedButton(
        onPressed: () => Navigator.pop(
          context,
          BreakSlotDraft(
            dateYmd: widget.slot?.dateYmd ?? widget.dateYmd,
            shift: widget.slot?.shift ?? widget.shift,
            location: widget.slot?.location ?? widget.location,
            startTime: _start.text,
            durationMinutes: int.tryParse(_duration.text) ?? 15,
            breakType: _type.text,
            capacity: int.tryParse(_capacity.text) ?? 1,
          ),
        ),
        child: const Text('Save'),
      ),
    ],
  );
}
