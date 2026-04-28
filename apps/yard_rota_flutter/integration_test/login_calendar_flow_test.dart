import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:yard_rota_flutter/app.dart';
import 'package:yard_rota_flutter/core/network/api_client.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/network/network_policy.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/availability_sheet.dart';
import 'package:yard_rota_flutter/features/calendar/presentation/calendar_screen.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('critical flow login to calendar is interactive', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    await tester.pumpWidget(YardRotaApp(apiClient: _IntegrationApiClient()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'crew@yardrota.com');
    await tester.enterText(find.byType(TextField).at(1), 'yard123');
    await tester.pump();
    final signInButton = tester.widget<ElevatedButton>(
      find.byType(ElevatedButton),
    );
    expect(signInButton.onPressed, isNotNull);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.byType(CalendarScreen), findsOneWidget);
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('availability save updates selected day status', (tester) async {
    await tester.binding.setSurfaceSize(const Size(900, 1200));
    final apiClient = _IntegrationApiClient();
    await tester.pumpWidget(YardRotaApp(apiClient: apiClient));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(0), 'crew@yardrota.com');
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
    final modalUnavailable = find.descendant(
      of: find.byType(AvailabilitySheet),
      matching: find.text('Unavailable'),
    );
    await tester.tap(modalUnavailable);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(find.text('Availability saved.'), findsOneWidget);
    expect(apiClient.hasAnyStatus(AvailabilityStatus.unavailable), isTrue);
    await tester.binding.setSurfaceSize(null);
  });
}

class _IntegrationApiClient implements ApiClient {
  final Map<String, AvailabilityEntry> _availability =
      <String, AvailabilityEntry>{};

  bool hasAnyStatus(AvailabilityStatus status) =>
      _availability.values.any((entry) => entry.status == status);

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
          date: DateTime(year, month, 6),
          shifts: const [
            CalendarShift(
              title: 'Day shift',
              startTime: '06:00',
              endTime: '14:00',
              location: 'South Yard',
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
    return const UserSession(
      userId: 'int-id',
      displayName: 'Integration Shunter',
    );
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
}
