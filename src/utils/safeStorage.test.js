import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createSafeStorage } from './safeStorage';

function createThrowingStorage(errorMessage = 'Access is denied') {
  const err = new DOMException(errorMessage, 'SecurityError');
  return {
    getItem: () => {
      throw err;
    },
    setItem: () => {
      throw err;
    },
    removeItem: () => {
      throw err;
    },
  };
}

function createMapStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('createSafeStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  it('reads and writes through native storage when available', () => {
    const native = createMapStorage();
    const storage = createSafeStorage(() => native);

    expect(storage.getItem('missing')).toBe(null);
    storage.setItem('k', 'v');
    expect(native.getItem('k')).toBe('v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(native.getItem('k')).toBe(null);
    expect(storage.getItem('k')).toBe(null);
  });

  it('falls back to memory when accessing native storage throws', () => {
    const storage = createSafeStorage(() => {
      throw new DOMException('Access is denied', 'SecurityError');
    });

    expect(() => storage.setItem('a', '1')).not.toThrow();
    expect(storage.getItem('a')).toBe('1');
    expect(() => storage.removeItem('a')).not.toThrow();
    expect(storage.getItem('a')).toBe(null);
  });

  it('falls back to memory when get/set/remove throw SecurityError', () => {
    const storage = createSafeStorage(() => createThrowingStorage());

    expect(() => storage.setItem('session', 'ok')).not.toThrow();
    expect(storage.getItem('session')).toBe('ok');
    storage.setItem('session', 'updated');
    expect(storage.getItem('session')).toBe('updated');
    storage.removeItem('session');
    expect(storage.getItem('session')).toBe(null);
  });

  it('coerces values to string like Web Storage', () => {
    const storage = createSafeStorage(() => {
      throw new Error('blocked');
    });
    storage.setItem('n', 42);
    expect(storage.getItem('n')).toBe('42');
  });

  it('switches to memory mid-session if native starts failing', () => {
    const native = createMapStorage();
    let failWrites = false;
    const flaky = {
      getItem: (key) => native.getItem(key),
      setItem: (key, value) => {
        if (failWrites) throw new DOMException('Access is denied', 'SecurityError');
        native.setItem(key, value);
      },
      removeItem: (key) => native.removeItem(key),
    };
    const storage = createSafeStorage(() => flaky);

    storage.setItem('before', '1');
    expect(native.getItem('before')).toBe('1');

    failWrites = true;
    expect(() => storage.setItem('after', '2')).not.toThrow();
    expect(storage.getItem('after')).toBe('2');
  });

  it('works when window is undefined (SSR / Node)', () => {
    vi.stubGlobal('window', undefined);
    const storage = createSafeStorage(() => {
      throw new Error('should not be called');
    });
    storage.setItem('ssr', 'yes');
    expect(storage.getItem('ssr')).toBe('yes');
  });

  it('lists keys from native or memory backend', () => {
    const native = createMapStorage();
    const storage = createSafeStorage(() => native);
    storage.setItem('a', '1');
    storage.setItem('b', '2');
    expect(storage.keys().sort()).toEqual(['a', 'b']);

    const blocked = createSafeStorage(() => createThrowingStorage());
    blocked.setItem('m', '1');
    expect(blocked.keys()).toEqual(['m']);
  });
});
