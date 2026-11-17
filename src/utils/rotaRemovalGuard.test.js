import { describe, expect, it } from 'vitest';
import {
  buildMyRotaAttendancePath,
  getSlotEndInstant,
  getSlotStartInstant,
  shouldBlockSilentUnassign,
} from './rotaRemovalGuard';

describe('getSlotStartInstant', () => {
  it('uses date + start for day shifts', () => {
    const start = getSlotStartInstant({
      date: '2026-11-17',
      start_time: '07:00',
      end_time: '17:00',
      shift_type: 'day',
    });
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(10);
    expect(start.getDate()).toBe(17);
    expect(start.getHours()).toBe(7);
  });

  it('rolls night post-midnight start to next morning', () => {
    const start = getSlotStartInstant({
      date: '2026-11-17',
      start_time: '01:00',
      end_time: '07:00',
      shift_type: 'night',
    });
    expect(start.getDate()).toBe(18);
    expect(start.getHours()).toBe(1);
  });
});

describe('getSlotEndInstant', () => {
  it('handles overnight night end next morning', () => {
    const end = getSlotEndInstant({
      date: '2026-11-17',
      start_time: '17:00',
      end_time: '07:00',
      shift_type: 'night',
    });
    expect(end.getDate()).toBe(18);
    expect(end.getHours()).toBe(7);
  });
});

describe('shouldBlockSilentUnassign', () => {
  const daySlot = {
    date: '2026-11-17',
    start_time: '07:00',
    end_time: '17:00',
    shift_type: 'day',
  };

  it('allows silent remove more than 12h before start', () => {
    const now = new Date('2026-11-16T12:00:00');
    expect(shouldBlockSilentUnassign(daySlot, now)).toBe(false);
  });

  it('blocks inside 12h window before start', () => {
    const now = new Date('2026-11-16T20:00:00');
    expect(shouldBlockSilentUnassign(daySlot, now)).toBe(true);
  });

  it('blocks while shift is active', () => {
    const now = new Date('2026-11-17T10:00:00');
    expect(shouldBlockSilentUnassign(daySlot, now)).toBe(true);
  });

  it('allows after shift has ended', () => {
    const now = new Date('2026-11-17T18:00:00');
    expect(shouldBlockSilentUnassign(daySlot, now)).toBe(false);
  });
});

describe('buildMyRotaAttendancePath', () => {
  it('builds query for attendance deep link', () => {
    const path = buildMyRotaAttendancePath({
      date: '2026-11-17',
      location: 'Rugby',
      userId: 'abc',
      startTime: '07:00:00',
      endTime: '17:00',
      shiftType: 'Day',
    });
    expect(path.startsWith('/my-rota?')).toBe(true);
    expect(path).toContain('openAttendance=1');
    expect(path).toContain('blockedRemoval=1');
    expect(path).toContain('date=2026-11-17');
    expect(path).toContain('location=Rugby');
    expect(path).toContain('userId=abc');
    expect(path).toContain('startTime=07%3A00');
    expect(path).toContain('shiftType=day');
  });
});
