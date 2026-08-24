import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_button.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_three/domain/stage_three_models.dart';

class AttendanceIssuesScreen extends StatefulWidget {
  const AttendanceIssuesScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<AttendanceIssuesScreen> createState() => _AttendanceIssuesScreenState();
}

class _AttendanceIssuesScreenState extends State<AttendanceIssuesScreen> {
  List<Map<String, dynamic>> _users = const [];
  List<Map<String, dynamic>> _attendance = const [];
  List<Map<String, dynamic>> _violations = const [];
  List<Map<String, dynamic>> _rota = const [];
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
        widget.repository.loadRows(
          widget.session,
          'profiles',
          select: 'id,first_name,last_name',
          orderBy: 'last_name',
          ascending: true,
        ),
        widget.repository.loadRows(
          widget.session,
          'attendance',
          select: 'scheduled_rota_id,status,recorded_at',
          orderBy: 'recorded_at',
        ),
        widget.repository.loadRows(
          widget.session,
          'shunter_violations',
          select: 'id,user_id,body,category,created_at',
        ),
        widget.repository.loadRows(
          widget.session,
          'scheduled_rota',
          select: 'id,user_id,date',
          orderBy: 'date',
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _users = result[0];
        _attendance = result[1];
        _violations = result[2];
        _rota = result[3];
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load attendance issues.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rotaById = {for (final row in _rota) row['id'].toString(): row};
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final issue in _attendance) {
      final rota = rotaById[issue['scheduled_rota_id']?.toString()];
      final userId = rota?['user_id']?.toString();
      if (userId != null) {
        grouped.putIfAbsent(userId, () => []).add({
          ...issue,
          'date': rota?['date'],
          'kind': 'attendance',
        });
      }
    }
    for (final violation in _violations) {
      grouped.putIfAbsent(violation['user_id'].toString(), () => []).add({
        ...violation,
        'kind': 'violation',
      });
    }
    final usersById = {for (final row in _users) row['id'].toString(): row};
    final entries = grouped.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));
    return Scaffold(
      appBar: AppBar(title: const Text('Black list')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addViolation,
        icon: const Icon(Icons.add),
        label: const Text('Add violation'),
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
                  if (entries.isEmpty)
                    const Center(child: Text('No one is on the black list.')),
                  for (final entry in entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: AppCard(
                        padding: EdgeInsets.zero,
                        child: ExpansionTile(
                          title: Text(_name(usersById[entry.key])),
                          subtitle: Text('${entry.value.length} issue(s)'),
                          children: [
                            for (final issue in entry.value)
                              ListTile(
                                dense: true,
                                title: Text(
                                  issue['kind'] == 'attendance'
                                      ? (issue['status'] ?? 'attendance')
                                            .toString()
                                            .replaceAll('_', ' ')
                                      : issue['body']?.toString() ??
                                            'Violation',
                                ),
                                subtitle: Text(
                                  issue['kind'] == 'attendance'
                                      ? issue['date']?.toString() ?? ''
                                      : '${issue['category'] ?? 'other'} · ${issue['created_at'] ?? ''}',
                                ),
                              ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: () => _addViolation(entry.key),
                                child: const Text('Add violation'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  Future<void> _addViolation([String? initialUserId]) async {
    var userId = initialUserId ?? '';
    var category = 'other';
    final body = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, update) => AlertDialog(
          title: const Text('Add violation'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: userId.isEmpty ? null : userId,
                  decoration: const InputDecoration(labelText: 'User'),
                  items: [
                    for (final user in _users)
                      DropdownMenuItem(
                        value: user['id'].toString(),
                        child: Text(_name(user)),
                      ),
                  ],
                  onChanged: (value) => update(() => userId = value ?? ''),
                ),
                const SizedBox(height: AppSpacing.sm),
                DropdownButtonFormField<String>(
                  initialValue: category,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: const [
                    DropdownMenuItem(
                      value: 'trailer_check',
                      child: Text('Trailer not checked'),
                    ),
                    DropdownMenuItem(
                      value: 'radio',
                      child: Text('Not listening to radio'),
                    ),
                    DropdownMenuItem(value: 'other', child: Text('Other')),
                  ],
                  onChanged: (value) =>
                      update(() => category = value ?? 'other'),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(
                  controller: body,
                  label: 'Description',
                  maxLines: 3,
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
                if (userId.isEmpty || body.text.trim().isEmpty) {
                  AppToast.show(
                    dialogContext,
                    'Select a user and enter a description.',
                  );
                  return;
                }
                try {
                  await widget.repository.saveRow(
                    session: widget.session,
                    table: 'shunter_violations',
                    payload: {
                      'user_id': userId,
                      'created_by': widget.session.userId,
                      'body': body.text.trim(),
                      'category': category,
                    },
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                } catch (_) {
                  if (dialogContext.mounted) {
                    AppToast.show(dialogContext, 'Could not add violation.');
                  }
                }
              },
              child: const Text('Add'),
            ),
          ],
        ),
      ),
    );
    body.dispose();
    if (saved == true) {
      if (mounted) AppToast.show(context, 'Violation added.');
      await _load();
    }
  }
}

class PerformanceImportScreen extends StatefulWidget {
  const PerformanceImportScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<PerformanceImportScreen> createState() =>
      _PerformanceImportScreenState();
}

class _PerformanceImportScreenState extends State<PerformanceImportScreen> {
  final _csv = TextEditingController();
  List<PerformanceRow> _rows = const [];
  List<Map<String, dynamic>> _history = const [];
  var _date = DateTime.now().subtract(const Duration(days: 1));
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  @override
  void dispose() {
    _csv.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final history = await widget.repository.loadPerformanceHistory(
        widget.session,
      );
      if (mounted) setState(() => _history = history);
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load import history.');
    }
  }

  Future<void> _preview() async {
    setState(() => _busy = true);
    try {
      final parsed = CsvPerformanceParser.parse(_csv.text);
      final rows = await widget.repository.matchPerformanceRows(
        widget.session,
        parsed,
      );
      if (!mounted) return;
      setState(() => _rows = rows);
      AppToast.show(
        context,
        '${rows.where((row) => row.matched).length} matched, '
        '${rows.where((row) => !row.matched).length} unmatched.',
      );
    } catch (error) {
      if (mounted) {
        AppToast.show(
          context,
          error is FormatException
              ? error.message
              : 'Could not parse CSV data.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _import() async {
    setState(() => _busy = true);
    try {
      await widget.repository.importPerformance(
        session: widget.session,
        reportDate: _ymd(_date),
        rows: _rows,
      );
      if (!mounted) return;
      AppToast.show(context, 'Performance records imported.');
      setState(() {
        _rows = const [];
        _csv.clear();
      });
      await _loadHistory();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not import performance data.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final matched = _rows.where((row) => row.matched).toList();
    final unmatched = _rows.where((row) => !row.matched).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Performance CSV import')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Report date'),
            subtitle: Text(_ymd(_date)),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
                initialDate: _date,
              );
              if (picked != null) setState(() => _date = picked);
            },
          ),
          AppTextField(
            controller: _csv,
            label: 'Paste CSV data',
            hint: 'Include Yard ID, name, moves and timing columns',
            maxLines: 10,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: _busy ? 'Working...' : 'Preview',
            onPressed: _busy ? null : _preview,
          ),
          if (_rows.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Matched (${matched.length})',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final row in matched)
              ListTile(
                title: Text(row.fullName),
                subtitle: Text(row.yardSystemId),
                trailing: Text('${row.moves} moves'),
              ),
            Text(
              'Unmatched (${unmatched.length})',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final row in unmatched)
              ListTile(
                title: Text(
                  row.fullName.isEmpty ? 'Unknown shunter' : row.fullName,
                ),
                subtitle: Text(row.yardSystemId),
                trailing: Text('${row.moves} moves'),
              ),
            AppButton(
              label: 'Import ${matched.length} records',
              onPressed: _busy || matched.isEmpty ? null : _import,
            ),
          ],
          const SizedBox(height: AppSpacing.xxl),
          Text(
            'Import history',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          for (final item in _history)
            ListTile(
              title: Text(item['report_date'].toString()),
              trailing: Text('${item['count']} records'),
            ),
        ],
      ),
    );
  }
}

class ActivityAdminScreen extends StatefulWidget {
  const ActivityAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<ActivityAdminScreen> createState() => _ActivityAdminScreenState();
}

class _ActivityAdminScreenState extends State<ActivityAdminScreen> {
  String _kind = 'logs';
  String _entity = '';
  int _days = 1;
  List<Map<String, dynamic>> _rows = const [];
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final rows = await widget.repository.loadActivity(
        session: widget.session,
        kind: _kind,
        daysBack: _days,
        entityType: _entity,
      );
      if (mounted) setState(() => _rows = rows);
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load activity.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'logs', label: Text('Visits')),
                    ButtonSegment(value: 'summary', label: Text('Summary')),
                    ButtonSegment(
                      value: 'system',
                      label: Text('Rota & Breaks'),
                    ),
                  ],
                  selected: {_kind},
                  onSelectionChanged: (value) {
                    _kind = value.first;
                    _days = _kind == 'system' ? 7 : 1;
                    _load();
                  },
                ),
                if (_kind == 'system')
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          initialValue: _days,
                          decoration: const InputDecoration(labelText: 'Days'),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('1')),
                            DropdownMenuItem(value: 3, child: Text('3')),
                            DropdownMenuItem(value: 7, child: Text('7')),
                            DropdownMenuItem(value: 14, child: Text('14')),
                            DropdownMenuItem(value: 30, child: Text('30')),
                          ],
                          onChanged: (value) {
                            _days = value ?? 7;
                            _load();
                          },
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _entity,
                          decoration: const InputDecoration(labelText: 'Type'),
                          items: const [
                            DropdownMenuItem(value: '', child: Text('All')),
                            DropdownMenuItem(
                              value: 'rota',
                              child: Text('Rota'),
                            ),
                            DropdownMenuItem(
                              value: 'breaks',
                              child: Text('Breaks'),
                            ),
                          ],
                          onChanged: (value) {
                            _entity = value ?? '';
                            _load();
                          },
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.lg,
                      ),
                      itemCount: _rows.length,
                      itemBuilder: (_, index) => _activityRow(_rows[index]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _activityRow(Map<String, dynamic> row) {
    final title = _kind == 'summary'
        ? _name(row)
        : _kind == 'system'
        ? '${row['first_name'] ?? ''} ${row['last_name'] ?? ''} · ${row['action_type'] ?? ''}'
        : '${row['first_name'] ?? ''} ${row['last_name'] ?? ''} · ${row['page_title'] ?? row['page_path'] ?? ''}';
    final subtitle = _kind == 'summary'
        ? '${row['total_page_views'] ?? 0} views · ${row['unique_pages_visited'] ?? 0} unique pages'
        : _kind == 'system'
        ? '${row['entity_type'] ?? ''} · ${row['time_ago'] ?? row['created_at'] ?? ''}\n${row['payload'] ?? ''}'
        : '${row['time_ago'] ?? row['visited_at'] ?? ''}';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        padding: EdgeInsets.zero,
        child: ListTile(title: Text(title.trim()), subtitle: Text(subtitle)),
      ),
    );
  }
}

class InductionAdminScreen extends StatefulWidget {
  const InductionAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<InductionAdminScreen> createState() => _InductionAdminScreenState();
}

class _InductionAdminScreenState extends State<InductionAdminScreen> {
  List<Map<String, dynamic>> _sections = const [];
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final rows = await widget.repository.loadRows(
        widget.session,
        'shunter_induction_sections',
        orderBy: 'sort_order',
        ascending: true,
      );
      if (mounted) setState(() => _sections = rows);
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load induction sections.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Yard Induction')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(),
        icon: const Icon(Icons.add),
        label: const Text('Add section'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ReorderableListView.builder(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.giant,
              ),
              itemCount: _sections.length,
              onReorderItem: _reorder,
              itemBuilder: (_, index) {
                final section = _sections[index];
                return Padding(
                  key: ValueKey(section['id']),
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: AppCard(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: const Icon(Icons.drag_handle),
                      title: Text(section['title']?.toString() ?? 'Untitled'),
                      subtitle: Text(
                        section['is_published'] == true ? 'Published' : 'Draft',
                      ),
                      trailing: PopupMenuButton<String>(
                        onSelected: (action) {
                          if (action == 'edit') _edit(section);
                          if (action == 'delete') _delete(section);
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'edit', child: Text('Edit')),
                          PopupMenuItem(value: 'delete', child: Text('Delete')),
                        ],
                      ),
                      onTap: () => _edit(section),
                    ),
                  ),
                );
              },
            ),
    );
  }

  Future<void> _reorder(int oldIndex, int newIndex) async {
    final next = [..._sections];
    final moved = next.removeAt(oldIndex);
    next.insert(newIndex, moved);
    setState(() => _sections = next);
    try {
      for (var index = 0; index < next.length; index++) {
        await widget.repository.saveRow(
          session: widget.session,
          table: 'shunter_induction_sections',
          id: next[index]['id'].toString(),
          payload: {'sort_order': (index + 1) * 10},
        );
      }
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not reorder sections.');
      await _load();
    }
  }

  Future<void> _edit([Map<String, dynamic>? section]) async {
    final title = TextEditingController(text: section?['title']?.toString());
    final body = TextEditingController(
      text: section?['body_markdown']?.toString(),
    );
    var published = section?['is_published'] == true;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, update) => AlertDialog(
          title: Text(section == null ? 'Add section' : 'Edit section'),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppTextField(controller: title, label: 'Title'),
                  const SizedBox(height: AppSpacing.sm),
                  AppTextField(
                    controller: body,
                    label: 'Body (Markdown)',
                    maxLines: 12,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Published'),
                    value: published,
                    onChanged: (value) => update(() => published = value),
                  ),
                  AppButton(
                    label: 'Insert image',
                    variant: AppButtonVariant.secondary,
                    onPressed: () async {
                      final image = await ImagePicker().pickImage(
                        source: ImageSource.gallery,
                        maxWidth: 1800,
                        imageQuality: 85,
                      );
                      if (image == null) return;
                      final bytes = await image.readAsBytes();
                      if (bytes.length > 5 * 1024 * 1024) {
                        if (dialogContext.mounted) {
                          AppToast.show(
                            dialogContext,
                            'Image must be 5 MB or smaller.',
                          );
                        }
                        return;
                      }
                      try {
                        final url = await widget.repository
                            .uploadInductionImage(
                              session: widget.session,
                              bytes: bytes,
                              extension: image.name.split('.').last,
                            );
                        body.text +=
                            '\n\n![${title.text.trim().isEmpty ? 'Guide image' : title.text.trim()}]($url)\n\n';
                      } catch (_) {
                        if (dialogContext.mounted) {
                          AppToast.show(dialogContext, 'Image upload failed.');
                        }
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                if (title.text.trim().isEmpty) {
                  AppToast.show(dialogContext, 'Title is required.');
                  return;
                }
                try {
                  await widget.repository.saveRow(
                    session: widget.session,
                    table: 'shunter_induction_sections',
                    id: section?['id']?.toString(),
                    payload: {
                      'title': title.text.trim(),
                      'body_markdown': body.text,
                      'is_published': published,
                      if (section == null)
                        'sort_order': (_sections.length + 1) * 10,
                    },
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext, true);
                } catch (_) {
                  if (dialogContext.mounted) {
                    AppToast.show(dialogContext, 'Could not save section.');
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    title.dispose();
    body.dispose();
    if (saved == true) await _load();
  }

  Future<void> _delete(Map<String, dynamic> section) async {
    try {
      await widget.repository.deleteRow(
        widget.session,
        'shunter_induction_sections',
        section['id'].toString(),
      );
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete section.');
    }
  }
}

class AwardsAdminScreen extends StatefulWidget {
  const AwardsAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<AwardsAdminScreen> createState() => _AwardsAdminScreenState();
}

class _AwardsAdminScreenState extends State<AwardsAdminScreen> {
  List<Map<String, dynamic>> _users = const [];
  List<Map<String, dynamic>> _awards = const [];
  String? _day;
  String? _night;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _month {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final result = await Future.wait([
        widget.repository.loadRows(
          widget.session,
          'profiles',
          select: 'id,first_name,last_name,shift_preference,is_active',
          orderBy: 'last_name',
          ascending: true,
        ),
        widget.repository.loadRows(
          widget.session,
          'monthly_shunter_awards',
          select:
              'id,user_id,award_month,period,amount,awarded_at,profiles:user_id(first_name,last_name)',
          orderBy: 'award_month',
        ),
      ]);
      final awards = result[1];
      if (!mounted) return;
      setState(() {
        _users = result[0].where((row) => row['is_active'] != false).toList();
        _awards = awards;
        _day = awards
            .where(
              (row) =>
                  row['award_month']?.toString() == _month &&
                  row['period'] == 'day',
            )
            .firstOrNull?['user_id']
            ?.toString();
        _night = awards
            .where(
              (row) =>
                  row['award_month']?.toString() == _month &&
                  row['period'] == 'night',
            )
            .firstOrNull?['user_id']
            ?.toString();
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load awards.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Shunter of the Month')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Text(
                  _month.substring(0, 7),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: AppSpacing.md),
                _winner('Day winner', 'day', _day),
                const SizedBox(height: AppSpacing.md),
                _winner('Night / Afternoon winner', 'night', _night),
                const SizedBox(height: AppSpacing.xxl),
                Text('History', style: Theme.of(context).textTheme.titleMedium),
                for (final award in _awards)
                  ListTile(
                    title: Text(
                      '${award['award_month']?.toString().substring(0, 7) ?? ''} · ${award['period']}',
                    ),
                    subtitle: Text(_name(award['profiles'])),
                    trailing: IconButton(
                      tooltip: 'Delete',
                      onPressed: () => _deleteAward(award),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _winner(String label, String period, String? selected) {
    final eligible = _users.where((user) {
      final shift = user['shift_preference']?.toString() ?? '';
      return period == 'day'
          ? shift.isEmpty || shift == 'day'
          : shift.isEmpty || shift == 'night' || shift == 'afternoon';
    }).toList();
    return AppCard(
      child: Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: selected,
            decoration: InputDecoration(labelText: label),
            items: [
              for (final user in eligible)
                DropdownMenuItem(
                  value: user['id'].toString(),
                  child: Text(_name(user)),
                ),
            ],
            onChanged: (value) => setState(() {
              if (period == 'day') {
                _day = value;
              } else {
                _night = value;
              }
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: 'Save $label',
            onPressed:
                selected == null && (period == 'day' ? _day : _night) == null
                ? null
                : () => _saveAward(period),
          ),
        ],
      ),
    );
  }

  Future<void> _saveAward(String period) async {
    final userId = period == 'day' ? _day : _night;
    if (userId == null) return;
    try {
      await widget.repository.saveRow(
        session: widget.session,
        table: 'monthly_shunter_awards',
        payload: {
          'user_id': userId,
          'award_month': _month,
          'period': period,
          'amount': 50,
          'awarded_by': widget.session.userId,
        },
      );
      if (mounted) AppToast.show(context, 'Award saved.');
      await _load();
    } catch (_) {
      // Fall back to update if the month/period unique row already exists.
      final current = _awards
          .where(
            (row) => row['award_month'] == _month && row['period'] == period,
          )
          .firstOrNull;
      if (current != null) {
        await widget.repository.saveRow(
          session: widget.session,
          table: 'monthly_shunter_awards',
          id: current['id'].toString(),
          payload: {'user_id': userId, 'awarded_by': widget.session.userId},
        );
        await _load();
      } else if (mounted) {
        AppToast.show(context, 'Could not save award.');
      }
    }
  }

  Future<void> _deleteAward(Map<String, dynamic> award) async {
    try {
      await widget.repository.deleteRow(
        widget.session,
        'monthly_shunter_awards',
        award['id'].toString(),
      );
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete award.');
    }
  }
}

class SettingsAdminScreen extends StatefulWidget {
  const SettingsAdminScreen({
    super.key,
    required this.repository,
    required this.session,
  });
  final StageThreeRepository repository;
  final UserSession session;
  @override
  State<SettingsAdminScreen> createState() => _SettingsAdminScreenState();
}

class _SettingsAdminScreenState extends State<SettingsAdminScreen> {
  List<Map<String, dynamic>> _locations = const [];
  List<Map<String, dynamic>> _agencies = const [];
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
        widget.repository.loadRows(
          widget.session,
          'locations',
          orderBy: 'name',
          ascending: true,
        ),
        widget.repository.loadRows(
          widget.session,
          'agencies',
          orderBy: 'name',
          ascending: true,
        ),
        widget.repository.loadSettings(widget.session, const [
          'show_manage_breaks_button',
          'enforce_max_consecutive_work_days',
          'max_consecutive_work_days',
        ]),
      ]);
      if (!mounted) return;
      setState(() {
        _locations = result[0] as List<Map<String, dynamic>>;
        _agencies = result[1] as List<Map<String, dynamic>>;
        _settings = result[2] as Map<String, String>;
      });
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load settings.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  _sectionHeader('Locations', () => _editLocation()),
                  for (final row in _locations)
                    _entityTile(
                      row,
                      subtitle: row['is_active'] == false
                          ? 'Inactive'
                          : 'Active',
                      onEdit: () => _editLocation(row),
                      onToggle: () => _toggleEntity('locations', row),
                    ),
                  const SizedBox(height: AppSpacing.xxl),
                  _sectionHeader('Agencies and contacts', () => _editAgency()),
                  for (final row in _agencies)
                    _entityTile(
                      row,
                      subtitle:
                          [
                                row['contact_person'],
                                row['email'],
                                row['phone_number'],
                              ]
                              .where(
                                (item) => item?.toString().isNotEmpty == true,
                              )
                              .join(' · '),
                      onEdit: () => _editAgency(row),
                      onToggle: () => _toggleEntity('agencies', row),
                    ),
                  const SizedBox(height: AppSpacing.xxl),
                  Text(
                    'Home and rota policy',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Show Manage my breaks'),
                    value: _settings['show_manage_breaks_button'] != 'false',
                    onChanged: (value) =>
                        _saveSetting('show_manage_breaks_button', value),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Enforce max consecutive work days'),
                    value:
                        _settings['enforce_max_consecutive_work_days'] ==
                        'true',
                    onChanged: (value) => _saveSetting(
                      'enforce_max_consecutive_work_days',
                      value,
                    ),
                  ),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Maximum consecutive days'),
                    subtitle: Text(
                      '${parseMaximumConsecutiveDays(_settings['max_consecutive_work_days'])}',
                    ),
                    trailing: const Icon(Icons.edit_outlined),
                    onTap: _editMaxDays,
                  ),
                ],
              ),
            ),
    );
  }

  Widget _sectionHeader(String title, VoidCallback onAdd) => Row(
    children: [
      Expanded(
        child: Text(title, style: Theme.of(context).textTheme.titleMedium),
      ),
      IconButton(onPressed: onAdd, icon: const Icon(Icons.add)),
    ],
  );

  Widget _entityTile(
    Map<String, dynamic> row, {
    required String subtitle,
    required VoidCallback onEdit,
    required VoidCallback onToggle,
  }) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(row['name']?.toString() ?? ''),
    subtitle: subtitle.isEmpty ? null : Text(subtitle),
    trailing: PopupMenuButton<String>(
      onSelected: (value) => value == 'edit' ? onEdit() : onToggle(),
      itemBuilder: (_) => [
        const PopupMenuItem(value: 'edit', child: Text('Edit')),
        PopupMenuItem(
          value: 'toggle',
          child: Text(row['is_active'] == false ? 'Activate' : 'Deactivate'),
        ),
      ],
    ),
  );

  Future<void> _editLocation([Map<String, dynamic>? row]) async {
    final name = TextEditingController(text: row?['name']?.toString());
    final saved = await _simpleEntityDialog(
      title: row == null ? 'Add location' : 'Edit location',
      fields: [AppTextField(controller: name, label: 'Name')],
      onSave: () => widget.repository.saveRow(
        session: widget.session,
        table: 'locations',
        id: row?['id']?.toString(),
        payload: {'name': name.text.trim(), if (row == null) 'is_active': true},
      ),
    );
    name.dispose();
    if (saved) await _load();
  }

  Future<void> _editAgency([Map<String, dynamic>? row]) async {
    final name = TextEditingController(text: row?['name']?.toString());
    final email = TextEditingController(text: row?['email']?.toString());
    final contact = TextEditingController(
      text: row?['contact_person']?.toString(),
    );
    final phone = TextEditingController(text: row?['phone_number']?.toString());
    final saved = await _simpleEntityDialog(
      title: row == null ? 'Add agency' : 'Edit agency',
      fields: [
        AppTextField(controller: name, label: 'Agency name'),
        AppTextField(
          controller: email,
          label: 'Email',
          keyboardType: TextInputType.emailAddress,
        ),
        AppTextField(controller: contact, label: 'Manager contact'),
        AppTextField(
          controller: phone,
          label: 'Phone number',
          keyboardType: TextInputType.phone,
        ),
      ],
      onSave: () => widget.repository.saveRow(
        session: widget.session,
        table: 'agencies',
        id: row?['id']?.toString(),
        payload: {
          'name': name.text.trim(),
          'email': email.text.trim(),
          'contact_person': contact.text.trim(),
          'phone_number': phone.text.trim(),
          if (row == null) 'is_active': true,
        },
      ),
    );
    name.dispose();
    email.dispose();
    contact.dispose();
    phone.dispose();
    if (saved) await _load();
  }

  Future<bool> _simpleEntityDialog({
    required String title,
    required List<Widget> fields,
    required Future<void> Function() onSave,
  }) async {
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var index = 0; index < fields.length; index++) ...[
                    fields[index],
                    if (index < fields.length - 1)
                      const SizedBox(height: AppSpacing.sm),
                  ],
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
                    await onSave();
                    if (dialogContext.mounted) {
                      Navigator.pop(dialogContext, true);
                    }
                  } catch (_) {
                    if (dialogContext.mounted) {
                      AppToast.show(dialogContext, 'Could not save changes.');
                    }
                  }
                },
                child: const Text('Save'),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _toggleEntity(String table, Map<String, dynamic> row) async {
    try {
      await widget.repository.saveRow(
        session: widget.session,
        table: table,
        id: row['id'].toString(),
        payload: {'is_active': row['is_active'] == false},
      );
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not update status.');
    }
  }

  Future<void> _saveSetting(String key, Object value) async {
    try {
      await widget.repository.saveSetting(widget.session, key, value);
      setState(() => _settings = {..._settings, key: value.toString()});
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not save setting.');
    }
  }

  Future<void> _editMaxDays() async {
    final controller = TextEditingController(
      text:
          '${parseMaximumConsecutiveDays(_settings['max_consecutive_work_days'])}',
    );
    final saved = await _simpleEntityDialog(
      title: 'Maximum consecutive work days',
      fields: [
        AppTextField(
          controller: controller,
          label: 'Days (1–13)',
          keyboardType: TextInputType.number,
        ),
      ],
      onSave: () => widget.repository.saveSetting(
        widget.session,
        'max_consecutive_work_days',
        parseMaximumConsecutiveDays(controller.text),
      ),
    );
    controller.dispose();
    if (saved) await _load();
  }
}

String _name(Object? row) {
  if (row is! Map) return 'Unknown';
  final name = '${row['first_name'] ?? ''} ${row['last_name'] ?? ''}'.trim();
  return name.isEmpty ? 'Unknown' : name;
}

String _ymd(DateTime value) =>
    '${value.year.toString().padLeft(4, '0')}-'
    '${value.month.toString().padLeft(2, '0')}-'
    '${value.day.toString().padLeft(2, '0')}';
