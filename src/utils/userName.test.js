import { formatUserName, getUserInitials } from './userName';

describe('formatUserName', () => {
  test('joins first and last name', () => {
    expect(formatUserName({ first_name: 'Vasile', last_name: 'Floarea' })).toBe('Vasile Floarea');
  });

  test('trims parts and skips empty ones', () => {
    expect(formatUserName({ first_name: '  Alex ', last_name: '' })).toBe('Alex');
    expect(formatUserName({ first_name: null, last_name: 'Glover' })).toBe('Glover');
  });

  test('uses the fallback when there is no name', () => {
    expect(formatUserName({})).toBe('Unknown');
    expect(formatUserName(null, 'this user')).toBe('this user');
  });
});

describe('getUserInitials', () => {
  test('returns uppercase initials', () => {
    expect(getUserInitials({ first_name: 'punjab', last_name: 'singh' })).toBe('PS');
  });

  test('returns a placeholder when there is no name', () => {
    expect(getUserInitials({ first_name: '', last_name: null })).toBe('?');
  });
});
