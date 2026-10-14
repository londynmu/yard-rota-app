import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:yard_rota_flutter/core/theme/app_theme.dart';
import 'package:yard_rota_flutter/features/home/data/stage_one_repository.dart';
import 'package:yard_rota_flutter/features/home/domain/my_day_logic.dart';
import 'package:yard_rota_flutter/features/home/presentation/my_day_card.dart';

const _dayShift = MyShift(
  dateYmd: '2026-10-14',
  startTime: '07:00',
  endTime: '17:00',
  shiftType: 'day',
  location: 'Rugby',
);

const _nightShift = MyShift(
  dateYmd: '2026-10-13',
  startTime: '17:00',
  endTime: '05:15',
  shiftType: 'night',
  location: 'Rugby',
);

const _dayBreaks = <MyBreak>[
  MyBreak(
    dateYmd: '2026-10-14',
    startTime: '10:00',
    durationMinutes: 30,
    shiftType: 'day',
  ),
  MyBreak(
    dateYmd: '2026-10-14',
    startTime: '13:00',
    durationMinutes: 30,
    shiftType: 'day',
  ),
];

void main() {
  group('MyDayLogic', () {
    test('upcoming break shows the first one and counts the rest', () {
      final summary = MyDayLogic.summarise(
        shifts: const [_dayShift],
        breaks: _dayBreaks,
        now: DateTime(2026, 10, 14, 9, 30),
      );
      final status = summary.breakStatus!;
      expect(summary.current, _dayShift);
      expect(status.kind, MyBreakKind.upcoming);
      expect(status.start, DateTime(2026, 10, 14, 10));
      expect(status.end, DateTime(2026, 10, 14, 10, 30));
      expect(status.moreCount, 1);
    });

    test('break in progress is active', () {
      final status = MyDayLogic.summarise(
        shifts: const [_dayShift],
        breaks: _dayBreaks,
        now: DateTime(2026, 10, 14, 10, 10),
      ).breakStatus!;
      expect(status.kind, MyBreakKind.active);
      expect(status.end, DateTime(2026, 10, 14, 10, 30));
    });

    test('all breaks finished reads done, no breaks reads none', () {
      final now = DateTime(2026, 10, 14, 15);
      expect(
        MyDayLogic.summarise(
          shifts: const [_dayShift],
          breaks: _dayBreaks,
          now: now,
        ).breakStatus!.kind,
        MyBreakKind.done,
      );
      expect(
        MyDayLogic.summarise(
          shifts: const [_dayShift],
          breaks: const [],
          now: now,
        ).breakStatus!.kind,
        MyBreakKind.none,
      );
    });

    test('night break after midnight happens the following morning', () {
      final summary = MyDayLogic.summarise(
        shifts: const [_nightShift],
        breaks: const [
          MyBreak(
            dateYmd: '2026-10-13',
            startTime: '02:00',
            durationMinutes: 60,
            shiftType: 'night',
          ),
        ],
        now: DateTime(2026, 10, 14, 1, 30),
      );
      expect(summary.current, _nightShift);
      expect(summary.breakStatus!.kind, MyBreakKind.upcoming);
      expect(summary.breakStatus!.start, DateTime(2026, 10, 14, 2));
    });

    test('last night counts as today until it ends', () {
      const tonight = MyShift(
        dateYmd: '2026-10-14',
        startTime: '17:00',
        endTime: '05:15',
        shiftType: 'night',
      );
      final shifts = const [_nightShift, tonight];
      expect(
        MyDayLogic.summarise(
          shifts: shifts,
          breaks: const [],
          now: DateTime(2026, 10, 14, 3, 20),
        ).current,
        _nightShift,
      );
      expect(
        MyDayLogic.summarise(
          shifts: shifts,
          breaks: const [],
          now: DateTime(2026, 10, 14, 6),
        ).current,
        tonight,
      );
    });

    test('breaks of another shift type are ignored', () {
      final status = MyDayLogic.summarise(
        shifts: const [_dayShift],
        breaks: const [
          MyBreak(
            dateYmd: '2026-10-14',
            startTime: '21:00',
            durationMinutes: 60,
            shiftType: 'night',
          ),
        ],
        now: DateTime(2026, 10, 14, 9),
      ).breakStatus!;
      expect(status.kind, MyBreakKind.none);
    });

    test('day off returns the next shift', () {
      const thursday = MyShift(
        dateYmd: '2026-10-16',
        startTime: '17:00',
        endTime: '05:15',
        shiftType: 'night',
      );
      final summary = MyDayLogic.summarise(
        shifts: const [thursday],
        breaks: const [],
        now: DateTime(2026, 10, 14, 12),
      );
      expect(summary.current, isNull);
      expect(summary.next, thursday);
    });

    test('formatDuration rounds up and switches to hours', () {
      expect(MyDayLogic.formatDuration(const Duration(seconds: 20)), '1m');
      expect(MyDayLogic.formatDuration(const Duration(minutes: 45)), '45m');
      expect(MyDayLogic.formatDuration(const Duration(minutes: 60)), '1h');
      expect(MyDayLogic.formatDuration(const Duration(minutes: 80)), '1h 20m');
    });

    test('attendance statuses map to labels', () {
      expect(StageOneRepository.attendanceLabel('sick'), 'Sick');
      expect(StageOneRepository.attendanceLabel('no_show'), 'No show');
      expect(StageOneRepository.attendanceLabel('unknown'), isNull);
    });
  });

  group('MyDayCard', () {
    Future<void> pumpCard(
      WidgetTester tester, {
      required MyDayData data,
      required DateTime now,
      VoidCallback? onOpenMyRota,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(
            body: MyDayCard(
              repository: _FakeStageOneRepository(data),
              userId: 'me',
              clock: () => now,
              onOpenMyRota: onOpenMyRota ?? () {},
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    Future<void> disposeCard(WidgetTester tester) =>
        tester.pumpWidget(const SizedBox());

    testWidgets('shows today shift with the next break countdown', (
      tester,
    ) async {
      await pumpCard(
        tester,
        data: const MyDayData(shifts: [_dayShift], breaks: _dayBreaks),
        now: DateTime(2026, 10, 14, 9, 35),
      );

      expect(find.text('Today · Day 07:00–17:00'), findsOneWidget);
      expect(find.text('Rugby · Break 10:00–10:30 +1'), findsOneWidget);
      expect(find.text('in 25m'), findsOneWidget);
      await disposeCard(tester);
    });

    testWidgets('shows absence instead of the break', (tester) async {
      await pumpCard(
        tester,
        data: const MyDayData(
          shifts: [
            MyShift(
              dateYmd: '2026-10-14',
              startTime: '07:00',
              endTime: '17:00',
              shiftType: 'day',
              location: 'Rugby',
              absence: 'Sick',
            ),
          ],
          breaks: _dayBreaks,
        ),
        now: DateTime(2026, 10, 14, 9, 35),
      );

      expect(find.text('Rugby · Sick'), findsOneWidget);
      expect(find.text('in 25m'), findsNothing);
      await disposeCard(tester);
    });

    testWidgets('day off shows the next shift and opens My Rota', (
      tester,
    ) async {
      var opened = 0;
      await pumpCard(
        tester,
        data: const MyDayData(
          shifts: [
            MyShift(
              dateYmd: '2026-10-15',
              startTime: '17:00',
              endTime: '05:15',
              shiftType: 'night',
            ),
          ],
          breaks: [],
        ),
        now: DateTime(2026, 10, 14, 12),
        onOpenMyRota: () => opened++,
      );

      expect(find.text('Day off today'), findsOneWidget);
      expect(find.text('Next: Tomorrow Night 17:00'), findsOneWidget);

      await tester.tap(find.text('Open My Rota'));
      expect(opened, 1);
      await disposeCard(tester);
    });

    testWidgets('load failure asks to retry', (tester) async {
      await pumpCard(
        tester,
        data: _FakeStageOneRepository.failure,
        now: DateTime(2026, 10, 14, 12),
      );

      expect(
        find.text('Could not load your shift. Pull down to retry.'),
        findsOneWidget,
      );
      await disposeCard(tester);
    });
  });
}

class _FakeStageOneRepository extends StageOneRepository {
  _FakeStageOneRepository(this._data)
    : super(
        SupabaseClient(
          'https://example.supabase.co',
          'test-key',
          authOptions: const AuthClientOptions(autoRefreshToken: false),
        ),
      );

  /// Marker data that makes [loadMyDay] throw.
  static const failure = MyDayData(shifts: [], breaks: []);

  final MyDayData _data;

  @override
  Future<MyDayData> loadMyDay({required String userId, DateTime? now}) async {
    if (identical(_data, failure)) throw Exception('offline');
    return _data;
  }
}
