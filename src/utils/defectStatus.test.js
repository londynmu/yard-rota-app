import { VMU_STATUS_KEYS, getStatusOptions } from './defectStatus';

const CONFIG = {
  open: { label: 'Open', dot: 'bg-red-400' },
  reported: { label: 'Reported', dot: 'bg-orange-400' },
  awaiting_parts: { label: 'Awaiting Parts', dot: 'bg-amber-400' },
  in_progress: { label: 'In Progress', dot: 'bg-yellow-400' },
  acknowledged: { label: 'Acknowledged', dot: 'bg-slate-400' },
  resolved: { label: 'Resolved', dot: 'bg-green-400' },
};

describe('getStatusOptions', () => {
  test('returns only the four VMU statuses in order', () => {
    expect(getStatusOptions(CONFIG).map((o) => o.value)).toEqual(VMU_STATUS_KEYS);
    expect(getStatusOptions(CONFIG, 'reported').map((o) => o.label))
      .toEqual(['Open', 'Reported', 'Acknowledged', 'Resolved']);
  });

  test('keeps a legacy current status visible', () => {
    const values = getStatusOptions(CONFIG, 'awaiting_parts').map((o) => o.value);
    expect(values).toEqual([...VMU_STATUS_KEYS, 'awaiting_parts']);
  });

  test('falls back to the raw value for unknown statuses', () => {
    const last = getStatusOptions(CONFIG, 'mystery').at(-1);
    expect(last).toEqual({ value: 'mystery', label: 'mystery', dot: 'bg-slate-300' });
  });
});
