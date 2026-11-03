import { describe, expect, it } from 'vitest';
import { normalizeAvatarStorageUrl, parseAvatarStorageRef } from './avatarUrl';

const base = 'https://example.supabase.co/storage/v1/object/public';

describe('normalizeAvatarStorageUrl', () => {
  it('keeps nested avatars bucket double path', () => {
    const url = `${base}/avatars/avatars/user-file.jpg`;
    expect(normalizeAvatarStorageUrl(url)).toBe(url);
  });

  it('does not alter single-segment avatars URLs', () => {
    const url = `${base}/avatars/user-file.jpg`;
    expect(normalizeAvatarStorageUrl(url)).toBe(url);
  });

  it('collapses legacy user-avatars/avatars double path', () => {
    expect(normalizeAvatarStorageUrl(`${base}/user-avatars/avatars/x.jpg`)).toBe(
      `${base}/user-avatars/x.jpg`,
    );
  });

  it('returns empty/null unchanged', () => {
    expect(normalizeAvatarStorageUrl('')).toBe('');
    expect(normalizeAvatarStorageUrl(null)).toBe(null);
    expect(normalizeAvatarStorageUrl(undefined)).toBe(undefined);
  });

  it('trims whitespace', () => {
    const url = `${base}/avatars/avatars/a.jpg`;
    expect(normalizeAvatarStorageUrl(`  ${url}  `)).toBe(url);
  });
});

describe('parseAvatarStorageRef', () => {
  it('returns nested objectPath for double avatars URL', () => {
    expect(
      parseAvatarStorageRef(`${base}/avatars/avatars/plik-abc.jpg`),
    ).toEqual({
      bucket: 'avatars',
      objectPath: 'avatars/plik-abc.jpg',
    });
  });

  it('parses flat object path under avatars bucket', () => {
    expect(parseAvatarStorageRef(`${base}/avatars/flat.jpg`)).toEqual({
      bucket: 'avatars',
      objectPath: 'flat.jpg',
    });
  });

  it('strips query string from object path', () => {
    expect(
      parseAvatarStorageRef(`${base}/avatars/avatars/a.jpg?v=1`),
    ).toEqual({
      bucket: 'avatars',
      objectPath: 'avatars/a.jpg',
    });
  });

  it('returns null for invalid input', () => {
    expect(parseAvatarStorageRef('')).toBeNull();
    expect(parseAvatarStorageRef(null)).toBeNull();
    expect(parseAvatarStorageRef('https://example.com/nope')).toBeNull();
  });
});
