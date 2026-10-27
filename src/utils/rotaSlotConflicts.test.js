import { describe, expect, it } from 'vitest';
import {
  collectCrossDayRestConflictIds,
  collectSameDayConflictIds,
} from './rotaSlotConflicts';

describe('rotaSlotConflicts', () => {
  it('always flags hour overlap even when min rest is 0', () => {
    const { overlappingConflictIds, breakConflictIds } = collectSameDayConflictIds(
      { id: 'new', start_time: '07:00', end_time: '17:00' },
      [
        {
          id: 'other',
          start_time: '08:00',
          end_time: '16:00',
          assigned_employees: ['u1'],
        },
      ],
      0
    );
    expect(overlappingConflictIds.has('u1')).toBe(true);
    expect(breakConflictIds.size).toBe(0);
  });

  it('flags previous night vs next morning rest shortfall', () => {
    const { breakConflictIds, overlappingConflictIds } = collectCrossDayRestConflictIds(
      { start_time: '07:00', end_time: '17:00' },
      [
        {
          start_time: '17:45',
          end_time: '06:30',
          assigned_employees: ['u1'],
          shift_type: 'night',
        },
      ],
      60,
      'previousNight'
    );
    expect(overlappingConflictIds.has('u1')).toBe(false);
    expect(breakConflictIds.has('u1')).toBe(true);
  });

  it('flags wall-clock overlap when night ends after morning starts', () => {
    const { overlappingConflictIds } = collectCrossDayRestConflictIds(
      { start_time: '07:00', end_time: '17:00' },
      [
        {
          start_time: '17:45',
          end_time: '08:00',
          assigned_employees: ['u1'],
        },
      ],
      0,
      'previousNight'
    );
    expect(overlappingConflictIds.has('u1')).toBe(true);
  });

  it('checks night against next morning day when assigning night', () => {
    const { breakConflictIds } = collectCrossDayRestConflictIds(
      { start_time: '17:45', end_time: '06:30' },
      [
        {
          start_time: '07:00',
          end_time: '17:00',
          assigned_employees: ['u1'],
        },
      ],
      60,
      'nextMorning'
    );
    expect(breakConflictIds.has('u1')).toBe(true);
  });
});
