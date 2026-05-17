import 'package:flutter/material.dart';

import '../../../core/network/models.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/ui/app_scaffold.dart';
import '../../breaks/presentation/breaks_screen.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../today/presentation/today_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.session,
    required this.shift,
    required this.breaks,
    required this.notifications,
    required this.onLogout,
  });

  final UserSession session;
  final ShiftOverview shift;
  final List<BreakItem> breaks;
  final List<NotificationItem> notifications;
  final VoidCallback onLogout;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      TodayScreen(shift: widget.shift),
      BreaksScreen(breaks: widget.breaks),
      NotificationsScreen(notifications: widget.notifications),
    ];

    final titles = ['Today', 'Breaks', 'Notifications'];

    return AppScaffold(
      title: '${titles[_tabIndex]} • ${widget.session.displayName}',
      actions: [
        IconButton(
          tooltip: 'Sign out',
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout),
        ),
      ],
      body: pages[_tabIndex],
      bottomNavigationBar: SizedBox(
        height: AppComponentTokens.bottomNavHeight,
        child: BottomNavigationBar(
          currentIndex: _tabIndex,
          onTap: (value) {
            setState(() {
              _tabIndex = value;
            });
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.today_outlined),
              activeIcon: Icon(Icons.today),
              label: 'Today',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.coffee_outlined),
              activeIcon: Icon(Icons.coffee),
              label: 'Breaks',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.notifications_outlined),
              activeIcon: Icon(Icons.notifications),
              label: 'Alerts',
            ),
          ],
        ),
      ),
    );
  }
}
