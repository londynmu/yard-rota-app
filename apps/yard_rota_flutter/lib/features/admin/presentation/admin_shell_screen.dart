import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../break_manager/presentation/break_manager_screen.dart';
import '../../rota_planner/presentation/rota_planner_screen.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../transport/presentation/transport_shell.dart';
import '../../vmu/presentation/vmu_shell_screen.dart';
import 'admin_operations_screens.dart';
import 'admin_users_screen.dart';
import 'availability_manager_screen.dart';
import 'fleet_admin_screen.dart';

enum AdminTopArea { management, vmu, transport }

enum AdminSection {
  users,
  approvals,
  availability,
  rota,
  breaks,
  fleet,
  checkItems,
  attendance,
  performance,
  activity,
  induction,
  awards,
  settings,
}

List<AdminSection> adminSectionsForSession(UserSession session) =>
    session.isAdmin ? AdminSection.values : const <AdminSection>[];

class AdminShellScreen extends StatefulWidget {
  const AdminShellScreen({
    super.key,
    required this.repository,
    required this.stageThreeRepository,
    required this.session,
    this.initialArea = AdminTopArea.management,
  });

  final StageTwoRepository repository;
  final StageThreeRepository stageThreeRepository;
  final UserSession session;
  final AdminTopArea initialArea;

  @override
  State<AdminShellScreen> createState() => _AdminShellScreenState();
}

class _AdminShellScreenState extends State<AdminShellScreen> {
  late AdminTopArea _area = widget.initialArea;

  Widget _areaSwitcher() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSpacing.sm,
      ),
      child: SegmentedButton<AdminTopArea>(
        segments: const [
          ButtonSegment(
            value: AdminTopArea.management,
            label: Text('Management'),
            icon: Icon(Icons.tune_outlined),
          ),
          ButtonSegment(
            value: AdminTopArea.vmu,
            label: Text('VMU'),
            icon: Icon(Icons.build_outlined),
          ),
          ButtonSegment(
            value: AdminTopArea.transport,
            label: Text('Transport'),
            icon: Icon(Icons.local_shipping_outlined),
          ),
        ],
        selected: {_area},
        onSelectionChanged: (value) => setState(() => _area = value.first),
        style: const ButtonStyle(
          visualDensity: VisualDensity.compact,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.session.isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin')),
        body: const Center(child: Text('Administrative privileges required.')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(switch (_area) {
          AdminTopArea.management => 'Admin',
          AdminTopArea.vmu => 'VMU',
          AdminTopArea.transport => 'Transport Dashboard',
        }),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: _areaSwitcher(),
        ),
      ),
      body: switch (_area) {
        AdminTopArea.management => _ManagementList(
          repository: widget.repository,
          stageThreeRepository: widget.stageThreeRepository,
          session: widget.session,
        ),
        AdminTopArea.vmu => VmuShellScreen(
          repository: widget.stageThreeRepository,
          session: widget.session,
          initialSection: VmuSection.defects,
        ),
        AdminTopArea.transport => TransportShell(
          session: widget.session,
          hideAppBar: true,
        ),
      },
    );
  }
}

class _ManagementList extends StatelessWidget {
  const _ManagementList({
    required this.repository,
    required this.stageThreeRepository,
    required this.session,
  });

  final StageTwoRepository repository;
  final StageThreeRepository stageThreeRepository;
  final UserSession session;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          'Management',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final section in adminSectionsForSession(session))
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: AppCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: Icon(_icon(section)),
                title: Text(_label(section)),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => _open(context, section),
              ),
            ),
          ),
      ],
    );
  }

  String _label(AdminSection section) => switch (section) {
    AdminSection.users => 'Users',
    AdminSection.approvals => 'Pending approvals',
    AdminSection.availability => 'Availability',
    AdminSection.rota => 'Rota Planner',
    AdminSection.breaks => 'Break Manager',
    AdminSection.fleet => 'Tugs and Tablets',
    AdminSection.checkItems => 'Check Items',
    AdminSection.attendance => 'Attendance',
    AdminSection.performance => 'Performance Import',
    AdminSection.activity => 'Activity',
    AdminSection.induction => 'Yard Induction',
    AdminSection.awards => 'Shunter of the Month',
    AdminSection.settings => 'Settings',
  };

  IconData _icon(AdminSection section) => switch (section) {
    AdminSection.users => Icons.group_outlined,
    AdminSection.approvals => Icons.how_to_reg_outlined,
    AdminSection.availability => Icons.event_available_outlined,
    AdminSection.rota => Icons.calendar_view_week_outlined,
    AdminSection.breaks => Icons.free_breakfast_outlined,
    AdminSection.fleet => Icons.local_shipping_outlined,
    AdminSection.checkItems => Icons.checklist_outlined,
    AdminSection.attendance => Icons.report_problem_outlined,
    AdminSection.performance => Icons.upload_file_outlined,
    AdminSection.activity => Icons.history_outlined,
    AdminSection.induction => Icons.menu_book_outlined,
    AdminSection.awards => Icons.emoji_events_outlined,
    AdminSection.settings => Icons.settings_outlined,
  };

  Future<void> _open(BuildContext context, AdminSection section) async {
    if (!session.isAdmin) {
      AppToast.warning(context, 'Administrative privileges required.');
      return;
    }
    final screen = switch (section) {
      AdminSection.users => AdminUsersScreen(
        repository: repository,
        session: session,
        approvalsOnly: false,
      ),
      AdminSection.approvals => AdminUsersScreen(
        repository: repository,
        session: session,
        approvalsOnly: true,
      ),
      AdminSection.availability => AvailabilityManagerScreen(
        repository: repository,
        session: session,
      ),
      AdminSection.rota => RotaPlannerScreen(
        repository: repository,
        session: session,
      ),
      AdminSection.breaks => BreakManagerScreen(
        repository: repository,
        session: session,
      ),
      AdminSection.fleet => FleetAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.checkItems => CheckItemsAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.attendance => AttendanceIssuesScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.performance => PerformanceImportScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.activity => ActivityAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.induction => InductionAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.awards => AwardsAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
      AdminSection.settings => SettingsAdminScreen(
        repository: stageThreeRepository,
        session: session,
      ),
    };
    await Navigator.of(
      context,
    ).push<void>(MaterialPageRoute<void>(builder: (_) => screen));
  }
}
