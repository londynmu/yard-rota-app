import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchVmuDamagesCached,
  fetchVmuMetaCached,
  invalidateVmuLoadCache,
} from './vmuLoadCache';

describe('vmuLoadCache', () => {
  beforeEach(() => {
    invalidateVmuLoadCache();
  });

  it('dedupes concurrent meta loads (Strict Mode)', async () => {
    const loader = vi.fn(async () => ({
      tugs: [{ id: '1' }],
      checkItemLabels: { brakes: 'Brakes' },
    }));

    const [a, b] = await Promise.all([
      fetchVmuMetaCached(loader),
      fetchVmuMetaCached(loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a.tugs).toEqual([{ id: '1' }]);
    expect(b.checkItemLabels.brakes).toBe('Brakes');
  });

  it('dedupes concurrent damages loads for same key', async () => {
    const loader = vi.fn(async () => [{ id: 'd1' }]);

    const [a, b] = await Promise.all([
      fetchVmuDamagesCached('open', '', loader),
      fetchVmuDamagesCached('open', '', loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual([{ id: 'd1' }]);
    expect(b).toEqual([{ id: 'd1' }]);
  });

  it('invalidate forces a fresh load', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ tugs: [{ id: '1' }], checkItemLabels: {} })
      .mockResolvedValueOnce({ tugs: [{ id: '2' }], checkItemLabels: {} });

    await fetchVmuMetaCached(loader);
    invalidateVmuLoadCache();
    const next = await fetchVmuMetaCached(loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(next.tugs[0].id).toBe('2');
  });
});
