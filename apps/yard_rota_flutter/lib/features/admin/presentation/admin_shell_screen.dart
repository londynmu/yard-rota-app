import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_card.dart';
import '../../../core/ui/app_toast.dart';
import '../../break_manager/presentation/break_manager_screen.dart';
import '../../rota_planner/presentation/rota_planner_screen.dart';
import '../../stage_three/data/stage_three_repository.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../../vmu/presentation/vmu_shell_screen.dart';
import 'admin_operations_screens.dart';
import 'admin_users_screen.dart';
import 'availability_manager_screen.dart';
import 'fleet_admin_screen.dart';

enum AdminSection {
  users,
  approvals,
  availability,
  rota,
  breaks,
  vmu,
  preChecks,
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

class AdminShellScreen extends StatelessWidget {
  const AdminShellScreen({
    super.key,
    required this.repository,
    required this.stageThreeRepository,
    required this.session,
  });

  final StageTwoRepository repository;
  final StageThreeRepository stageThreeRepository;
  final UserSession session;

  @override
  Widget build(BuildContext context) {
    if (!session.isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin')),
        body: const Center(child: Text('Administrative privileges required.')),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Text(
            'Dashboard',
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
      ),
    );
  }

  String _label(AdminSection section) => switch (section) {
    AdminSection.users => 'Users',
    AdminSection.approvals => 'Pending approvals',
    AdminSection.availability => 'Availability',
    AdminSection.rota => 'Rota Planner',
    AdminSection.breaks => 'Break Manager',
    AdminSection.vmu => 'VMU Defects',
    AdminSection.preChecks => 'Admin PreChecks',
    AdminSection.fleet => 'Tugs and Tablets',
    AdminSection.checkItems => 'Check Items',
    AdminSection.attendance => 'Black list',
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
    AdminSection.vmu => Icons.build_circle_outlined,
    AdminSection.preChecks => Icons.fact_check_outlined,
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
      AppToast.show(context, 'Administrative privileges required.');
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
      AdminSection.vmu => VmuShellScreen(
        repository: stageThreeRepository,
        session: session,
        initialSection: VmuSection.defects,
      ),
      AdminSection.preChecks => VmuShellScreen(
        repository: stageThreeRepository,
        session: session,
        initialSection: VmuSection.preChecks,
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
