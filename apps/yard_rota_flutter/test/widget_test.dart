import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/app.dart';
import 'package:yard_rota_flutter/core/ui/app_toast.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/network/my_rota_models.dart';
import 'package:yard_rota_flutter/core/network/network_policy.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/availability_sheet.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/calendar_screen.dart';
import 'package:yard_rota_flutter/features/home/presentation/home_hub_screen.dart';
import 'package:yard_rota_flutter/features/shell/home_shell_screen.dart';
import 'package:yard_rota_flutter/features/stats/domain/stats_models.dart';

import 'support/mock_api_client.dart';

void main() {
  testWidgets('shows login screen when no session is restored', (tester) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));

    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Yard Rota'), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('navigates from login to home after successful login', (
    tester,
  ) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'user@yardrota.com');
    await tester.enterText(find.byType(TextField).at(1), 'yard123');
    await tester.pump();
    final signInButton = tester.widget<ElevatedButton>(
      find.byType(ElevatedButton),
    );
    expect(signInButton.onPressed, isNotNull);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.byType(HomeShellScreen), findsOneWidget);
    expect(find.byType(HomeHubScreen), findsNothing);
    expect(find.byType(CalendarScreen), findsOneWidget);
    for (final label in ['Home', 'My Rota', 'Stats', 'PreCheck', 'Account']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('Admin'), findsNothing);
    for (final label in ['Calendar', 'Breaks', 'Info']) {
      expect(find.text(label), findsOneWidget);
    }
    AppToast.dismissPending();
  });

  testWidgets('home top bar switches between calendar and breaks', (
    tester,
  ) async {
    await _signInAsShunter(tester);

    await tester.tap(find.text('Breaks'));
    await tester.pumpAndSettle();
    expect(
      find.text('Breaks are unavailable. Try again later.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    expect(find.text('Breaks are unavailable. Try again later.'), findsNothing);
    expect(find.byType(CalendarScreen), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('bottom menu and top bar mark the selected item', (
    tester,
  ) async {
    await _signInAsShunter(tester);

    bool isSelected(String label) {
      final semantics = tester.widget<Semantics>(
        find
            .ancestor(
              of: find.text(label).last,
              matching: find.byWidgetPredicate(
                (widget) =>
                    widget is Semantics && widget.properties.button == true,
              ),
            )
            .first,
      );
      return semantics.properties.selected == true;
    }

    expect(isSelected('Home'), isTrue);
    expect(isSelected('Calendar'), isTrue);
    expect(isSelected('Stats'), isFalse);

    await tester.tap(find.text('Breaks'));
    await tester.pumpAndSettle();
    expect(isSelected('Breaks'), isTrue);
    expect(isSelected('Calendar'), isFalse);

    await tester.tap(find.text('Stats'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(isSelected('Stats'), isTrue);
    expect(isSelected('Home'), isFalse);
    AppToast.dismissPending();
  });

  testWidgets('every tab lays out on a small phone screen', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 740));
    await _signInAsShunter(tester);

    for (final label in ['Breaks', 'Info', 'Calendar']) {
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }
    for (final label in ['My Rota', 'Stats', 'PreCheck', 'Account', 'Home']) {
      await tester.tap(find.text(label).last);
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
    }

    expect(tester.takeException(), isNull);
    expect(find.byType(CalendarScreen), findsOneWidget);
    AppToast.dismissPending();
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('shunter account tab lists personal settings only', (
    tester,
  ) async {
    await _signInAsShunter(tester);

    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Themes'), findsOneWidget);
    expect(find.text('Log out'), findsOneWidget);
    expect(find.text('Admin Panel'), findsNothing);
    AppToast.dismissPending();
  });

  testWidgets('admin gets an admin tab with management shortcuts', (
    tester,
  ) async {
    await tester.pumpWidget(
      YardRotaApp(
        apiClient: _RestoredSessionClient(
          const UserSession(
            userId: 'admin-user',
            displayName: 'Admin User',
            role: UserRole.admin,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(HomeShellScreen), findsOneWidget);
    expect(find.text('Account'), findsNothing);

    await tester.tap(find.text('Admin'));
    await tester.pumpAndSettle();

    expect(find.text('Admin Panel'), findsOneWidget);
    expect(find.text('VMU'), findsOneWidget);
    expect(find.text('Transport Dashboard'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('vmu user keeps the tile hub', (tester) async {
    await tester.pumpWidget(
      YardRotaApp(
        apiClient: _RestoredSessionClient(
          const UserSession(
            userId: 'vmu-user',
            displayName: 'VMU User',
            role: UserRole.vmu,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(HomeHubScreen), findsOneWidget);
    expect(find.byType(HomeShellScreen), findsNothing);
    AppToast.dismissPending();
  });

  testWidgets('requires an incomplete user to finish their profile', (
    tester,
  ) async {
    await tester.pumpWidget(
      YardRotaApp(
        apiClient: _RestoredSessionClient(
          const UserSession(
            userId: 'pending-user',
            displayName: 'Pending User',
            email: 'pending@example.com',
            profileCompleted: false,
            accountStatus: AccountStatus.pendingApproval,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome to Yard Rota'), findsOneWidget);
    expect(find.text('First name'), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('shows approval gate for a completed pending user', (
    tester,
  ) async {
    await tester.pumpWidget(
      YardRotaApp(
        apiClient: _RestoredSessionClient(
          const UserSession(
            userId: 'pending-user',
            displayName: 'Pending User',
            email: 'pending@example.com',
            profileCompleted: true,
            accountStatus: AccountStatus.pendingApproval,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Profile awaiting approval'), findsOneWidget);
    expect(find.text('Check status'), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('tapping past day does not open availability sheet', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    await _signInAsShunter(tester);

    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    final yesterdayCell = find.descendant(
      of: find.byType(GridView).first,
      matching: find.text('${yesterday.day}'),
    );
    await tester.ensureVisible(yesterdayCell.first);
    await tester.tap(yesterdayCell.first);
    await tester.pumpAndSettle();

    expect(find.byType(AvailabilitySheet), findsNothing);
    expect(
      find.text('You can only set availability for today and future dates.'),
      findsOneWidget,
    );
    AppToast.dismissPending();
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('tapping future day opens availability sheet', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    await _signInAsShunter(tester);

    final tomorrow = DateTime.now().add(const Duration(days: 1));
    final tomorrowCell = find.descendant(
      of: find.byType(GridView).first,
      matching: find.text('${tomorrow.day}'),
    );
    await tester.ensureVisible(tomorrowCell.first);
    await tester.tap(tomorrowCell.first);
    await tester.pumpAndSettle();

    expect(find.byType(AvailabilitySheet), findsOneWidget);
    AppToast.dismissPending();
    await tester.binding.setSurfaceSize(null);
  });
}

Future<void> _signInAsShunter(WidgetTester tester) async {
  await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField).at(0), 'user@yardrota.com');
  await tester.enterText(find.byType(TextField).at(1), 'yard123');
  await tester.pump();
  await tester.tap(find.text('Sign in'));
  await tester.pumpAndSettle();
}

class _NoSessionClient extends MockApiClient {
  final Map<String, AvailabilityEntry> _availability =
      <String, AvailabilityEntry>{};

  @override
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  }) async {
    return _availability.values
        .where(
          (entry) =>
              entry.dateYmd.compareTo(startYmd) >= 0 &&
              entry.dateYmd.compareTo(endYmd) <= 0,
        )
        .toList(growable: false);
  }

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) async {
    return CalendarMonthData(
      year: year,
      month: month,
      scheduledDays: [
        CalendarDaySchedule(
          date: DateTime(year, month, 3),
          shifts: const [
            CalendarShift(
              title: 'Night shift',
              startTime: '22:00',
              endTime: '06:00',
              location: 'North Yard',
              status: 'On time',
            ),
          ],
        ),
      ],
      fetchedAt: DateTime.now(),
    );
  }

  @override
  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    if (password != 'yard123') {
      throw const UnauthorizedException('invalid');
    }
    return const UserSession(userId: 'id', displayName: 'Test Shunter');
  }

  @override
  Future<UserSession?> restoreSession() async => null;

  @override
  Future<void> signOut() async {}

  @override
  Future<void> saveAvailability({
    required SaveAvailabilityRequest request,
  }) async {
    for (final item in request.items) {
      _availability[item.dateYmd] = AvailabilityEntry(
        id: _availability[item.dateYmd]?.id ?? 'id-${item.dateYmd}',
        dateYmd: item.dateYmd,
        status: item.status,
        comment: request.applyComment ? request.comment : null,
      );
    }
  }

  @override
  Future<List<LocationOption>> getActiveLocations() async => const [];

  @override
  Future<MyRotaAnchorShift?> getMyRotaAnchorShift({
    required String userId,
    required String fromYmd,
  }) async => null;

  @override
  Future<MyRotaWeekData> getMyRotaWeek({
    required String weekStartYmd,
    required String locationName,
    required String shiftTypeFilter,
  }) async => MyRotaWeekData(
    slotsByDateYmd: const {},
    attendanceBySlotId: const {},
    fetchedAt: DateTime.now(),
  );

  @override
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
    String? note,
  }) async {}

  @override
  Future<StatsRemoteSnapshot> getStatsPerformance({
    String? startYmd,
    String? endYmd,
  }) async {
    return StatsRemoteSnapshot(records: const [], fetchedAt: DateTime.now());
  }
}

class _RestoredSessionClient extends MockApiClient {
  _RestoredSessionClient(this.session);

  final UserSession session;

  @override
  Future<UserSession?> restoreSession() async => session;
}
