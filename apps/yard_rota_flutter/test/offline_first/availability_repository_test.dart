import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/local_db/app_local_database.dart';
import 'package:yard_rota_flutter/core/network/api_client.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/core/network/my_rota_models.dart';
import 'package:yard_rota_flutter/features/calendar/data/availability_repository.dart';

void main() {
  group('AvailabilityRepository offline-first', () {
    test('save writes local state immediately', () async {
      final api = _FakeApiClient();
      final db = AppLocalDatabase.inMemory();
      final repository = AvailabilityRepository(apiClient: api, localDb: db);

      await repository.save(
        request: const SaveAvailabilityRequest(
          items: [
            SaveAvailabilityItem(
              dateYmd: '2026-04-29',
              status: AvailabilityStatus.available,
            ),
          ],
          comment: '',
          applyComment: false,
        ),
      );

      final local = await db.readAvailabilityRange(
        startYmd: '2026-04-29',
        endYmd: '2026-04-29',
      );

      expect(local['2026-04-29'], isNotNull);
      expect(local['2026-04-29']!.status, AvailabilityStatus.available);
    });

    test(
      'failed sync stays queued and flush succeeds after reconnect',
      () async {
        final api = _FakeApiClient(shouldFailSave: true);
        final db = AppLocalDatabase.inMemory();
        final repository = AvailabilityRepository(apiClient: api, localDb: db);

        await repository.save(
          request: const SaveAvailabilityRequest(
            items: [
              SaveAvailabilityItem(
                dateYmd: '2026-04-30',
                status: AvailabilityStatus.unavailable,
              ),
            ],
            comment: '',
            applyComment: false,
          ),
        );

        await repository.flushOutbox();
        var pending = await db.readPendingOutbox();
        expect(pending, isNotEmpty);

        api.shouldFailSave = false;
        await db.markOutboxRetry(
          id: pending.first.id,
          attemptCount: pending.first.attemptCount,
          nextRetryAt: 0,
          lastError: '',
        );
        await repository.flushOutbox();

        pending = await db.readPendingOutbox();
        expect(pending, isEmpty);
      },
    );
  });
}

class _FakeApiClient implements ApiClient {
  _FakeApiClient({this.shouldFailSave = false});

  bool shouldFailSave;
  final Map<String, AvailabilityStatus> savedStatuses =
      <String, AvailabilityStatus>{};

  @override
  Future<List<AvailabilityEntry>> getAvailabilityRange({
    required String startYmd,
    required String endYmd,
  }) async {
    return savedStatuses.entries
        .where(
          (entry) =>
              entry.key.compareTo(startYmd) >= 0 &&
              entry.key.compareTo(endYmd) <= 0,
        )
        .map(
          (entry) => AvailabilityEntry(
            dateYmd: entry.key,
            status: entry.value,
            comment: null,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<CalendarMonthData> getCalendarMonth({
    required int year,
    required int month,
  }) {
    return Future.value(
      CalendarMonthData(
        year: year,
        month: month,
        scheduledDays: const [],
        fetchedAt: DateTime.now(),
      ),
    );
  }

  @override
  Future<UserSession> login({required String email, required String password}) {
    return Future.value(
      const UserSession(userId: 'u1', displayName: 'Shunter'),
    );
  }

  @override
  Future<UserSession?> restoreSession() {
    return Future.value(
      const UserSession(userId: 'u1', displayName: 'Shunter'),
    );
  }

  @override
  Future<void> saveAvailability({
    required SaveAvailabilityRequest request,
  }) async {
    if (shouldFailSave) {
      throw Exception('offline');
    }
    for (final item in request.items) {
      savedStatuses[item.dateYmd] = item.status;
    }
  }

  @override
  Future<void> signOut() async {}

  @override
  Future<List<LocationOption>> getActiveLocations() async => const [];

  @override
  Future<MyRotaAnchorShift?> getMyRotaAnchorShift({
    required String userId,
    required String fromYmd,
  }) async => null;

  @override
  Future<MyRotaWeekData> getMyRotaWeek({
    required String weekStartYmd,
    required String locationName,
    required String shiftTypeFilter,
  }) async => MyRotaWeekData(
    slotsByDateYmd: const {},
    attendanceBySlotId: const {},
    fetchedAt: DateTime.now(),
  );

  @override
  Future<void> saveMyRotaAttendance({
    required String scheduledRotaId,
    MyRotaAttendanceStatus? status,
  }) async {}
}
