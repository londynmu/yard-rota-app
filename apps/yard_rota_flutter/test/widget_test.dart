import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/app.dart';
import 'package:yard_rota_flutter/core/network/api_client.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/network/network_policy.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/calendar_screen.dart';

void main() {
  testWidgets('shows login screen when no session is restored', (tester) async {
    await tester.pumpWidget(YardRotaApp(apiClient: _NoSessionClient()));

    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Yard Rota'), findsOneWidget);
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
  });
}

class _NoSessionClient implements ApiClient {
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
}
