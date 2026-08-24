import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:yard_rota_flutter/core/network/models.dart';
import 'package:yard_rota_flutter/features/stage_three/data/stage_three_repository.dart';
import 'package:yard_rota_flutter/features/stage_three/domain/stage_three_models.dart';
import 'package:yard_rota_flutter/features/vmu/presentation/vmu_shell_screen.dart';

void main() {
  const admin = UserSession(
    userId: 'admin',
    displayName: 'Admin',
    role: UserRole.admin,
  );
  const vmu = UserSession(
    userId: 'vmu',
    displayName: 'VMU',
    role: UserRole.vmu,
  );
  const shunter = UserSession(
    userId: 'user',
    displayName: 'Shunter',
    role: UserRole.user,
  );

  late StageThreeRepository repository;
  setUp(() {
    repository = StageThreeRepository(
      SupabaseClient(
        'https://example.supabase.co',
        'test-key',
        authOptions: const AuthClientOptions(autoRefreshToken: false),
      ),
    );
  });

  test('VMU navigation contains defects and PreChecks only', () {
    expect(vmuSectionsForSession(vmu), VmuSection.values);
    expect(vmuSectionsForSession(admin), VmuSection.values);
    expect(vmuSectionsForSession(shunter), isEmpty);
  });

  test('repository enforces VMU and admin mutation roles', () {
    expect(() => repository.requireVmu(admin), returnsNormally);
    expect(() => repository.requireVmu(vmu), returnsNormally);
    expect(
      () => repository.requireVmu(shunter),
      throwsA(isA<StageThreeAuthorizationException>()),
    );
    expect(() => repository.requireAdmin(admin), returnsNormally);
    expect(
      () => repository.requireAdmin(vmu),
      throwsA(isA<StageThreeAuthorizationException>()),
    );
  });

  test('repair lifecycle maps all production statuses', () {
    expect(RepairStatus.fromDb('open'), RepairStatus.open);
    expect(RepairStatus.fromDb('reported'), RepairStatus.reported);
    expect(RepairStatus.fromDb('awaiting_parts'), RepairStatus.awaitingParts);
    expect(RepairStatus.fromDb('in_progress'), RepairStatus.inProgress);
    expect(RepairStatus.fromDb('resolved'), RepairStatus.resolved);
  });

  test('defect filters search operational fields', () {
    final defect = DefectRecord(
      id: 'd1',
      submissionId: 's1',
      tugId: 't1',
      tugLabel: 'Tug Alpha',
      tugNumber: '06925',
      description: 'Broken mirror',
      status: RepairStatus.awaitingParts,
      createdAt: DateTime.utc(2026, 8, 9),
      reporterName: 'Alex Smith',
      defectNumber: 'D-123',
      vmuNotes: 'Part ordered',
    );
    expect(defect.matches(tug: 't1', status: 'awaiting_parts'), isTrue);
    expect(defect.matches(search: 'part ordered'), isTrue);
    expect(defect.matches(search: 'd-123'), isTrue);
    expect(defect.matches(tug: 'other'), isFalse);
  });

  test('settings domain values are safely clamped', () {
    expect(parseConfirmationCount('0'), 1);
    expect(parseConfirmationCount('200'), 99);
    expect(parseConfirmationCount('4'), 4);
    expect(parseMaximumConsecutiveDays('0'), 1);
    expect(parseMaximumConsecutiveDays('20'), 13);
    expect(parseMaximumConsecutiveDays('6'), 6);
  });

  test('performance CSV aggregates multiple shifts', () {
    const csv = '''
Yard ID,Name,Moves,Avg Collect,Avg Travel
AG10,Alex Smith,20,3.0,4.0
AG10,Alex Smith,30,5.0,6.0
BG20,Jamie Jones,10,2.0,3.0
''';
    final rows = CsvPerformanceParser.parse(csv);
    expect(rows, hasLength(2));
    final alex = rows.firstWhere((row) => row.yardSystemId == 'AG10');
    expect(alex.moves, 50);
    expect(alex.shiftCount, 2);
    expect(alex.averageCollect, 4);
    expect(alex.averageTravel, 5);
  });
}
