import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_three/data/precheck_export_service.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_three/domain/stage_three_models.dart';

enum VmuSection { defects, preChecks }

List<VmuSection> vmuSectionsForSession(UserSession session) =>
    session.isAdmin || session.isVmu ? VmuSection.values : const [];

class VmuShellScreen extends StatefulWidget {
  const VmuShellScreen({
    super.key,
    required this.repository,
    required this.session,
    this.initialSection = VmuSection.defects,
  });
  final StageThreeRepository repository;
  final UserSession session;
  final VmuSection initialSection;

  @override
  State<VmuShellScreen> createState() => _VmuShellScreenState();
}

class _VmuShellScreenState extends State<VmuShellScreen> {
  late VmuSection _section = widget.initialSection;

  @override
  Widget build(BuildContext context) {
    if (vmuSectionsForSession(widget.session).isEmpty) {
      return const Scaffold(
        body: Center(child: Text('VMU access is required.')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('VMU'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: SegmentedButton<VmuSection>(
              segments: const [
                ButtonSegment(
                  value: VmuSection.defects,
                  label: Text('Defects'),
                  icon: Icon(Icons.build_outlined),
                ),
                ButtonSegment(
                  value: VmuSection.preChecks,
                  label: Text('PreChecks'),
                  icon: Icon(Icons.fact_check_outlined),
                ),
              ],
              selected: {_section},
              onSelectionChanged: (value) =>
                  setState(() => _section = value.first),
            ),
          ),
        ),
      ),
      body: switch (_section) {
        VmuSection.defects => DefectBoardScreen(
          repository: widget.repository,
          session: widget.session,
        ),
        VmuSection.preChecks => PreCheckManagementScreen(
          repository: widget.repository,
          session: widget.session,
        ),
      },
    );
  }
}

class DefectBoardScreen extends StatefulWidget {
  const DefectBoardScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;

  @override
  State<DefectBoardScreen> createState() => _DefectBoardScreenState();
}

class _DefectBoardScreenState extends State<DefectBoardScreen> {
  static const _tugKey = 'stage3_vmu_tug';
  static const _statusKey = 'stage3_vmu_status';
  static const _searchKey = 'stage3_vmu_search';
  final _search = TextEditingController();
  List<DefectRecord> _defects = const [];
  List<TugRecord> _tugs = const [];
  String _tug = '';
  String _status = '';
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final preferences = await SharedPreferences.getInstance();
      final result = await Future.wait([
        widget.repository.loadDefects(widget.session),
        widget.repository.loadTugs(widget.session),
      ]);
      if (!mounted) return;
      setState(() {
        _defects = result[0] as List<DefectRecord>;
        _tugs = result[1] as List<TugRecord>;
        _tug = preferences.getString(_tugKey) ?? '';
        _status = preferences.getString(_statusKey) ?? '';
        _search.text = preferences.getString(_searchKey) ?? '';
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _persist() async {
    final preferences = await SharedPreferences.getInstance();
    await Future.wait([
      preferences.setString(_tugKey, _tug),
      preferences.setString(_statusKey, _status),
      preferences.setString(_searchKey, _search.text),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _Retry(message: 'Could not load defects.', onRetry: _load);
    }
    final visible = _defects
        .where(
          (defect) =>
              defect.matches(tug: _tug, status: _status, search: _search.text),
        )
        .toList();
    final grouped = <String, List<DefectRecord>>{};
    for (final defect in visible) {
      grouped.putIfAbsent(defect.tugId, () => []).add(defect);
    }
    final groups = grouped.entries.toList()
      ..sort((a, b) {
        final aOpen = a.value
            .where((d) => d.status != RepairStatus.resolved)
            .length;
        final bOpen = b.value
            .where((d) => d.status != RepairStatus.resolved)
            .length;
        return bOpen.compareTo(aOpen);
      });
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(
            controller: _search,
            label: 'Search',
            hint: 'Defect number, description, tug or notes',
            onChanged: (_) {
              setState(() {});
              _persist();
            },
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _tug,
                  decoration: const InputDecoration(labelText: 'Tug'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('All tugs')),
                    for (final tug in _tugs)
                      DropdownMenuItem(value: tug.id, child: Text(tug.label)),
                  ],
                  onChanged: (value) {
                    setState(() => _tug = value ?? '');
                    _persist();
                  },
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: [
                    const DropdownMenuItem(
                      value: '',
                      child: Text('All statuses'),
                    ),
                    for (final status in RepairStatus.values)
                      DropdownMenuItem(
                        value: status.dbValue,
                        child: Text(status.label),
                      ),
                  ],
                  onChanged: (value) {
                    setState(() => _status = value ?? '');
                    _persist();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          if (groups.isEmpty)
            const _Empty(
              title: 'No defects found',
              message: 'Try adjusting your filters.',
            ),
          for (final group in groups)
            _TugDefectGroup(
              defects: group.value,
              onChanged: _load,
              repository: widget.repository,
              session: widget.session,
            ),
        ],
      ),
    );
  }
}

class _TugDefectGroup extends StatelessWidget {
  const _TugDefectGroup({
    required this.defects,
    required this.onChanged,
    required this.repository,
    required this.session,
  });
  final List<DefectRecord> defects;
  final Future<void> Function() onChanged;
  final StageThreeRepository repository;
  final UserSession session;

  @override
  Widget build(BuildContext context) {
    final open = defects.where((d) => d.status != RepairStatus.resolved).length;
    final sorted = [...defects]
      ..sort((a, b) {
        if (a.status == RepairStatus.resolved &&
            b.status != RepairStatus.resolved) {
          return 1;
        }
        if (a.status != RepairStatus.resolved &&
            b.status == RepairStatus.resolved) {
          return -1;
        }
        return b.createdAt.compareTo(a.createdAt);
      });
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppCard(
        padding: EdgeInsets.zero,
        child: ExpansionTile(
          title: Text(defects.first.tugLabel),
          subtitle: Text('${defects.first.tugNumber} · $open awaiting repair'),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.md,
          ),
          children: [
            for (final defect in sorted)
              _DefectTile(
                defect: defect,
                repository: repository,
                session: session,
                onChanged: onChanged,
              ),
          ],
        ),
      ),
    );
  }
}

class _DefectTile extends StatelessWidget {
  const _DefectTile({
    required this.defect,
    required this.repository,
    required this.session,
    required this.onChanged,
  });
  final DefectRecord defect;
  final StageThreeRepository repository;
  final UserSession session;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    final statusColor = switch (defect.status) {
      RepairStatus.resolved => colors.success,
      RepairStatus.awaitingParts => colors.warning,
      RepairStatus.inProgress => colors.warning,
      RepairStatus.reported => colors.info,
      RepairStatus.open => colors.danger,
    };
    return Card(
      margin: const EdgeInsets.only(top: AppSpacing.sm),
      child: ListTile(
        leading: Icon(Icons.circle, size: AppSpacing.md, color: statusColor),
        title: Text(defect.itemLabel ?? defect.description),
        subtitle: Text(
          '${defect.defectNumber ?? 'No defect number'} · ${defect.status.label}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          await Navigator.of(context).push<void>(
            MaterialPageRoute(
              builder: (_) => DefectDetailScreen(
                defect: defect,
                repository: repository,
                session: session,
              ),
            ),
          );
          await onChanged();
        },
      ),
    );
  }
}

class DefectDetailScreen extends StatefulWidget {
  const DefectDetailScreen({
    super.key,
    required this.defect,
    required this.repository,
    required this.session,
  });
  final DefectRecord defect;
  final StageThreeRepository repository;
  final UserSession session;

  @override
  State<DefectDetailScreen> createState() => _DefectDetailScreenState();
}

class _DefectDetailScreenState extends State<DefectDetailScreen> {
  late final _number = TextEditingController(text: widget.defect.defectNumber);
  late final _notes = TextEditingController(text: widget.defect.vmuNotes);
  List<DefectActivity>? _activity;
  DateTime? _terberg;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _terberg = widget.defect.reportedToTerbergAt;
    _loadActivity();
  }

  @override
  void dispose() {
    _number.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _loadActivity() async {
    try {
      final result = await widget.repository.loadDefectActivity(
        widget.session,
        widget.defect,
      );
      if (mounted) setState(() => _activity = result);
    } catch (_) {
      if (mounted) setState(() => _activity = const []);
    }
  }

  Future<void> _save({RepairStatus? status}) async {
    setState(() => _saving = true);
    try {
      await widget.repository.updateDefect(
        session: widget.session,
        current: widget.defect,
        status: status,
        defectNumber: _number.text,
        reportedToTerbergAt: _terberg,
        vmuNotes: _notes.text,
        updateDefectNumber: true,
        updateTerbergDate: true,
        updateNotes: true,
      );
      if (!mounted) return;
      AppToast.show(context, 'Defect updated.');
      await _loadActivity();
    } catch (_) {
      if (mounted) {
        AppToast.show(context, 'Could not update defect. Try again.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.defect.tugLabel)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Text(
            widget.defect.itemLabel ?? 'Defect',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(widget.defect.description),
          if (widget.defect.imageUrls.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text('Photos', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: AppSpacing.sm,
                mainAxisSpacing: AppSpacing.sm,
              ),
              itemCount: widget.defect.imageUrls.length,
              itemBuilder: (_, index) => InkWell(
                onTap: () => showDialog<void>(
                  context: context,
                  builder: (_) => Dialog.fullscreen(
                    child: Stack(
                      children: [
                        Center(
                          child: InteractiveViewer(
                            child: Image.network(
                              widget.defect.imageUrls[index],
                              errorBuilder: (_, _, _) =>
                                  const Icon(Icons.broken_image_outlined),
                            ),
                          ),
                        ),
                        Positioned(
                          right: AppSpacing.sm,
                          top: AppSpacing.sm,
                          child: IconButton(
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.close),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: Image.network(
                    widget.defect.imageUrls[index],
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) =>
                        const Center(child: Icon(Icons.broken_image_outlined)),
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          DropdownButtonFormField<RepairStatus>(
            initialValue: widget.defect.status,
            decoration: const InputDecoration(labelText: 'Repair status'),
            items: [
              for (final value in RepairStatus.values)
                DropdownMenuItem(value: value, child: Text(value.label)),
            ],
            onChanged: _saving
                ? null
                : (status) {
                    if (status != null) _save(status: status);
                  },
          ),
          if (widget.defect.resolvedAt != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Resolved by ${widget.defect.resolvedByName?.isNotEmpty == true ? widget.defect.resolvedByName : 'Unknown'} '
              'on ${_dateTimeLabel(widget.defect.resolvedAt!)}',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: context.appColors.success),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppTextField(controller: _number, label: 'Defect number'),
          const SizedBox(height: AppSpacing.md),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Reported to Terberg'),
            subtitle: Text(
              _terberg == null ? 'Not reported' : _dateLabel(_terberg!),
            ),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () async {
              final result = await showDatePicker(
                context: context,
                firstDate: DateTime(2020),
                lastDate: DateTime.now().add(const Duration(days: 365)),
                initialDate: _terberg ?? DateTime.now(),
              );
              if (result != null) setState(() => _terberg = result);
            },
          ),
          AppTextField(controller: _notes, label: 'VMU notes', maxLines: 4),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: _saving ? 'Saving...' : 'Save fields',
            onPressed: _saving ? null : _save,
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text('Activity log', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          if (_activity == null)
            const Center(child: CircularProgressIndicator())
          else
            for (final item in _activity!) _ActivityTile(activity: item),
        ],
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.activity});
  final DefectActivity activity;
  @override
  Widget build(BuildContext context) {
    final description = switch (activity.type) {
      'initial_report' => 'reported this defect',
      'confirmation' => 'confirmed the problem still exists',
      'status_change' =>
        'changed status from ${activity.oldValue ?? 'unknown'} to ${activity.newValue ?? 'unknown'}',
      _ =>
        'updated ${activity.fieldName?.replaceAll('_', ' ') ?? 'the defect'}'
            '${activity.newValue?.isNotEmpty == true ? ' to ${activity.newValue}' : ''}',
    };
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.history, size: AppSpacing.xl),
      title: Text('${activity.actorName} $description'),
      subtitle: Text(_dateTimeLabel(activity.createdAt)),
    );
  }
}

class PreCheckManagementScreen extends StatefulWidget {
  const PreCheckManagementScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<PreCheckManagementScreen> createState() =>
      _PreCheckManagementScreenState();
}

class _PreCheckManagementScreenState extends State<PreCheckManagementScreen> {
  static const _faultKey = 'stage3_precheck_faults';
  static const _tugKey = 'stage3_precheck_tug';
  static const _typeKey = 'stage3_precheck_type';
  final _search = TextEditingController();
  List<PreCheckSubmissionRecord> _submissions = const [];
  List<TugRecord> _tugs = const [];
  String _tug = '';
  String _type = '';
  bool _faultsOnly = false;
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final preferences = await SharedPreferences.getInstance();
      _tug = preferences.getString(_tugKey) ?? '';
      _type = preferences.getString(_typeKey) ?? '';
      _faultsOnly = preferences.getBool(_faultKey) ?? false;
      final results = await Future.wait([
        widget.repository.loadPreChecks(
          session: widget.session,
          tugId: _tug,
          checkType: _type,
        ),
        widget.repository.loadTugs(widget.session),
      ]);
      if (!mounted) return;
      setState(() {
        _submissions = results[0] as List<PreCheckSubmissionRecord>;
        _tugs = results[1] as List<TugRecord>;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setFilters() async {
    final preferences = await SharedPreferences.getInstance();
    await Future.wait([
      preferences.setString(_tugKey, _tug),
      preferences.setString(_typeKey, _type),
      preferences.setBool(_faultKey, _faultsOnly),
    ]);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _Retry(message: 'Could not load PreChecks.', onRetry: _load);
    }
    final query = _search.text.trim().toLowerCase();
    final visible = _submissions.where((submission) {
      if (_faultsOnly && !submission.hasOpenFaults) return false;
      return query.isEmpty ||
          [
            submission.tugLabel,
            submission.tugNumber,
            submission.userName,
            submission.checkDate,
          ].any((value) => value.toLowerCase().contains(query));
    }).toList();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(
            controller: _search,
            label: 'Search',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _tug,
                  decoration: const InputDecoration(labelText: 'Tug'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('All tugs')),
                    for (final tug in _tugs)
                      DropdownMenuItem(value: tug.id, child: Text(tug.label)),
                  ],
                  onChanged: (value) {
                    _tug = value ?? '';
                    _setFilters();
                  },
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _type,
                  decoration: const InputDecoration(labelText: 'Type'),
                  items: const [
                    DropdownMenuItem(value: '', child: Text('All types')),
                    DropdownMenuItem(
                      value: 'pre_shift',
                      child: Text('Pre-Shift'),
                    ),
                    DropdownMenuItem(
                      value: 'during_shift',
                      child: Text('During Shift'),
                    ),
                  ],
                  onChanged: (value) {
                    _type = value ?? '';
                    _setFilters();
                  },
                ),
              ),
            ],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Faults only'),
            value: _faultsOnly,
            onChanged: (value) {
              _faultsOnly = value;
              _setFilters();
            },
          ),
          if (_tug.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(
                label: 'Print audit pack',
                onPressed: _printPack,
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          if (visible.isEmpty)
            const _Empty(
              title: 'No PreCheck reports found',
              message: 'Try adjusting your filters.',
            ),
          for (final submission in visible)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: AppCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: Icon(
                    submission.hasOpenFaults
                        ? Icons.warning_amber_rounded
                        : Icons.check_circle_outline,
                    color: submission.hasOpenFaults
                        ? context.appColors.danger
                        : context.appColors.success,
                  ),
                  title: Text(
                    '${submission.tugLabel} · ${submission.userName}',
                  ),
                  subtitle: Text(
                    '${submission.checkDate} ${_timeLabel(submission.checkTime)} · '
                    '${submission.defects.length} fault(s)',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await Navigator.of(context).push<void>(
                      MaterialPageRoute(
                        builder: (_) => PreCheckDetailScreen(
                          submission: submission,
                          repository: widget.repository,
                          session: widget.session,
                        ),
                      ),
                    );
                    await _load();
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _printPack() async {
    final selected = _tugs.where((tug) => tug.id == _tug).firstOrNull;
    final now = DateTime.now();
    final from = now.subtract(const Duration(days: 7));
    try {
      final reports = await widget.repository.loadPreChecks(
        session: widget.session,
        tugId: _tug,
        checkType: _type,
        from: from,
        to: now,
      );
      if (reports.isEmpty) {
        if (mounted) {
          AppToast.show(context, 'No reports in the last seven days.');
        }
        return;
      }
      await PreCheckExportService.printAuditPack(
        tugLabel: selected?.label ?? reports.first.tugLabel,
        from: _ymd(from),
        to: _ymd(now),
        submissions: reports,
      );
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not create audit pack.');
    }
  }
}

class PreCheckDetailScreen extends StatelessWidget {
  const PreCheckDetailScreen({
    super.key,
    required this.submission,
    required this.repository,
    required this.session,
  });
  final PreCheckSubmissionRecord submission;
  final StageThreeRepository repository;
  final UserSession session;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(submission.tugLabel),
        actions: [
          IconButton(
            tooltip: 'Print',
            onPressed: () => _export(context, share: false),
            icon: const Icon(Icons.print_outlined),
          ),
          IconButton(
            tooltip: 'Share',
            onPressed: () => _export(context, share: true),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${submission.tugNumber} · ${submission.userName}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  '${submission.checkDate} ${_timeLabel(submission.checkTime)}'
                  '${submission.locationName?.isNotEmpty == true ? ' · ${submission.locationName}' : ''}',
                ),
                Text(
                  submission.checkType == 'pre_shift'
                      ? 'Pre-Shift'
                      : 'During Shift',
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Check items', style: Theme.of(context).textTheme.titleMedium),
          for (final item in submission.items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                item.status == 'ok'
                    ? Icons.check_circle_outline
                    : item.status == 'na'
                    ? Icons.remove_circle_outline
                    : Icons.warning_amber_rounded,
              ),
              title: Text(item.name),
              subtitle: item.notes?.isNotEmpty == true
                  ? Text(item.notes!)
                  : null,
              trailing: Text(item.status.toUpperCase()),
            ),
          if (submission.defects.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text('Faults', style: Theme.of(context).textTheme.titleMedium),
            for (final defect in submission.defects)
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      defect.itemLabel ?? 'Damage report',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Text(defect.description),
                    const SizedBox(height: AppSpacing.sm),
                    DropdownButtonFormField<RepairStatus>(
                      initialValue: defect.status,
                      decoration: const InputDecoration(labelText: 'Status'),
                      items: [
                        for (final status in RepairStatus.values)
                          DropdownMenuItem(
                            value: status,
                            child: Text(status.label),
                          ),
                      ],
                      onChanged: (status) async {
                        if (status == null) return;
                        try {
                          await repository.updatePreCheckDefectStatus(
                            session: session,
                            defect: defect,
                            status: status,
                          );
                          if (context.mounted) {
                            AppToast.show(context, 'Fault status updated.');
                          }
                        } catch (_) {
                          if (context.mounted) {
                            AppToast.show(context, 'Could not update fault.');
                          }
                        }
                      },
                    ),
                  ],
                ),
              ),
          ],
          if (submission.remarks?.isNotEmpty == true) ...[
            const SizedBox(height: AppSpacing.lg),
            Text('Remarks', style: Theme.of(context).textTheme.titleMedium),
            Text(submission.remarks!),
          ],
        ],
      ),
    );
  }

  Future<void> _export(BuildContext context, {required bool share}) async {
    try {
      if (share) {
        await PreCheckExportService.shareSingle(submission);
      } else {
        await PreCheckExportService.printSingle(submission);
      }
    } catch (_) {
      if (context.mounted) AppToast.show(context, 'Could not export report.');
    }
  }
}

class _Retry extends StatelessWidget {
  const _Retry({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(message),
        const SizedBox(height: AppSpacing.sm),
        AppButton(label: 'Retry', onPressed: onRetry),
      ],
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.message});
  final String title;
  final String message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(AppSpacing.xxl),
    child: Column(
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppSpacing.xs),
        Text(message),
      ],
    ),
  );
}

String _ymd(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}';
String _dateLabel(DateTime value) => _ymd(value.toLocal());
String _timeLabel(DateTime value) =>
    '${value.toLocal().hour.toString().padLeft(2, '0')}:'
    '${value.toLocal().minute.toString().padLeft(2, '0')}';
String _dateTimeLabel(DateTime value) =>
    '${_dateLabel(value)} ${_timeLabel(value)}';
