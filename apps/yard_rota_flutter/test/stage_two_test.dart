import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/features/admin/presentation/admin_shell_screen.dart';
import 'package:yard_rota_flutter/features/stage_two/data/stage_two_repository.dart';
import 'package:yard_rota_flutter/features/stage_two/domain/stage_two_models.dart';

void main() {
  const admin = UserSession(
    userId: 'admin',
    displayName: 'Admin',
    role: UserRole.admin,
  );
  const shunter = UserSession(
    userId: 'user',
    displayName: 'Shunter',
    role: UserRole.user,
  );
  const manager = UserSession(
    userId: 'manager',
    displayName: 'Manager',
    role: UserRole.transportManager,
  );

  late StageTwoRepository repository;
  setUp(() {
    repository = StageTwoRepository(
      SupabaseClient(
        'https://example.supabase.co',
        'test-key',
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      ),
    );
  });

  test('admin navigation is visible only to admins', () {
    expect(adminSectionsForSession(admin), AdminSection.values);
    expect(adminSectionsForSession(manager), isEmpty);
    expect(adminSectionsForSession(shunter), isEmpty);
  });

  test('transport dashboard is read-only role gated', () {
    expect(() => repository.requireTransportRead(admin), returnsNormally);
    expect(() => repository.requireTransportRead(manager), returnsNormally);
    expect(
      () => repository.requireTransportRead(shunter),
      throwsA(isA<StageTwoAuthorizationException>()),
    );
  });

  test('break mutations reject shunter and transport manager', () async {
    const draft = BreakSlotDraft(
      dateYmd: '2026-08-09',
      shift: 'day',
      location: 'Rugby',
      startTime: '09:00',
      durationMinutes: 15,
      breakType: 'Break 1',
      capacity: 2,
    );
    await expectLater(
      repository.createBreakSlot(shunter, draft),
      throwsA(isA<StageTwoAuthorizationException>()),
    );
    await expectLater(
      repository.createBreakSlot(manager, draft),
      throwsA(isA<StageTwoAuthorizationException>()),
    );
  });

  test('manager summary excludes absences from headcount', () {
    const summary = ManagerDaySummary([
      ManagerRotaEntry(
        id: '1',
        dateYmd: '2026-08-09',
        shift: 'day',
        location: 'Rugby',
        userId: 'a',
        name: 'A',
      ),
      ManagerRotaEntry(
        id: '2',
        dateYmd: '2026-08-09',
        shift: 'day',
        location: 'Rugby',
        userId: 'b',
        name: 'B',
        attendance: 'no_show',
      ),
      ManagerRotaEntry(
        id: '3',
        dateYmd: '2026-08-09',
        shift: 'night',
        location: 'Rugby',
        userId: 'c',
        name: 'C',
        attendance: 'late',
      ),
    ]);
    expect(summary.headcount('day'), 1);
    expect(summary.absences('no_show', shift: 'day'), 1);
    expect(summary.absences('late'), 1);
  });

  test('Saturday week and consecutive-day logic match rota planner', () {
    expect(stageTwoYmd(stageTwoWeekStart(DateTime(2026, 8, 9))), '2026-08-08');
    expect(
      wouldExceedMaxConsecutiveDays(
        workedDates: const [
          '2026-08-03',
          '2026-08-04',
          '2026-08-05',
          '2026-08-06',
          '2026-08-07',
          '2026-08-08',
        ],
        candidateYmd: '2026-08-09',
      ),
      isTrue,
    );
  });

  test('admin profile mapping preserves role and operational fields', () {
    final profile = StageTwoRepository.mapStaffProfile({
      'id': 'one',
      'first_name': 'Alex',
      'last_name': 'Smith',
      'yard_system_id': 'AG10',
      'shift_preference': 'night',
      'role': 'vmu',
      'is_active': false,
      'agency_name': 'Agency A',
      'last_activity_at': '2026-08-09T10:00:00Z',
    });
    expect(profile, isNotNull);
    expect(profile!.role, UserRole.vmu);
    expect(profile.shift, 'night');
    expect(profile.isActive, isFalse);
    expect(profile.agencyName, 'Agency A');
    expect(profile.lastLogin, isNotNull);
  });
}
