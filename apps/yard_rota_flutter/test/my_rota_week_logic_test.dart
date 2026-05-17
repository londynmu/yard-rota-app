import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/network/my_rota_models.dart';
import 'package:yard_rota_flutter/features/my_rota/domain/my_rota_week_logic.dart';

void main() {
  group('myRotaWeekStartSaturday', () {
    test('Wednesday 8 Jan 2025 → previous Saturday 4 Jan', () {
      final wed = DateTime(2025, 1, 8);
      final sat = myRotaWeekStartSaturday(wed);
      expect(sat, DateTime(2025, 1, 4));
    });

    test('Saturday stays same calendar day', () {
      final sat = DateTime(2025, 1, 4);
      expect(myRotaWeekStartSaturday(sat), DateTime(2025, 1, 4));
    });

    test('Sunday 5 Jan 2025 → Saturday 4 Jan', () {
      final sun = DateTime(2025, 1, 5);
      expect(myRotaWeekStartSaturday(sun), DateTime(2025, 1, 4));
    });
  });

  group('myRotaWeekDateYmds', () {
    test('returns seven consecutive ymd strings from Saturday', () {
      final start = DateTime(2025, 1, 4);
      final ymds = myRotaWeekDateYmds(start);
      expect(ymds.length, 7);
      expect(ymds.first, '2025-01-04');
      expect(ymds.last, '2025-01-10');
    });
  });

  group('myRotaPresentCount', () {
    test('excludes slots with attendance or without profile names', () {
      final slots = [
        const MyRotaSlot(
          id: '1',
          dateYmd: '2025-01-04',
          shiftType: 'day',
          location: 'Rugby',
          startTime: '06:00:00',
          endTime: '14:00:00',
          userId: 'a',
          firstName: 'Ann',
          lastName: 'Lee',
        ),
        const MyRotaSlot(
          id: '2',
          dateYmd: '2025-01-04',
          shiftType: 'day',
          location: 'Rugby',
          startTime: '06:00:00',
          endTime: '14:00:00',
          userId: 'b',
          firstName: 'Bob',
          lastName: 'Zed',
        ),
        const MyRotaSlot(
          id: '3',
          dateYmd: '2025-01-04',
          shiftType: 'day',
          location: 'Rugby',
          startTime: '06:00:00',
          endTime: '14:00:00',
          userId: 'c',
          firstName: null,
          lastName: null,
        ),
      ];
      final att = <String, MyRotaAttendanceStatus>{
        '2': MyRotaAttendanceStatus.noShow,
      };
      expect(myRotaPresentCount(slots, att), 1);
    });
  });

  group('MyRotaSlot display name', () {
    test(
      'returns null instead of fallback text when profile name is missing',
      () {
        const slot = MyRotaSlot(
          id: 'missing-profile',
          dateYmd: '2025-01-04',
          shiftType: 'day',
          location: 'Rugby',
          startTime: '06:00:00',
          endTime: '14:00:00',
          userId: 'missing',
        );

        expect(slot.displayNameOrNull, isNull);
      },
    );

    test('trims and joins real profile names', () {
      const slot = MyRotaSlot(
        id: 'real-profile',
        dateYmd: '2025-01-04',
        shiftType: 'day',
        location: 'Rugby',
        startTime: '06:00:00',
        endTime: '14:00:00',
        userId: 'real',
        firstName: ' Ann ',
        lastName: ' Lee ',
      );

      expect(slot.displayNameOrNull, 'Ann Lee');
    });
  });
}
