import { isIdbConnectionLost } from './precheckQueue';

describe('isIdbConnectionLost', () => {
  test('recognises Safari dropping the local database', () => {
    const error = new Error('Connection to Indexed Database server lost. Refresh the page to try again');
    error.name = 'UnknownError';
    expect(isIdbConnectionLost(error)).toBe(true);
  });

  test('ignores ordinary database errors', () => {
    expect(isIdbConnectionLost(new Error('QuotaExceededError'))).toBe(false);
    expect(isIdbConnectionLost(null)).toBe(false);
  });
});
