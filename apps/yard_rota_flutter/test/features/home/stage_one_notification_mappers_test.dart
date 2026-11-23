import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/home/data/stage_one_repository.dart';

void main() {
  group('StageOneRepository notification mappers', () {
    test('mapPendingJoinRequest builds display fields', () {
      final person = StageOneRepository.mapPendingJoinRequest({
        'id': 'u1',
        'first_name': 'Ada',
        'last_name': 'Lovelace',
        'email': 'ada@example.com',
        'created_at': '2026-11-23T10:00:00Z',
      });
      expect(person, isNotNull);
      expect(person!.displayName, 'Ada Lovelace');
      expect(person.email, 'ada@example.com');
    });

    test('mapMissingTookPrecheck formats shift window', () {
      final row = StageOneRepository.mapMissingTookPrecheck({
        'user_id': 'u2',
        'rota_id': 'r1',
        'first_name': 'Tom',
        'last_name': 'Shunter',
        'start_time': '07:00:00',
        'end_time': '17:00:00',
      });
      expect(row, isNotNull);
      expect(row!.displayName, 'Tom Shunter');
      expect(row.shiftWindow, '07:00-17:00');
    });

    test('mapNotification requires title and created_at', () {
      expect(
        StageOneRepository.mapNotification({
          'id': 'n1',
          'title': 'Rota update',
          'message': 'Added to a shift',
          'type': 'rota_assignment_digest',
          'is_read': false,
          'created_at': '2026-11-23T12:00:00Z',
        }),
        isNotNull,
      );
      expect(
        StageOneRepository.mapNotification({
          'id': 'n2',
          'title': '',
          'created_at': '2026-11-23T12:00:00Z',
        }),
        isNull,
      );
    });
  });
}
