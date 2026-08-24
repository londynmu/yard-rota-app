import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:yard_rota_flutter/core/theme/app_theme.dart';
import 'package:yard_rota_flutter/features/breaks/domain/break_models.dart';
import 'package:yard_rota_flutter/features/breaks/presentation/breaks_screen.dart';
import 'package:yard_rota_flutter/features/home/data/stage_one_repository.dart';

void main() {
  group('BreakWindowLogic', () {
    test('before 07:00 keeps yesterday night and hides next night', () {
      final now = DateTime(2026, 8, 9, 6);
      final visible = BreakWindowLogic.visibleBreaks(
        breaks: <ScheduledBreak>[
          _break('evening', '2026-08-08', '23:00', BreakShift.night),
          _break('morning', '2026-08-08', '06:00', BreakShift.night),
          _break('next-night', '2026-08-09', '18:00', BreakShift.night),
        ],
        now: now,
        filters: const BreakFilters(),
      );

      expect(visible.map((item) => item.breakItem.id), <String>['morning']);
    });

    test(
      'day window includes tonight and treats post-midnight as tomorrow',
      () {
        final now = DateTime(2026, 8, 9, 8);
        final visible = BreakWindowLogic.visibleBreaks(
          breaks: <ScheduledBreak>[
            _break('day', '2026-08-09', '10:00', BreakShift.day),
            _break('afternoon', '2026-08-09', '09:00', BreakShift.afternoon),
            _break('night-evening', '2026-08-09', '18:00', BreakShift.night),
            _break('night-morning', '2026-08-09', '01:00', BreakShift.night),
          ],
          now: now,
          filters: const BreakFilters(),
        );

        expect(visible.map((item) => item.breakItem.id), <String>[
          'day',
          'afternoon',
          'night-evening',
          'night-morning',
        ]);
        expect(visible.last.start, DateTime(2026, 8, 10, 1));
      },
    );

    test('active breaks lead, finished breaks are hidden', () {
      final now = DateTime(2026, 8, 9, 12, 10);
      final visible = BreakWindowLogic.visibleBreaks(
        breaks: <ScheduledBreak>[
          _break('finished', '2026-08-09', '11:00', BreakShift.day),
          _break('upcoming', '2026-08-09', '12:30', BreakShift.day),
          _break(
            'active',
            '2026-08-09',
            '12:00',
            BreakShift.afternoon,
            duration: 30,
          ),
        ],
        now: now,
        filters: const BreakFilters(),
      );

      expect(visible.map((item) => item.breakItem.id), <String>[
        'active',
        'upcoming',
      ]);
      expect(visible.first.isActive, isTrue);
    });
  });

  test('repository maps scheduled break rows defensively', () {
    final mapped = StageOneRepository.mapScheduledBreak(
      <String, dynamic>{
        'id': 'break-1',
        'user_id': 'user-1',
        'date': '2026-08-09',
        'break_start_time': '09:30:00',
        'break_duration_minutes': 20,
        'shift_type': 'day',
        'location': null,
      },
      profile: <String, dynamic>{'first_name': 'Alex', 'last_name': 'Smith'},
      fallbackLocation: 'Rugby',
    );

    expect(mapped, isNotNull);
    expect(mapped!.startTime, '09:30');
    expect(mapped.displayName, 'Alex Smith');
    expect(mapped.location, 'Rugby');
  });

  testWidgets('shunter breaks remain read-only', (tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    final repository = _FakeStageOneRepository();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: BreaksScreen(repository: repository, currentUserId: 'user-1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Breaks'), findsOneWidget);
    expect(find.text('Assign break'), findsNothing);
    expect(find.text('Manage breaks'), findsNothing);
    expect(find.byType(FloatingActionButton), findsNothing);
  });
}

ScheduledBreak _break(
  String id,
  String date,
  String time,
  BreakShift shift, {
  int duration = 15,
}) {
  return ScheduledBreak(
    id: id,
    userId: 'user-$id',
    dateYmd: date,
    startTime: time,
    durationMinutes: duration,
    shift: shift,
    firstName: 'Test',
    lastName: id,
    location: 'Rugby',
  );
}

class _FakeStageOneRepository extends StageOneRepository {
  _FakeStageOneRepository()
    : super(
        SupabaseClient(
          'https://example.supabase.co',
          'test-key',
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        ),
      );

  @override
  Future<List<ScheduledBreak>> loadBreaks({DateTime? now}) async =>
      const <ScheduledBreak>[];
}
