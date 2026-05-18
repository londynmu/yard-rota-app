import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/local_db/app_local_database.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/features/stats/domain/stats_models.dart';

void main() {
  group('AppLocalDatabase', () {
    test('stores and reads calendar month snapshot', () async {
      final db = AppLocalDatabase.inMemory();

      final month = CalendarMonthData(
        year: 2026,
        month: 4,
        fetchedAt: DateTime(2026, 4, 10, 9),
        scheduledDays: [
          CalendarDaySchedule(
            date: DateTime(2026, 4, 12),
            shifts: const [
              CalendarShift(
                title: 'Day shift',
                startTime: '06:00',
                endTime: '14:00',
                location: 'Yard 1',
                status: 'On time',
              ),
            ],
          ),
        ],
      );

      await db.writeCalendarMonth(month);
      final loaded = await db.readCalendarMonth(year: 2026, month: 4);

      expect(loaded, isNotNull);
      expect(loaded!.scheduledDays, hasLength(1));
      expect(loaded.scheduleForDay(12)?.shifts.first.location, 'Yard 1');
    });

    test('stores local availability and outbox rows', () async {
      final db = AppLocalDatabase.inMemory();
      final date = '2026-04-30';

      await db.upsertAvailabilityLocal(
        dateYmd: date,
        status: AvailabilityStatus.unavailable,
        syncState: 'pending',
      );
      await db.enqueueAvailabilityUpsert(
        item: const SaveAvailabilityItem(
          dateYmd: '2026-04-30',
          status: AvailabilityStatus.unavailable,
        ),
        comment: '',
        applyComment: false,
      );

      final availability = await db.readAvailabilityRange(
        startYmd: date,
        endYmd: date,
      );
      final outbox = await db.readPendingOutbox();

      expect(availability[date]?.status, AvailabilityStatus.unavailable);
      expect(outbox, hasLength(1));
      expect(outbox.first.entity, 'availability');
    });

    test('stores and clears stats snapshots for offline use', () async {
      final db = AppLocalDatabase.inMemory();
      final fetchedAt = DateTime(2026, 5, 18, 6, 30);
      const profile = StatsProfileSnapshot(
        userId: 'u1',
        firstName: 'Ava',
        lastName: 'Day',
        yardSystemId: 'Y001',
        shiftPreference: 'day',
      );

      await db.writeStatsSnapshot(
        rangeKey: 'last_day:2026-05-18:2026-05-18',
        startYmd: '2026-05-18',
        endYmd: '2026-05-18',
        snapshot: StatsRemoteSnapshot(
          records: const [
            StatsPerformanceRecord(
              userId: 'u1',
              reportDateYmd: '2026-05-18',
              numberOfMoves: 12,
              avgTimeToCollect: '1:30',
              avgTimeToTravel: '2:45',
              numberOfFullLocations: 1,
              profile: profile,
            ),
          ],
          currentProfile: profile,
          fetchedAt: fetchedAt,
        ),
      );

      final cached = await db.readStatsSnapshot(
        rangeKey: 'last_day:2026-05-18:2026-05-18',
        startYmd: '2026-05-18',
        endYmd: '2026-05-18',
        currentUserId: 'u1',
      );

      expect(cached, isNotNull);
      expect(cached!.records.single.numberOfMoves, 12);
      expect(cached.currentProfile?.yardSystemId, 'Y001');

      await db.clearAllUserData();
      final cleared = await db.readStatsSnapshot(
        rangeKey: 'last_day:2026-05-18:2026-05-18',
        startYmd: '2026-05-18',
        endYmd: '2026-05-18',
        currentUserId: 'u1',
      );
      expect(cleared, isNull);
    });
  });
}
