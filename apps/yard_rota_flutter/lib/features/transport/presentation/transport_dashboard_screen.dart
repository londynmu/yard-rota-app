import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../data/transport_dashboard_repository.dart';
import 'transport_shell.dart';

/// Entry point for Transport Dashboard (Today | Rota | Breaks).
///
/// [repository] is kept for call-site compatibility; the shell uses
/// [TransportDashboardRepository] against the same Supabase project.
class TransportDashboardScreen extends StatelessWidget {
  const TransportDashboardScreen({
    super.key,
    required this.repository,
    required this.session,
    this.dashboardRepository,
    this.initialTab = TransportShellTab.today,
  });

  final StageTwoRepository repository;
  final UserSession session;
  final TransportDashboardRepository? dashboardRepository;
  final TransportShellTab initialTab;

  @override
  Widget build(BuildContext context) {
    return TransportDashboardEntry(
      repository: repository,
      session: session,
      dashboardRepository: dashboardRepository,
      initialTab: initialTab,
    );
  }
}
