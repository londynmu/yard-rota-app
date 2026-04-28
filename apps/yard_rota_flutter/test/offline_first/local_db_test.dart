import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/local_db/app_local_database.dart';
import 'package:yard_rota_flutter/core/network/models.dart';

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
  });
}
