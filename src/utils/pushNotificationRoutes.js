/**
 * Map FCM / inbox notification `type` to an in-app path.
 * System tray text stays short; this only controls where a tap lands.
 */
export const PUSH_TYPE_BREAK_REMINDER = 'break_reminder';
export const PUSH_TYPE_PRECHECK_REMINDER = 'precheck_reminder';
export const PUSH_TYPE_ROTA_ASSIGNMENT_DIGEST = 'rota_assignment_digest';

/**
 * @param {string | null | undefined} type
 * @returns {string | null} app path, or null when type is unknown
 */
export function pathForPushNotificationType(type) {
  switch (type) {
    case PUSH_TYPE_BREAK_REMINDER:
      return '/brakes';
    case PUSH_TYPE_PRECHECK_REMINDER:
      return '/precheck';
    case PUSH_TYPE_ROTA_ASSIGNMENT_DIGEST:
      return '/notifications';
    default:
      return null;
  }
}
