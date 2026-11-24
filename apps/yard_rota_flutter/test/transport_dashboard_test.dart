import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/transport/domain/transport_dashboard_models.dart';

void main() {
  group('transportEffectiveTodayYmd', () {
    test('before 07:00 uses previous calendar day', () {
      expect(
        transportEffectiveTodayYmd(DateTime(2026, 3, 23, 6, 59)),
        '2026-03-22',
      );
    });

    test('from 07:00 uses calendar today', () {
      expect(
        transportEffectiveTodayYmd(DateTime(2026, 3, 23, 7, 0)),
        '2026-03-23',
      );
    });
  });

  group('locationsWithStaffToday', () {
    test('counts hubs with Rugby first and NRC last', () {
      final result = locationsWithStaffToday([
        'NRC',
        'Birmingham',
        'Rugby',
        'Rugby',
        'NRC',
        '  ',
        null,
      ]);
      expect(result.map((e) => e.name).toList(), [
        'Rugby',
        'Birmingham',
        'NRC',
      ]);
      expect(result.first.count, 2);
      expect(result.last.count, 2);
    });
  });

  group('resolveTransportLocationSelection', () {
    const staffed = [
      TransportStaffedLocation(name: 'Rugby', count: 2),
      TransportStaffedLocation(name: 'Birmingham', count: 1),
      TransportStaffedLocation(name: 'NRC', count: 1),
    ];

    test('keeps saved location when still staffed', () {
      expect(
        resolveTransportLocationSelection(
          staffed: staffed,
          savedName: 'NRC',
        ),
        'NRC',
      );
    });

    test('falls back to first staffed hub (Rugby)', () {
      expect(
        resolveTransportLocationSelection(
          staffed: staffed,
          savedName: 'Gone',
        ),
        'Rugby',
      );
    });
  });

  group('buildTransportTodaySnapshot', () {
    test('counts at work, absences without late, invisible and removed', () {
      final snapshot = buildTransportTodaySnapshot(
        dateYmd: '2026-03-23',
        location: 'Rugby',
        slots: const [
          TransportRotaSlotInput(
            id: 's1',
            userId: 'u1',
            shift: 'day',
            name: 'Alice Present',
            showOnReports: true,
          ),
          TransportRotaSlotInput(
            id: 's2',
            userId: 'u2',
            shift: 'afternoon',
            name: 'Bob Sick',
            showOnReports: true,
          ),
          TransportRotaSlotInput(
            id: 's3',
            userId: 'u3',
            shift: 'night',
            name: 'Cara Hidden',
            showOnReports: false,
          ),
          TransportRotaSlotInput(
            id: 's4',
            userId: 'u4',
            shift: 'day',
            name: 'Dan Late Ignored',
            showOnReports: true,
          ),
        ],
        liveAttendance: const [
          TransportAttendanceInput(
            id: 'a2',
            status: 'sick',
            scheduledRotaId: 's2',
            userId: 'u2',
            note: 'Called in',
          ),
          TransportAttendanceInput(
            id: 'a4',
            status: 'late',
            scheduledRotaId: 's4',
            userId: 'u4',
            note: 'should ignore',
          ),
        ],
        removedAttendance: const [
          TransportAttendanceInput(
            id: 'a5',
            status: 'no_show',
            userId: 'u5',
            note: 'No call',
            shift: 'day',
          ),
          TransportAttendanceInput(
            id: 'a6',
            status: 'late',
            userId: 'u6',
            note: 'ignore removed late',
          ),
        ],
        removedNames: const {
          'u5': 'Eve Removed',
          'u6': 'Frank Late',
        },
        removedShowOnReports: const {
          'u5': false,
          'u6': true,
        },
        onBreakPeople: [
          TransportOnBreakPerson(
            userId: 'u1',
            name: 'Alice Present',
            start: DateTime(2026, 3, 23, 10),
            end: DateTime(2026, 3, 23, 10, 15),
          ),
        ],
      );

      expect(snapshot.atWork.day, 2); // Alice + Dan (late ignored as absence)
      expect(snapshot.atWork.afternoon, 0);
      expect(snapshot.atWork.night, 1); // Cara still at work (no tracked absence)
      expect(snapshot.atWork.total, 3);

      expect(snapshot.absences.sick, 1);
      expect(snapshot.absences.noShow, 0);
      expect(snapshot.absences.other, 0);
      expect(snapshot.absences.total, 1);
      expect(snapshot.absentPeople.single.name, 'Bob Sick');
      expect(snapshot.absentPeople.single.note, 'Called in');

      expect(snapshot.invisiblePeople.map((e) => e.name).toList(), [
        'Cara Hidden',
        'Eve Removed',
      ]);

      expect(snapshot.removedPeople.single.name, 'Eve Removed');
      expect(snapshot.removedPeople.single.note, 'No call');
      expect(snapshot.onBreakCount, 1);
    });

    test('absence labels are English and exclude late', () {
      expect(transportAbsenceLabel('no_show'), 'No show');
      expect(transportAbsenceLabel('sick'), 'Sick');
      expect(transportAbsenceLabel('other'), 'Other');
      expect(kTransportAbsenceStatuses.contains('late'), isFalse);
    });

    test('performance aggregates moves and skips invisible', () {
      final kpi = aggregateTransportPerformance(
        [
          {
            'user_id': 'a',
            'number_of_moves': 40,
            'profiles': {
              'first_name': 'Ann',
              'last_name': 'Best',
              'show_on_reports': true,
            },
          },
          {
            'user_id': 'b',
            'number_of_moves': 10,
            'profiles': {
              'first_name': 'Bob',
              'last_name': 'Low',
              'show_on_reports': true,
            },
          },
          {
            'user_id': 'c',
            'number_of_moves': 99,
            'profiles': {
              'first_name': 'Hidden',
              'last_name': 'One',
              'show_on_reports': false,
            },
          },
        ],
        weekBest: const TransportPerformanceEntry(
          userId: 'w',
          name: 'Week Star',
          moves: 120,
        ),
      );

      expect(kpi.hasData, isTrue);
      expect(kpi.totalMoves, 50);
      expect(kpi.best?.name, 'Ann Best');
      expect(kpi.worst?.name, 'Bob Low');
      expect(kpi.weekBest?.name, 'Week Star');
    });
  });
}
