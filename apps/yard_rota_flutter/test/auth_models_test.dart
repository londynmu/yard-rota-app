import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/core/network/models.dart';

void main() {
  group('UserSession gates', () {
    test('regular user must complete profile before entering', () {
      const session = UserSession(
        userId: 'user',
        displayName: 'User',
        profileCompleted: false,
        accountStatus: AccountStatus.pendingApproval,
      );

      expect(session.requiresProfileCompletion, isTrue);
      expect(session.canEnterApp, isFalse);
    });

    test('completed pending user waits for approval', () {
      const session = UserSession(
        userId: 'user',
        displayName: 'User',
        profileCompleted: true,
        accountStatus: AccountStatus.pendingApproval,
      );

      expect(session.requiresProfileCompletion, isFalse);
      expect(session.isAwaitingApproval, isTrue);
      expect(session.canEnterApp, isFalse);
    });

    test('privileged roles bypass user onboarding gates', () {
      for (final role in [
        UserRole.admin,
        UserRole.vmu,
        UserRole.transportManager,
      ]) {
        final session = UserSession(
          userId: role.dbValue,
          displayName: role.label,
          role: role,
          profileCompleted: false,
          accountStatus: AccountStatus.rejected,
        );

        expect(session.isPrivileged, isTrue);
        expect(session.requiresProfileCompletion, isFalse);
        expect(session.canEnterApp, isTrue);
      }
    });
  });

  test('unknown database role safely maps to user', () {
    expect(UserRole.fromDb('unexpected'), UserRole.user);
    expect(UserRole.fromDb(null), UserRole.user);
  });
}
