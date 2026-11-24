import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/breaks/domain/break_models.dart';

void main() {
  group('BreakWindowLogic local wall clock', () {
    test('localDateYmd is local midnight not UTC', () {
      final local = BreakWindowLogic.localDateYmd('2026-11-23');
      expect(local.isUtc, isFalse);
      expect(local.year, 2026);
      expect(local.month, 11);
      expect(local.day, 23);
      expect(local.hour, 0);
    });

    test('day break at full hour is active in local time', () {
      final now = DateTime(2026, 11, 23, 10, 5);
      final visible = BreakWindowLogic.visibleBreaks(
        now: now,
        filters: const BreakFilters(location: 'Rugby'),
        breaks: const [
          ScheduledBreak(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '10:00',
            durationMinutes: 15,
            shift: BreakShift.day,
            firstName: 'Alice',
            lastName: 'A',
            location: 'Rugby',
          ),
          ScheduledBreak(
            id: '2',
            userId: 'u2',
            dateYmd: '2026-11-23',
            startTime: '09:00',
            durationMinutes: 15,
            shift: BreakShift.day,
            firstName: 'Bob',
            lastName: 'B',
            location: 'Rugby',
          ),
        ],
      );

      final active = visible.where((e) => e.isActive).toList();
      expect(active, hasLength(1));
      expect(active.single.breakItem.displayName, 'Alice A');
      expect(active.single.start, DateTime(2026, 11, 23, 10, 0));
      expect(active.single.end, DateTime(2026, 11, 23, 10, 15));
    });

    test('60-minute break ending on the hour drops exactly at end', () {
      final atEnd = DateTime(2026, 11, 23, 11, 0);
      final visible = BreakWindowLogic.visibleBreaks(
        now: atEnd,
        filters: const BreakFilters(location: 'Rugby'),
        breaks: const [
          ScheduledBreak(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '10:00',
            durationMinutes: 60,
            shift: BreakShift.day,
            firstName: 'Alice',
            lastName: 'A',
            location: 'Rugby',
          ),
        ],
      );
      expect(visible.where((e) => e.isActive), isEmpty);
    });

    test('night early-morning break uses next calendar morning locally', () {
      final now = DateTime(2026, 11, 24, 0, 30);
      final visible = BreakWindowLogic.visibleBreaks(
        now: now,
        filters: const BreakFilters(location: 'Rugby'),
        breaks: const [
          ScheduledBreak(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '00:00',
            durationMinutes: 60,
            shift: BreakShift.night,
            firstName: 'Night',
            lastName: 'One',
            location: 'Rugby',
          ),
        ],
      );
      final active = visible.where((e) => e.isActive).toList();
      expect(active, hasLength(1));
      expect(active.single.start, DateTime(2026, 11, 24, 0, 0));
    });

    test('yardWallClock maps device offset onto Europe/London wall time', () {
      // Instant = 2026-11-24 00:06 UTC = 00:06 London (GMT in November).
      final instant = DateTime.utc(2026, 11, 24, 0, 6);
      final yard = BreakWindowLogic.yardWallClock(instant);
      expect(yard.year, 2026);
      expect(yard.month, 11);
      expect(yard.day, 24);
      expect(yard.hour, 0);
      expect(yard.minute, 6);

      final visible = BreakWindowLogic.visibleBreaks(
        now: yard,
        filters: const BreakFilters(location: 'Rugby'),
        breaks: const [
          ScheduledBreak(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '00:00',
            durationMinutes: 60,
            shift: BreakShift.night,
            firstName: 'Tomas',
            lastName: 'J',
            location: 'Rugby',
          ),
        ],
      );
      expect(visible.where((e) => e.isActive), hasLength(1));
    });

    test('location match is case-insensitive', () {
      final now = DateTime(2026, 11, 23, 10, 5);
      final visible = BreakWindowLogic.visibleBreaks(
        now: now,
        filters: const BreakFilters(location: 'rugby'),
        breaks: const [
          ScheduledBreak(
            id: '1',
            userId: 'u1',
            dateYmd: '2026-11-23',
            startTime: '10:00',
            durationMinutes: 15,
            shift: BreakShift.day,
            firstName: 'Alice',
            lastName: 'A',
            location: 'Rugby',
          ),
        ],
      );
      expect(visible.where((e) => e.isActive), hasLength(1));
    });
  });
}
