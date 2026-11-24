import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/transport/domain/tm_break_now.dart';
import 'package:yard_rota_flutter/features/transport/domain/transport_dashboard_models.dart';

void main() {
  group('tmActiveBreaksNow (ShiftDashboard parity)', () {
    test('night 00:00 break is active at 00:06 local', () {
      final now = DateTime(2026, 11, 24, 0, 6);
      final active = tmActiveBreaksNow(
        location: 'Rugby',
        now: now,
        rows: const [
          TmBreakRowInput(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '00:00:00',
            durationMinutes: 60,
            shiftType: 'night',
            name: 'Tomas Jacko',
            location: 'Rugby',
          ),
          TmBreakRowInput(
            id: '2',
            userId: 'u2',
            dateYmd: '2026-11-23',
            startTime: '00:00:00',
            durationMinutes: 60,
            shiftType: 'night',
            name: 'Stuart Green',
            location: 'Rugby',
          ),
          TmBreakRowInput(
            id: '3',
            userId: 'u3',
            dateYmd: '2026-11-23',
            startTime: '00:00:00',
            durationMinutes: 60,
            shiftType: 'night',
            name: 'Arkadiusz Budrys',
            location: 'Rugby',
          ),
          TmBreakRowInput(
            id: '4',
            userId: 'u4',
            dateYmd: '2026-11-23',
            startTime: '01:00:00',
            durationMinutes: 60,
            shiftType: 'night',
            name: 'Later Break',
            location: 'Rugby',
          ),
        ],
      );
      expect(active.map((e) => e.name).toList(), [
        'Arkadiusz Budrys',
        'Stuart Green',
        'Tomas Jacko',
      ]);
    });

    test('day breaks hidden during night window', () {
      final now = DateTime(2026, 11, 24, 0, 6);
      final active = tmActiveBreaksNow(
        location: 'Rugby',
        now: now,
        rows: const [
          TmBreakRowInput(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-24',
            startTime: '00:00',
            durationMinutes: 15,
            shiftType: 'day',
            name: 'Should Hide',
            location: 'Rugby',
          ),
        ],
      );
      expect(active, isEmpty);
    });

    test('upcoming includes starts after now within 2h', () {
      final now = DateTime(2026, 11, 24, 10, 0);
      final upcoming = tmUpcomingBreaks(
        location: 'Rugby',
        now: now,
        rows: const [
          TmBreakRowInput(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-24',
            startTime: '10:30',
            durationMinutes: 30,
            shiftType: 'day',
            name: 'Soon',
            location: 'Rugby',
          ),
          TmBreakRowInput(
            id: '2',
            userId: 'u2',
            dateYmd: '2026-11-24',
            startTime: '13:00',
            durationMinutes: 30,
            shiftType: 'day',
            name: 'Too Far',
            location: 'Rugby',
          ),
          TmBreakRowInput(
            id: '3',
            userId: 'u3',
            dateYmd: '2026-11-24',
            startTime: '09:00',
            durationMinutes: 30,
            shiftType: 'day',
            name: 'Already Started',
            location: 'Rugby',
          ),
        ],
      );
      expect(upcoming.map((e) => e.name).toList(), ['Soon']);
    });

    test('query dates in night window are today + night start only', () {
      final now = DateTime(2026, 11, 24, 0, 6);
      expect(tmBreakQueryDates(now), ['2026-11-23', '2026-11-24']);
    });
  });

  group('tmBuildLiveBreakBoardView', () {
    test('groups current slot and picks earliest next slot', () {
      final now = DateTime(2026, 11, 24, 10, 5);
      final view = tmBuildLiveBreakBoardView(
        now: [
          TransportOnBreakPerson(
            userId: 'u2',
            name: 'Bob',
            start: DateTime(2026, 11, 24, 10, 0),
            end: DateTime(2026, 11, 24, 10, 15),
          ),
          TransportOnBreakPerson(
            userId: 'u1',
            name: 'Alice',
            start: DateTime(2026, 11, 24, 10, 0),
            end: DateTime(2026, 11, 24, 10, 15),
          ),
        ],
        upcoming: [
          TransportOnBreakPerson(
            userId: 'u3',
            name: 'Soon',
            start: DateTime(2026, 11, 24, 10, 30),
            end: DateTime(2026, 11, 24, 11, 0),
          ),
          TransportOnBreakPerson(
            userId: 'u4',
            name: 'Later',
            start: DateTime(2026, 11, 24, 11, 0),
            end: DateTime(2026, 11, 24, 11, 30),
          ),
        ],
      );

      expect(view.current?.count, 2);
      expect(view.current?.people.map((e) => e.name).toList(), [
        'Alice',
        'Bob',
      ]);
      expect(
        tmBreakSlotTimeRange(view.current!.start, view.current!.end),
        '10:00–10:15',
      );
      expect(tmBreakPeopleCountLabel(view.current!.count), '2 people');
      expect(tmBreakSlotMinutesLeftLabel(view.current!.end, now), '10 minutes left');

      expect(view.next?.count, 1);
      expect(view.next?.people.single.name, 'Soon');
      expect(
        tmBreakSlotTimeRange(view.next!.start, view.next!.end),
        '10:30–11:00',
      );
      expect(tmBreakPeopleCountLabel(view.next!.count), '1 person');
    });

    test('people count label uses singular for one', () {
      expect(tmBreakPeopleCountLabel(1), '1 person');
      expect(tmBreakPeopleCountLabel(4), '4 people');
    });

    test('slot title maps break_type to ordinal labels', () {
      expect(tmBreakSlotTitleLabel('Break 1 (15 min)'), '1st break');
      expect(tmBreakSlotTitleLabel('Break 2 (45 min)'), '2nd break');
      expect(tmBreakSlotTitleLabel('meal3'), '3rd break');
    });
  });
}
