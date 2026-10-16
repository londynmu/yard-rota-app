import { shouldAutoReload } from './reloadGuard';

const now = 1_700_000_000_000;

const openPage = {
  pathname: '/calendar',
  serverVersion: '2026-10-16T20:00:00.000Z',
  currentVersion: '2026-10-14T03:09:54.275Z',
  attemptedVersion: null,
  now,
  attempts: [],
  blockedUntil: 0,
};

describe('shouldAutoReload', () => {
  test('does not reload during a pre-check', () => {
    expect(shouldAutoReload({ ...openPage, pathname: '/precheck' })).toBe(false);
    expect(shouldAutoReload({ ...openPage, pathname: '/precheck/tug/abc' })).toBe(false);
  });

  test('allows one reload for a new server version', () => {
    expect(shouldAutoReload(openPage)).toBe(true);
  });

  test('stops after that server version was already tried', () => {
    expect(shouldAutoReload({
      ...openPage,
      attemptedVersion: openPage.serverVersion,
    })).toBe(false);
  });

  test('allows a later server version after an older attempt', () => {
    expect(shouldAutoReload({
      ...openPage,
      serverVersion: '2026-10-17T01:00:00.000Z',
      attemptedVersion: openPage.serverVersion,
    })).toBe(true);
  });

  test('does not start a second refresh after a version reload was already tried', () => {
    expect(shouldAutoReload({
      ...openPage,
      serverVersion: null,
      attemptedVersion: '2026-10-16T20:00:00.000Z',
    })).toBe(false);
  });

  test('does not reload when the phone already has that version', () => {
    expect(shouldAutoReload({
      ...openPage,
      currentVersion: openPage.serverVersion,
    })).toBe(false);
  });
});
