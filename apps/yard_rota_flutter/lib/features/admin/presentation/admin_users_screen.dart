import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/network/my_rota_models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_text_field.dart';
import '../../../core/ui/app_toast.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../stage_two/domain/stage_two_models.dart';

class AdminUsersScreen extends StatefulWidget {
  const AdminUsersScreen({
    super.key,
    required this.repository,
    required this.session,
    required this.approvalsOnly,
  });

  final StageTwoRepository repository;
  final UserSession session;
  final bool approvalsOnly;

  @override
  State<AdminUsersScreen> createState() => _AdminUsersScreenState();
}

class _AdminUsersScreenState extends State<AdminUsersScreen> {
  List<StaffProfile> _users = const [];
  bool _loading = true;
  String _query = '';
  String _shift = 'all';
  String _sort = 'name';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final users = widget.approvalsOnly
          ? await widget.repository.loadPendingUsers(widget.session)
          : await widget.repository.loadUsers(widget.session);
      if (mounted) setState(() => _users = users);
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not load users.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<StaffProfile> get _visible {
    final query = _query.trim().toLowerCase();
    final rows = _users
        .where(
          (user) =>
              (_shift == 'all' || user.shift == _shift) &&
              (query.isEmpty ||
                  user.displayName.toLowerCase().contains(query) ||
                  user.yardSystemId?.toLowerCase().contains(query) == true),
        )
        .toList();
    rows.sort((a, b) {
      if (_sort == 'shift') {
        final compared = a.shift.compareTo(b.shift);
        if (compared != 0) return compared;
      }
      if (_sort == 'lastLogin') {
        return (b.lastLogin ?? DateTime(1970)).compareTo(
          a.lastLogin ?? DateTime(1970),
        );
      }
      return a.displayName.compareTo(b.displayName);
    });
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.approvalsOnly ? 'Pending approvals' : 'Users'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            if (!widget.approvalsOnly) ...[
              AppTextField(
                label: 'Search by name or Yard System ID',
                onChanged: (value) => setState(() => _query = value),
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _shift,
                      decoration: const InputDecoration(labelText: 'Shift'),
                      items: const [
                        DropdownMenuItem(
                          value: 'all',
                          child: Text('All shifts'),
                        ),
                        DropdownMenuItem(value: 'day', child: Text('Day')),
                        DropdownMenuItem(
                          value: 'afternoon',
                          child: Text('Afternoon'),
                        ),
                        DropdownMenuItem(value: 'night', child: Text('Night')),
                      ],
                      onChanged: (value) =>
                          setState(() => _shift = value ?? 'all'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _sort,
                      decoration: const InputDecoration(labelText: 'Sort'),
                      items: const [
                        DropdownMenuItem(value: 'name', child: Text('Name')),
                        DropdownMenuItem(value: 'shift', child: Text('Shift')),
                        DropdownMenuItem(
                          value: 'lastLogin',
                          child: Text('Last login'),
                        ),
                      ],
                      onChanged: (value) =>
                          setState(() => _sort = value ?? 'name'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_visible.isEmpty)
              AppCard(
                child: Text(
                  widget.approvalsOnly
                      ? 'No pending approvals'
                      : 'No users match these filters.',
                ),
              )
            else
              for (final user in _visible)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _UserCard(
                    user: user,
                    approvalsOnly: widget.approvalsOnly,
                    onApprove: () => _setApproval(user, AccountStatus.approved),
                    onReject: () => _setApproval(user, AccountStatus.rejected),
                    onEdit: () => _edit(user),
                    onViolation: () => _addViolation(user),
                    onDeactivate: () => _deactivate(user),
                    onDelete: () => _delete(user),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _setApproval(StaffProfile user, AccountStatus status) async {
    try {
      await widget.repository.setAccountStatus(widget.session, user.id, status);
      if (!mounted) return;
      AppToast.show(
        context,
        status == AccountStatus.approved ? 'User approved.' : 'User rejected.',
      );
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not update approval.');
    }
  }

  Future<void> _edit(StaffProfile user) async {
    final update = await showDialog<AdminProfileUpdate>(
      context: context,
      builder: (_) =>
          _EditUserDialog(user: user, repository: widget.repository),
    );
    if (update == null) return;
    try {
      await widget.repository.updateUser(widget.session, user.id, update);
      if (mounted) AppToast.show(context, 'Profile updated.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not update profile.');
    }
  }

  Future<void> _addViolation(StaffProfile user) async {
    final controller = TextEditingController();
    final body = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Add violation — ${user.displayName}'),
        content: AppTextField(
          controller: controller,
          label: 'Violation details',
          maxLines: 4,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          OutlinedButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (body == null || body.trim().isEmpty) return;
    try {
      await widget.repository.addViolation(
        session: widget.session,
        userId: user.id,
        body: body,
      );
      if (mounted) AppToast.show(context, 'Violation added.');
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not add violation.');
    }
  }

  Future<bool> _confirm(String title, String body) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            OutlinedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ) ??
      false;

  Future<void> _deactivate(StaffProfile user) async {
    if (!await _confirm('Deactivate user', 'Deactivate ${user.displayName}?')) {
      return;
    }
    await widget.repository.deactivateUser(widget.session, user.id);
    if (mounted) AppToast.show(context, 'User deactivated.');
    await _load();
  }

  Future<void> _delete(StaffProfile user) async {
    if (!await _confirm(
      'Delete user',
      'Permanently delete ${user.displayName}? This cannot be undone.',
    )) {
      return;
    }
    try {
      await widget.repository.deleteUser(widget.session, user.id);
      if (mounted) AppToast.show(context, 'User deleted.');
      await _load();
    } catch (_) {
      if (mounted) AppToast.show(context, 'Could not delete user.');
    }
  }
}

class _UserCard extends StatelessWidget {
  const _UserCard({
    required this.user,
    required this.approvalsOnly,
    required this.onApprove,
    required this.onReject,
    required this.onEdit,
    required this.onViolation,
    required this.onDeactivate,
    required this.onDelete,
  });

  final StaffProfile user;
  final bool approvalsOnly;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback onEdit;
  final VoidCallback onViolation;
  final VoidCallback onDeactivate;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            user.displayName,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          Text(
            '${user.role.label} · ${user.shift} · ${user.agencyName ?? 'No agency'}',
          ),
          Text('Yard ID: ${user.yardSystemId ?? '—'}'),
          Text(
            'Last login: ${user.lastLogin?.toLocal().toString().substring(0, 16) ?? 'Never'}',
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: approvalsOnly
                ? [
                    OutlinedButton(
                      onPressed: onApprove,
                      child: const Text('Approve'),
                    ),
                    OutlinedButton(
                      onPressed: onReject,
                      child: const Text('Reject'),
                    ),
                  ]
                : [
                    OutlinedButton(
                      onPressed: onEdit,
                      child: const Text('Edit'),
                    ),
                    OutlinedButton(
                      onPressed: onViolation,
                      child: const Text('Add violation'),
                    ),
                    OutlinedButton(
                      onPressed: onDeactivate,
                      child: const Text('Deactivate'),
                    ),
                    OutlinedButton(
                      onPressed: onDelete,
                      child: const Text('Delete'),
                    ),
                  ],
          ),
        ],
      ),
    );
  }
}

class _EditUserDialog extends StatefulWidget {
  const _EditUserDialog({required this.user, required this.repository});
  final StaffProfile user;
  final StageTwoRepository repository;

  @override
  State<_EditUserDialog> createState() => _EditUserDialogState();
}

class _EditUserDialogState extends State<_EditUserDialog> {
  late final TextEditingController _first;
  late final TextEditingController _last;
  late final TextEditingController _yardId;
  late final TextEditingController _start;
  late String _shift;
  late UserRole _role;
  late bool _active;
  String? _agency;
  String? _location;
  List<AgencyOption> _agencies = const [];
  List<LocationOption> _locations = const [];

  @override
  void initState() {
    super.initState();
    final user = widget.user;
    _first = TextEditingController(text: user.firstName);
    _last = TextEditingController(text: user.lastName);
    _yardId = TextEditingController(text: user.yardSystemId);
    _start = TextEditingController(text: user.customStartTime);
    _shift = user.shift;
    _role = user.role;
    _active = user.isActive;
    _agency = user.agencyId;
    _location = user.preferredLocation;
    Future.wait([
      widget.repository.loadAgencies(),
      widget.repository.loadLocations(),
    ]).then((values) {
      if (!mounted) return;
      setState(() {
        _agencies = values[0] as List<AgencyOption>;
        _locations = values[1] as List<LocationOption>;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit user profile'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppTextField(controller: _first, label: 'First name'),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(controller: _last, label: 'Last name'),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(controller: _yardId, label: 'Yard System ID'),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String>(
                initialValue: _shift,
                decoration: const InputDecoration(labelText: 'Shift'),
                items: const [
                  DropdownMenuItem(value: 'day', child: Text('Day')),
                  DropdownMenuItem(
                    value: 'afternoon',
                    child: Text('Afternoon'),
                  ),
                  DropdownMenuItem(value: 'night', child: Text('Night')),
                ],
                onChanged: (value) => setState(() => _shift = value ?? _shift),
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<UserRole>(
                initialValue: _role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: UserRole.values
                    .map(
                      (role) => DropdownMenuItem(
                        value: role,
                        child: Text(role.label),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _role = value ?? _role),
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String?>(
                initialValue: _agency,
                decoration: const InputDecoration(labelText: 'Agency'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('None')),
                  ..._agencies.map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text(item.name),
                    ),
                  ),
                ],
                onChanged: (value) => setState(() => _agency = value),
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String?>(
                initialValue: _location,
                decoration: const InputDecoration(
                  labelText: 'Preferred location',
                ),
                items: [
                  const DropdownMenuItem(
                    value: null,
                    child: Text('No preference'),
                  ),
                  ..._locations.map(
                    (item) => DropdownMenuItem(
                      value: item.name,
                      child: Text(item.name),
                    ),
                  ),
                ],
                onChanged: (value) => setState(() => _location = value),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(controller: _start, label: 'Start time (HH:mm)'),
              SwitchListTile(
                value: _active,
                title: const Text('Active'),
                contentPadding: EdgeInsets.zero,
                onChanged: (value) => setState(() => _active = value),
              ),
            ],
          ),
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
            AdminProfileUpdate(
              firstName: _first.text,
              lastName: _last.text,
              yardSystemId: _yardId.text,
              agencyId: _agency,
              shift: _shift,
              role: _role,
              isActive: _active,
              preferredLocation: _location,
              customStartTime: _start.text,
            ),
          ),
          child: const Text('Save'),
        ),
      ],
    );
  }
}
