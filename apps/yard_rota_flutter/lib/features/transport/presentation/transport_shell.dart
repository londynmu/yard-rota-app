import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/theme_extensions.dart';
import '../../../core/ui/shell_bottom_nav.dart';
import '../../stage_two/data/stage_two_repository.dart';
import '../data/transport_dashboard_repository.dart';
import 'transport_breaks_live_screen.dart';
import 'transport_rota_screen.dart';
import 'transport_today_screen.dart';

enum TransportShellTab { today, rota, breaks }

/// Shared Transport Dashboard shell for `transport_manager` and `admin`.
class TransportShell extends StatefulWidget {
  const TransportShell({
    super.key,
    required this.session,
    this.dashboardRepository,
    this.initialTab = TransportShellTab.today,
    this.hideAppBar = false,
  });

  final UserSession session;
  final TransportDashboardRepository? dashboardRepository;
  final TransportShellTab initialTab;

  /// When true (e.g. under Admin top areas), parent owns the top chrome.
  final bool hideAppBar;

  @override
  State<TransportShell> createState() => _TransportShellState();
}

class _TransportShellState extends State<TransportShell> {
  late int _index = widget.initialTab.index;

  static const _titles = ['Today', 'Rota', 'Breaks'];

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Scaffold(
      backgroundColor: colors.bgPrimary,
      appBar: widget.hideAppBar
          ? null
          : AppBar(title: Text(_titles[_index])),
      body: IndexedStack(
        index: _index,
        children: [
          TransportTodayScreen(
            session: widget.session,
            dashboardRepository: widget.dashboardRepository,
            embedded: true,
            onOpenRota: () => setState(() => _index = TransportShellTab.rota.index),
            onOpenBreaks: () =>
                setState(() => _index = TransportShellTab.breaks.index),
          ),
          TransportRotaScreen(
            session: widget.session,
            dashboardRepository: widget.dashboardRepository,
            embedded: true,
          ),
          TransportBreaksLiveScreen(
            session: widget.session,
            dashboardRepository: widget.dashboardRepository,
            embedded: true,
          ),
        ],
      ),
      bottomNavigationBar: ShellBottomNavBar(
        destinations: const [
          ShellBottomNavDestination(
            label: 'Today',
            icon: Icons.today_outlined,
          ),
          ShellBottomNavDestination(
            label: 'Rota',
            icon: Icons.calendar_view_day_outlined,
          ),
          ShellBottomNavDestination(
            label: 'Breaks',
            icon: Icons.free_breakfast_outlined,
          ),
        ],
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
      ),
    );
  }
}

/// Gate + shell entry used from hub / admin / account menu.
class TransportDashboardEntry extends StatelessWidget {
  const TransportDashboardEntry({
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
    try {
      repository.requireTransportRead(session);
    } on StageTwoAuthorizationException {
      return Scaffold(
        appBar: AppBar(title: const Text('Transport Dashboard')),
        body: const Center(
          child: Text('Transport dashboard access is required.'),
        ),
      );
    }

    return TransportShell(
      session: session,
      dashboardRepository: dashboardRepository,
      initialTab: initialTab,
    );
  }
}
