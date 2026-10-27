import { describe, expect, it } from 'vitest';
import {
  buildPrecheckImagePath,
  extractPrecheckStoragePath,
} from './precheckImageUrl';

describe('extractPrecheckStoragePath', () => {
  it('returns raw paths unchanged', () => {
    expect(extractPrecheckStoragePath('uid/damages/sub/a.jpg')).toBe(
      'uid/damages/sub/a.jpg',
    );
  });

  it('extracts path from public object URL', () => {
    const url =
      'https://jkjvtvwedjiupxoibpld.supabase.co/storage/v1/object/public/precheck-images/damages/abc/1.jpg';
    expect(extractPrecheckStoragePath(url)).toBe('damages/abc/1.jpg');
  });

  it('extracts uid-prefixed and legacy damages paths', () => {
    expect(
      extractPrecheckStoragePath(
        'https://jkjvtvwedjiupxoibpld.supabase.co/storage/v1/object/public/precheck-images/8e24d7f5-ba61-45a9-92e8-89865a8ce647/damages/a70f9596-2bf0-42bb-a2a8-f3fefbfe509d/1793126501500-xw0677jxq.jpg',
      ),
    ).toBe(
      '8e24d7f5-ba61-45a9-92e8-89865a8ce647/damages/a70f9596-2bf0-42bb-a2a8-f3fefbfe509d/1793126501500-xw0677jxq.jpg',
    );
    expect(
      extractPrecheckStoragePath(
        'https://jkjvtvwedjiupxoibpld.supabase.co/storage/v1/object/public/precheck-images/damages/8e60e089-689e-4905-9fe2-0463aca2df10/1791391977245-p8y9zzygq.jpg',
      ),
    ).toBe(
      'damages/8e60e089-689e-4905-9fe2-0463aca2df10/1791391977245-p8y9zzygq.jpg',
    );
  });

  it('extracts path from signed object URL', () => {
    const url =
      'https://example.supabase.co/storage/v1/object/sign/precheck-images/uid/temp/s/1.jpg?token=abc';
    expect(extractPrecheckStoragePath(url)).toBe('uid/temp/s/1.jpg');
  });

  it('returns null for empty input', () => {
    expect(extractPrecheckStoragePath('')).toBeNull();
    expect(extractPrecheckStoragePath(null)).toBeNull();
  });
});

describe('buildPrecheckImagePath', () => {
  it('prefixes user id', () => {
    expect(buildPrecheckImagePath('u1', 'damages', 's1', 'a.jpg')).toBe(
      'u1/damages/s1/a.jpg',
    );
  });

  it('throws without user id', () => {
    expect(() => buildPrecheckImagePath('', 'damages')).toThrow(/userId/);
  });
});
