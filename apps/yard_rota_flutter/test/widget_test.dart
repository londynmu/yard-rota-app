import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/app.dart';
import 'package:yard_rota_flutter/core/network/api_client.dart';
import 'package:yard_rota_flutter/core/ui/app_toast.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/network/my_rota_models.dart';
import 'package:yard_rota_flutter/core/network/network_policy.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/availability_sheet.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/calendar_screen.dart';

void main() {
  testWidgets('shows login screen when no session is restored', (tester) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));

    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Yard Rota'), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('navigates from login to calendar after successful login', (
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

    expect(find.byType(CalendarScreen), findsOneWidget);
    AppToast.dismissPending();
  });

  testWidgets('tapping past day does not open availability sheet', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'user@yardrota.com');
    await tester.enterText(find.byType(TextField).at(1), 'yard123');
    await tester.pump();
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

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
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'user@yardrota.com');
    await tester.enterText(find.byType(TextField).at(1), 'yard123');
    await tester.pump();
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

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

class _NoSessionClient implements ApiClient {
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
  }) async {}
}
