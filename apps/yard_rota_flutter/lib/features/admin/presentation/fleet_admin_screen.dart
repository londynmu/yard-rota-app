import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_three/domain/stage_three_models.dart';

class FleetAdminScreen extends StatefulWidget {
  const FleetAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<FleetAdminScreen> createState() => _FleetAdminScreenState();
}

class _FleetAdminScreenState extends State<FleetAdminScreen> {
  List<TugRecord> _tugs = const [];
  List<TugTablet> _tablets = const [];
  var _loading = true;
  var _tabletsTab = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await Future.wait([
        widget.repository.loadTugs(widget.session),
        widget.repository.loadTablets(widget.session),
      ]);
      if (!mounted) return;
      setState(() {
        _tugs = result[0] as List<TugRecord>;
        _tablets = result[1] as List<TugTablet>;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load fleet data.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tugs and tablets')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _tabletsTab ? () => _editTablet() : () => _editTug(),
        label: Text(_tabletsTab ? 'Add tablet' : 'Add tug'),
        icon: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Tugs')),
                ButtonSegment(value: true, label: Text('Tablets')),
              ],
              selected: {_tabletsTab},
              onSelectionChanged: (value) =>
                  setState(() => _tabletsTab = value.first),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        0,
                        AppSpacing.lg,
                        AppSpacing.giant,
                      ),
                      itemCount: _tabletsTab ? _tablets.length : _tugs.length,
                      itemBuilder: (_, index) => _tabletsTab
                          ? _tabletCard(_tablets[index])
                          : _tugCard(_tugs[index]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tugCard(TugRecord tug) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
    child: AppCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        title: Text(tug.label),
        subtitle: Text(
          '${tug.number} · ${tug.status}'
          '${tug.locationName == null ? '' : ' · ${tug.locationName}'}',
        ),
        leading: Icon(
          Icons.local_shipping_outlined,
          color: tug.status == 'active'
              ? context.appColors.success
              : context.appColors.warning,
        ),
        trailing: PopupMenuButton<String>(
          onSelected: (action) {
            if (action == 'edit') _editTug(tug);
            if (action == 'qr') _showQr(tug);
            if (action == 'regenerate') _regenerateQr(tug);
            if (action == 'delete') _deleteTug(tug);
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'qr', child: Text('Display QR')),
            PopupMenuItem(value: 'regenerate', child: Text('Regenerate QR')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
        ),
      ),
    ),
  );

  Widget _tabletCard(TugTablet tablet) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
    child: AppCard(
      padding: EdgeInsets.zero,
      child: ListTile(
        leading: const Icon(Icons.tablet_android_outlined),
        title: Text(tablet.serialNumber),
        subtitle: Text(tablet.tugLabel ?? 'Unknown tug'),
        trailing: PopupMenuButton<String>(
          onSelected: (action) {
            if (action == 'edit') _editTablet(tablet);
            if (action == 'delete') _deleteTablet(tablet);
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'edit', child: Text('Edit')),
            PopupMenuItem(value: 'delete', child: Text('Delete')),
          ],
        ),
      ),
    ),
  );

  Future<void> _editTug([TugRecord? tug]) async {
    final number = TextEditingController(text: tug?.number);
    final name = TextEditingController(text: tug?.displayName);
    var status = tug?.status ?? 'active';
    var location = tug?.locationId ?? '';
    final locations = await widget.repository.loadRows(
      widget.session,
      'locations',
      orderBy: 'name',
      ascending: true,
    );
    if (!mounted) return;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: Text(tug == null ? 'Add tug' : 'Edit tug'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppTextField(controller: number, label: 'Tug number'),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(controller: name, label: 'Display name'),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: location,
                  decoration: const InputDecoration(labelText: 'Location'),
                  items: [
                    const DropdownMenuItem(
                      value: '',
                      child: Text('No location'),
                    ),
                    for (final item in locations)
                      DropdownMenuItem(
                        value: item['id'].toString(),
                        child: Text(item['name']?.toString() ?? ''),
                      ),
                  ],
                  onChanged: (value) =>
                      setDialogState(() => location = value ?? ''),
                ),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: const [
                    DropdownMenuItem(value: 'active', child: Text('Active')),
                    DropdownMenuItem(
                      value: 'inactive',
                      child: Text('Inactive'),
                    ),
                    DropdownMenuItem(
                      value: 'maintenance',
                      child: Text('Maintenance'),
                    ),
                  ],
                  onChanged: (value) =>
                      setDialogState(() => status = value ?? 'active'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                try {
                  await widget.repository.saveTug(
                    session: widget.session,
                    id: tug?.id,
                    number: number.text,
                    status: status,
                    displayName: name.text,
                    locationId: location,
                  );
                  if (dialogContext.mounted) {
                    Navigator.pop(dialogContext, true);
                  }
                } catch (_) {
                  if (dialogContext.mounted) {
                    AppToast.show(dialogContext, 'Could not save tug.');
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    number.dispose();
    name.dispose();
    if (saved == true) {
      if (mounted) AppToast.show(context, 'Tug saved.');
      await _load();
    }
  }

  Future<void> _editTablet([TugTablet? tablet]) async {
    final serial = TextEditingController(text: tablet?.serialNumber);
    var tugId =
        tablet?.tugId ??
        _tugs
            .where(
              (tug) =>
                  tug.status == 'active' &&
                  !_tablets.any((item) => item.tugId == tug.id),
            )
            .firstOrNull
            ?.id ??
        '';
    if (!mounted) return;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => AlertDialog(
          title: Text(tablet == null ? 'Add tablet' : 'Edit tablet'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: tugId.isEmpty ? null : tugId,
                decoration: const InputDecoration(labelText: 'Tug'),
                items: [
                  for (final tug in _tugs)
                    if (tablet?.tugId == tug.id ||
                        !_tablets.any((item) => item.tugId == tug.id))
                      DropdownMenuItem(value: tug.id, child: Text(tug.label)),
                ],
                onChanged: (value) => setDialogState(() => tugId = value ?? ''),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(controller: serial, label: 'Serial number'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                if (tugId.isEmpty || serial.text.trim().isEmpty) {
                  AppToast.show(
                    dialogContext,
                    'Select a tug and enter a serial number.',
                  );
                  return;
                }
                try {
                  await widget.repository.saveTablet(
                    session: widget.session,
                    id: tablet?.id,
                    tugId: tugId,
                    serialNumber: serial.text,
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                } catch (_) {
                  if (dialogContext.mounted) {
                    AppToast.show(dialogContext, 'Could not save tablet.');
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    serial.dispose();
    if (saved == true) await _load();
  }

  Future<void> _showQr(TugRecord tug) async {
    if (tug.qrToken?.isNotEmpty != true) {
      AppToast.show(context, 'Regenerate the QR code first.');
      return;
    }
    final url = 'https://yard-rota.vercel.app/precheck/tug/${tug.qrToken}';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('${tug.label} QR'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            QrImageView(data: url, size: AppPreCheckCard.qrFrameSize),
            const SizedBox(height: AppSpacing.sm),
            SelectableText(url),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _regenerateQr(TugRecord tug) async {
    final confirmed = await _confirm(
      'Regenerate QR?',
      'The previous QR for ${tug.label} will stop working.',
    );
    if (!confirmed) return;
    try {
      await widget.repository.regenerateTugQr(widget.session, tug.id);
      if (mounted) AppToast.show(context, 'QR code regenerated.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not regenerate QR code.');
    }
  }

  Future<void> _deleteTug(TugRecord tug) async {
    if (!await _confirm('Delete tug?', 'Delete ${tug.label} permanently?')) {
      return;
    }
    try {
      await widget.repository.deleteTug(widget.session, tug.id);
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete tug.');
    }
  }

  Future<void> _deleteTablet(TugTablet tablet) async {
    if (!await _confirm(
      'Delete tablet?',
      'Delete ${tablet.serialNumber} permanently?',
    )) {
      return;
    }
    try {
      await widget.repository.deleteTablet(widget.session, tablet.id);
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete tablet.');
    }
  }

  Future<bool> _confirm(String title, String message) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Confirm'),
              ),
            ],
          ),
        ) ??
        false;
  }
}

class CheckItemsAdminScreen extends StatefulWidget {
  const CheckItemsAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<CheckItemsAdminScreen> createState() => _CheckItemsAdminScreenState();
}

class _CheckItemsAdminScreenState extends State<CheckItemsAdminScreen> {
  List<CheckItemDefinition> _items = const [];
  Map<String, String> _settings = const {};
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await Future.wait([
        widget.repository.loadCheckItems(widget.session),
        widget.repository.loadSettings(widget.session, const [
          'pre_shift_remarks_enabled',
          'during_shift_damage_report_enabled',
          'defect_resolve_confirmations_required',
        ]),
      ]);
      if (!mounted) return;
      setState(() {
        _items = result[0] as List<CheckItemDefinition>;
        _settings = result[1] as Map<String, String>;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load check items.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('PreCheck configuration')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(),
        icon: const Icon(Icons.add),
        label: const Text('Add item'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.giant,
                ),
                children: [
                  _settingSwitch(
                    'Pre-Shift remarks',
                    'pre_shift_remarks_enabled',
                  ),
                  _settingSwitch(
                    'During Shift damage report',
                    'during_shift_damage_report_enabled',
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Resolve confirmations required'),
                    subtitle: Text(
                      '${parseConfirmationCount(_settings['defect_resolve_confirmations_required'])}',
                    ),
                    trailing: const Icon(Icons.edit_outlined),
                    onTap: _editConfirmations,
                  ),
                  for (final category in const ['outside', 'inside']) ...[
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      category == 'outside'
                          ? 'Outside checks'
                          : 'Inside checks',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    for (final item in _items.where(
                      (item) => item.category == category,
                    ))
                      _itemCard(item),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _settingSwitch(String title, String key) {
    final enabled = _settings[key] != 'false';
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(title),
      value: enabled,
      onChanged: (value) async {
        try {
          await widget.repository.saveSetting(widget.session, key, value);
          setState(() => _settings = {..._settings, key: value.toString()});
        } catch (_) {
          if (mounted) AppToast.show(context, 'Could not save option.');
        }
      },
    );
  }

  Widget _itemCard(CheckItemDefinition item) {
    final category = _items
        .where((candidate) => candidate.category == item.category)
        .toList();
    final index = category.indexWhere((candidate) => candidate.id == item.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: EdgeInsets.zero,
        child: ListTile(
          leading: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              InkWell(
                onTap: index > 0
                    ? () => _move(item, category[index - 1])
                    : null,
                child: const Icon(Icons.arrow_drop_up),
              ),
              InkWell(
                onTap: index < category.length - 1
                    ? () => _move(item, category[index + 1])
                    : null,
                child: const Icon(Icons.arrow_drop_down),
              ),
            ],
          ),
          title: Text(item.label),
          subtitle: Text(
            '${item.key}${item.tooltip?.isNotEmpty == true ? ' · ${item.tooltip}' : ''}',
          ),
          trailing: Switch(
            value: item.isActive,
            onChanged: (value) => _saveToggle(item, active: value),
          ),
          onTap: () => _edit(item),
          onLongPress: () => _delete(item),
        ),
      ),
    );
  }

  Future<void> _saveToggle(
    CheckItemDefinition item, {
    bool? active,
    bool? allowNa,
  }) async {
    try {
      await widget.repository.saveCheckItem(
        session: widget.session,
        id: item.id,
        key: item.key,
        label: item.label,
        category: item.category,
        sortOrder: item.sortOrder,
        tooltip: item.tooltip,
        isActive: active ?? item.isActive,
        allowNa: allowNa ?? item.allowNa,
      );
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not update check item.');
    }
  }

  Future<void> _move(
    CheckItemDefinition item,
    CheckItemDefinition other,
  ) async {
    try {
      await widget.repository.reorderCheckItems(widget.session, item, other);
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not reorder items.');
    }
  }

  Future<void> _edit([CheckItemDefinition? item]) async {
    final key = TextEditingController(text: item?.key);
    final label = TextEditingController(text: item?.label);
    final tooltip = TextEditingController(text: item?.tooltip);
    var category = item?.category ?? 'outside';
    var allowNa = item?.allowNa ?? false;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, update) => AlertDialog(
          title: Text(item == null ? 'Add check item' : 'Edit check item'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppTextField(controller: key, label: 'Unique key'),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(controller: label, label: 'Label'),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(
                  controller: tooltip,
                  label: 'Tooltip',
                  maxLines: 3,
                ),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: const [
                    DropdownMenuItem(value: 'outside', child: Text('Outside')),
                    DropdownMenuItem(value: 'inside', child: Text('Inside')),
                  ],
                  onChanged: (value) =>
                      update(() => category = value ?? 'outside'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Allow N/A'),
                  value: allowNa,
                  onChanged: (value) => update(() => allowNa = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                if (key.text.trim().isEmpty || label.text.trim().isEmpty) {
                  AppToast.show(dialogContext, 'Key and label are required.');
                  return;
                }
                try {
                  final categoryItems = _items.where(
                    (value) => value.category == category,
                  );
                  final nextOrder = categoryItems.isEmpty
                      ? 1
                      : categoryItems
                                .map((value) => value.sortOrder)
                                .reduce((a, b) => a > b ? a : b) +
                            1;
                  await widget.repository.saveCheckItem(
                    session: widget.session,
                    id: item?.id,
                    key: key.text,
                    label: label.text,
                    category: category,
                    sortOrder: item?.sortOrder ?? nextOrder,
                    tooltip: tooltip.text,
                    isActive: item?.isActive ?? true,
                    allowNa: allowNa,
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                } catch (_) {
                  if (dialogContext.mounted) {
                    AppToast.show(dialogContext, 'Could not save check item.');
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    key.dispose();
    label.dispose();
    tooltip.dispose();
    if (saved == true) await _load();
  }

  Future<void> _delete(CheckItemDefinition item) async {
    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Delete check item?'),
            content: Text('Delete "${item.label}" permanently?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: const Text('Delete'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed) return;
    try {
      await widget.repository.deleteCheckItem(widget.session, item.id);
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete check item.');
    }
  }

  Future<void> _editConfirmations() async {
    final controller = TextEditingController(
      text:
          '${parseConfirmationCount(_settings['defect_resolve_confirmations_required'])}',
    );
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Resolve confirmations'),
        content: AppTextField(
          controller: controller,
          label: 'Required confirmations (1–99)',
          keyboardType: TextInputType.number,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              final value = parseConfirmationCount(controller.text);
              await widget.repository.saveSetting(
                widget.session,
                'defect_resolve_confirmations_required',
                value,
              );
              if (dialogContext.mounted) Navigator.pop(dialogContext, true);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (saved == true) await _load();
  }
}
