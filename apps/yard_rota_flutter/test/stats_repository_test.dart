import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/stats/data/stats_repository.dart';
import 'package:yard_rota_flutter/features/stats/domain/stats_models.dart';

void main() {
  group('stats time parsing', () {
    test('supports numeric, M:SS and HH:MM:SS values', () {
      expect(statsTimeToSeconds(null), 0);
      expect(statsTimeToSeconds(''), 0);
      expect(statsTimeToSeconds('90'), 90);
      expect(statsTimeToSeconds(91.2), 91);
      expect(statsTimeToSeconds('2:30'), 150);
      expect(statsTimeToSeconds('1:02:03'), 3723);
      expect(statsSecondsToTime(150), '2:30');
    });
  });

  group('buildStatsDashboard', () {
    const currentProfile = StatsProfileSnapshot(
      userId: 'u1',
      firstName: 'Ava',
      lastName: 'Day',
      yardSystemId: 'Y001',
      shiftPreference: 'day',
    );
    const otherProfile = StatsProfileSnapshot(
      userId: 'u2',
      firstName: 'Ben',
      lastName: 'Night',
      yardSystemId: 'Y002',
      shiftPreference: 'night',
    );

    test('aggregates weighted averages and ranks by total moves', () {
      final data = buildStatsDashboard(
        records: const [
          StatsPerformanceRecord(
            userId: 'u1',
            reportDateYmd: '2026-05-18',
            numberOfMoves: 10,
            avgTimeToCollect: '1:00',
            avgTimeToTravel: '2:00',
            numberOfFullLocations: 2,
            profile: currentProfile,
          ),
          StatsPerformanceRecord(
            userId: 'u1',
            reportDateYmd: '2026-05-19',
            numberOfMoves: 30,
            avgTimeToCollect: '2:00',
            avgTimeToTravel: '4:00',
            numberOfFullLocations: 3,
            profile: currentProfile,
          ),
          StatsPerformanceRecord(
            userId: 'u2',
            reportDateYmd: '2026-05-18',
            numberOfMoves: 20,
            avgTimeToCollect: '0:50',
            avgTimeToTravel: '3:00',
            numberOfFullLocations: 1,
            profile: otherProfile,
          ),
        ],
        currentProfile: currentProfile,
        currentUserId: 'u1',
        range: StatsRangeFilter.lastWeek,
        sort: StatsSortOption.totalMoves,
        shiftFilter: StatsShiftFilter.all,
        fetchedAt: DateTime(2026, 5, 20),
        isFromCache: false,
      );

      expect(data.users, hasLength(2));
      expect(data.currentUser?.rank, 1);
      expect(data.currentUser?.totalMoves, 40);
      expect(data.currentUser?.daysWorked, 2);
      expect(data.currentUser?.avgCollectSeconds, 105);
      expect(data.currentUser?.avgTravelSeconds, 210);
      expect(data.currentUser?.totalFullLocations, 5);
      expect(data.team.totalMoves, 60);
      expect(data.trend.map((point) => point.dateYmd), contains('2026-05-17'));
    });

    test('filters inactive, missing yard id and shift mismatches', () {
      final data = buildStatsDashboard(
        records: const [
          StatsPerformanceRecord(
            userId: 'u1',
            reportDateYmd: '2026-05-18',
            numberOfMoves: 10,
            avgTimeToCollect: '1:00',
            avgTimeToTravel: '2:00',
            numberOfFullLocations: 0,
            profile: currentProfile,
          ),
          StatsPerformanceRecord(
            userId: 'u2',
            reportDateYmd: '2026-05-18',
            numberOfMoves: 20,
            avgTimeToCollect: '1:00',
            avgTimeToTravel: '2:00',
            numberOfFullLocations: 0,
            profile: otherProfile,
          ),
          StatsPerformanceRecord(
            userId: 'u3',
            reportDateYmd: '2026-05-18',
            numberOfMoves: 20,
            avgTimeToCollect: '1:00',
            avgTimeToTravel: '2:00',
            numberOfFullLocations: 0,
            profile: StatsProfileSnapshot(userId: 'u3', isActive: false),
          ),
        ],
        currentProfile: currentProfile,
        currentUserId: 'u1',
        range: StatsRangeFilter.lastDay,
        sort: StatsSortOption.totalMoves,
        shiftFilter: StatsShiftFilter.day,
        fetchedAt: DateTime(2026, 5, 20),
        isFromCache: false,
      );

      expect(data.users, hasLength(1));
      expect(data.users.first.userId, 'u1');
    });

    test('handles empty known data without marking missing Yard ID', () {
      final data = buildStatsDashboard(
        records: const [],
        currentProfile: currentProfile,
        currentUserId: 'u1',
        range: StatsRangeFilter.lastDay,
        sort: StatsSortOption.totalMoves,
        shiftFilter: StatsShiftFilter.all,
        fetchedAt: DateTime(2026, 5, 20),
        isFromCache: true,
      );

      expect(data.hasAnyData, isFalse);
      expect(data.currentUserHasYardId, isTrue);
      expect(data.currentUser, isNull);
    });
  });
}
