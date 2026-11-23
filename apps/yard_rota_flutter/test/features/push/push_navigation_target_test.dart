import 'package:flutter_test/flutter_test.dart';
import 'package:yard_rota_flutter/features/push/push_messaging_service.dart';

void main() {
  test('maps FCM types to in-app destinations', () {
    expect(
      pushNavigationTargetForType(kPushTypeBreakReminder),
      PushNavigationTarget.breaks,
    );
    expect(
      pushNavigationTargetForType(kPushTypePrecheckReminder),
      PushNavigationTarget.preCheck,
    );
    expect(
      pushNavigationTargetForType(kPushTypeRotaAssignmentDigest),
      PushNavigationTarget.notifications,
    );
    expect(pushNavigationTargetForType('info'), isNull);
  });
}
