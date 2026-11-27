import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: (...args) => from(...args),
  },
}));

describe('fetchAdminProfilesCached', () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    from.mockReset();
  });

  it('single-flights concurrent callers into one RPC', async () => {
    let resolveRpc;
    const rpcPromise = new Promise((resolve) => {
      resolveRpc = resolve;
    });
    rpc.mockReturnValue(rpcPromise);

    const { fetchAdminProfilesCached, invalidateAdminProfilesCache } = await import('./adminProfilesCache');
    invalidateAdminProfilesCache();

    const a = fetchAdminProfilesCached();
    const b = fetchAdminProfilesCached();
    expect(rpc).toHaveBeenCalledTimes(1);

    resolveRpc({ data: [{ id: '1', first_name: 'A', last_name: 'B', role: 'user' }], error: null });
    const [usersA, usersB] = await Promise.all([a, b]);
    expect(usersA).toEqual(usersB);
    expect(usersA[0].id).toBe('1');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns TTL cache on a later call without a second RPC', async () => {
    rpc.mockResolvedValue({
      data: [{ id: '2', first_name: 'C', last_name: 'D', role: 'user' }],
      error: null,
    });

    const { fetchAdminProfilesCached, invalidateAdminProfilesCache } = await import('./adminProfilesCache');
    invalidateAdminProfilesCache();

    await fetchAdminProfilesCached();
    await fetchAdminProfilesCached();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
