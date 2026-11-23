import { describe, expect, it } from 'vitest';
import {
  pathForPushNotificationType,
  PUSH_TYPE_BREAK_REMINDER,
  PUSH_TYPE_PRECHECK_REMINDER,
  PUSH_TYPE_ROTA_ASSIGNMENT_DIGEST,
} from './pushNotificationRoutes';

describe('pathForPushNotificationType', () => {
  it('routes break reminders to breaks', () => {
    expect(pathForPushNotificationType(PUSH_TYPE_BREAK_REMINDER)).toBe('/brakes');
  });

  it('routes precheck / unfinished task nudges to precheck', () => {
    expect(pathForPushNotificationType(PUSH_TYPE_PRECHECK_REMINDER)).toBe('/precheck');
  });

  it('routes rota digests to the notifications center', () => {
    expect(pathForPushNotificationType(PUSH_TYPE_ROTA_ASSIGNMENT_DIGEST)).toBe(
      '/notifications',
    );
  });

  it('returns null for unknown types', () => {
    expect(pathForPushNotificationType('info')).toBeNull();
    expect(pathForPushNotificationType(undefined)).toBeNull();
  });
});
