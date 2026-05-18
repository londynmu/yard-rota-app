import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/pre_check/domain/pre_check_models.dart';

void main() {
  group('getPreCheckShiftWindow', () {
    test('uses one hour pre-start buffer', () {
      final window = getPreCheckShiftWindow(const [
        PreCheckShift(
          dateYmd: '2026-05-18',
          startTime: '06:00',
          endTime: '14:00',
        ),
      ], now: DateTime(2026, 5, 18, 5, 30));

      expect(window, isNotNull);
      expect(window!.start, DateTime(2026, 5, 18, 6));
      expect(window.end, DateTime(2026, 5, 18, 14));
    });

    test('rolls overnight shift end into next day', () {
      final window = getPreCheckShiftWindow(const [
        PreCheckShift(
          dateYmd: '2026-05-18',
          startTime: '22:00',
          endTime: '06:00',
        ),
      ], now: DateTime(2026, 5, 19, 2));

      expect(window, isNotNull);
      expect(window!.end, DateTime(2026, 5, 19, 6));
    });
  });

  group('validatePreCheckDraft', () {
    const tyres = PreCheckItemDefinition(
      key: 'tyres',
      label: 'Tyres',
      category: 'outside',
    );
    const mirrors = PreCheckItemDefinition(
      key: 'mirrors',
      label: 'Mirrors',
      category: 'outside',
    );

    test('requires every item to be handled', () {
      final result = validatePreCheckDraft(
        items: const [tyres, mirrors],
        draft: const PreCheckDraft(
          formSessionId: 'form-1',
          itemStates: {
            'tyres': PreCheckItemState(status: PreCheckItemStatus.ok),
          },
        ),
        defectsByItem: const {},
      );

      expect(result.isValid, isFalse);
      expect(result.uncheckedCount, 1);
      expect(result.firstInvalidItemKey, 'mirrors');
    });

    test('requires description for new repair-needed issue', () {
      final result = validatePreCheckDraft(
        items: const [tyres],
        draft: const PreCheckDraft(
          formSessionId: 'form-1',
          itemStates: {
            'tyres': PreCheckItemState(status: PreCheckItemStatus.repairNeeded),
          },
        ),
        defectsByItem: const {},
      );

      expect(result.isValid, isFalse);
      expect(result.missingDescriptionCount, 1);
    });

    test('allows same problem without new description', () {
      final defect = PreCheckKnownDefect(
        id: 'damage-1',
        itemKey: 'tyres',
        description: 'Slow puncture',
        reporterName: 'Alex',
        dateLabel: '18 May 2026',
      );
      final result = validatePreCheckDraft(
        items: const [tyres],
        draft: const PreCheckDraft(
          formSessionId: 'form-1',
          itemStates: {
            'tyres': PreCheckItemState(
              status: PreCheckItemStatus.repairNeeded,
              linkedDamageId: 'damage-1',
            ),
          },
        ),
        defectsByItem: {
          'tyres': [defect],
        },
      );

      expect(result.isValid, isTrue);
    });

    test('tracks multi-defect state keys and new defect descriptions', () {
      final defects = [
        const PreCheckKnownDefect(
          id: 'damage-1',
          itemKey: 'tyres',
          description: 'Cut',
          reporterName: 'Alex',
          dateLabel: '18 May 2026',
        ),
        const PreCheckKnownDefect(
          id: 'damage-2',
          itemKey: 'tyres',
          description: 'Flat',
          reporterName: 'Sam',
          dateLabel: '18 May 2026',
        ),
      ];
      final draft = const PreCheckDraft(
        formSessionId: 'form-1',
        itemStates: {
          'tyres::damage-1': PreCheckItemState(
            status: PreCheckItemStatus.repairNeeded,
            linkedDamageId: 'damage-1',
          ),
          'tyres::damage-2': PreCheckItemState(status: PreCheckItemStatus.ok),
          'tyres::new': PreCheckItemState(
            status: PreCheckItemStatus.repairNeeded,
            notes: 'New sidewall damage',
          ),
        },
        markedResolvedDamageIds: ['damage-2'],
      );

      final progress = calculatePreCheckProgress(
        items: const [tyres],
        draft: draft,
        defectsByItem: {'tyres': defects},
      );

      expect(stateKeysForItem(tyres, {'tyres': defects}), [
        'tyres::damage-1',
        'tyres::damage-2',
      ]);
      expect(progress.checked, 1);
      expect(progress.issueCount, 1);
    });
  });
}
