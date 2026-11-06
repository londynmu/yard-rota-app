/**
 * Safe Web Storage helpers for environments where localStorage / sessionStorage
 * throw (e.g. Android Chrome with blocked storage / SecurityError).
 *
 * Never throws. Falls back to an in-memory Map for the page lifetime when
 * native storage is unavailable.
 */

/**
 * @param {() => Storage} getNativeStorage
 * @returns {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => void,
 *   removeItem: (key: string) => void,
 *   keys: () => string[],
 * }}
 */
export function createSafeStorage(getNativeStorage) {
  const memory = new Map();
  let useMemoryOnly = false;
  let nativeVerified = false;

  const getNative = () => {
    if (typeof window === 'undefined') return null;
    try {
      return getNativeStorage();
    } catch {
      return null;
    }
  };

  const probeNative = (store) => {
    if (!store) return false;
    try {
      const probeKey = '__safe_storage_probe__';
      store.setItem(probeKey, '1');
      store.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  };

  const resolveBackend = () => {
    if (useMemoryOnly) return null;
    const native = getNative();
    if (nativeVerified) return native;
    if (probeNative(native)) {
      nativeVerified = true;
      return native;
    }
    useMemoryOnly = true;
    return null;
  };

  return {
    getItem(key) {
      try {
        const native = resolveBackend();
        if (native) {
          try {
            return native.getItem(key);
          } catch {
            useMemoryOnly = true;
          }
        }
      } catch {
        useMemoryOnly = true;
      }
      return memory.has(key) ? memory.get(key) : null;
    },

    setItem(key, value) {
      const str = String(value);
      try {
        const native = resolveBackend();
        if (native) {
          try {
            native.setItem(key, str);
            return;
          } catch {
            useMemoryOnly = true;
          }
        }
      } catch {
        useMemoryOnly = true;
      }
      memory.set(key, str);
    },

    removeItem(key) {
      try {
        const native = resolveBackend();
        if (native) {
          try {
            native.removeItem(key);
          } catch {
            useMemoryOnly = true;
          }
        }
      } catch {
        useMemoryOnly = true;
      }
      memory.delete(key);
    },

    keys() {
      try {
        const native = resolveBackend();
        if (native) {
          try {
            // Prefer Storage.length / Storage.key (Object.keys(localStorage) is unreliable)
            if (typeof native.key === 'function' && typeof native.length === 'number') {
              const out = [];
              for (let i = 0; i < native.length; i += 1) {
                const k = native.key(i);
                if (k != null) out.push(k);
              }
              return out;
            }
          } catch {
            useMemoryOnly = true;
          }
        }
      } catch {
        useMemoryOnly = true;
      }
      return Array.from(memory.keys());
    },
  };
}

export const safeLocalStorage = createSafeStorage(() => window.localStorage);
export const safeSessionStorage = createSafeStorage(() => window.sessionStorage);
