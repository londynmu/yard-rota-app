import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetBreaksLoadCacheForTests,
  fetchActiveLocationsCached,
  fetchProfilesByIdsCached,
  fetchPreferredBreakMinutesCached,
  singleFlightBreakData,
  sortBreakLocations,
} from './breaksLoadCache';

describe('breaksLoadCache', () => {
  beforeEach(() => {
    __resetBreaksLoadCacheForTests();
  });

  it('sorts preferred hubs first', () => {
    const sorted = sortBreakLocations([
      { id: 1, name: 'Barnsley' },
      { id: 2, name: 'Nuneaton' },
      { id: 3, name: 'Rugby' },
      { id: 4, name: 'NRC' },
    ]);
    expect(sorted.map((l) => l.name)).toEqual(['Rugby', 'NRC', 'Nuneaton', 'Barnsley']);
  });

  it('single-flights concurrent break data loads', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    };
    const [a, b] = await Promise.all([
      singleFlightBreakData('k1', loader),
      singleFlightBreakData('k1', loader),
    ]);
    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(calls).toBe(1);
  });

  it('caches locations and profiles', async () => {
    let locationCalls = 0;
    let profileCalls = 0;
    const locs = await fetchActiveLocationsCached(async () => {
      locationCalls += 1;
      return [{ id: '1', name: 'Rugby' }];
    });
    const locs2 = await fetchActiveLocationsCached(async () => {
      locationCalls += 1;
      return [{ id: '1', name: 'Rugby' }];
    });
    expect(locs).toEqual(locs2);
    expect(locationCalls).toBe(1);

    const profiles = await fetchProfilesByIdsCached(['a', 'b'], async () => {
      profileCalls += 1;
      return [{ id: 'a' }, { id: 'b' }];
    });
    const profiles2 = await fetchProfilesByIdsCached(['b', 'a'], async () => {
      profileCalls += 1;
      return [{ id: 'a' }, { id: 'b' }];
    });
    expect(profiles).toEqual(profiles2);
    expect(profileCalls).toBe(1);
  });

  it('caches preferred break minutes by shift', async () => {
    let calls = 0;
    const first = await fetchPreferredBreakMinutesCached('Day', async () => {
      calls += 1;
      return { u1: 600 };
    });
    const second = await fetchPreferredBreakMinutesCached('day', async () => {
      calls += 1;
      return { u1: 999 };
    });
    expect(first).toEqual({ u1: 600 });
    expect(second).toEqual({ u1: 600 });
    expect(calls).toBe(1);
  });
});
