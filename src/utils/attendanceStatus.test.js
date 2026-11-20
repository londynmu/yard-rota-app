import { describe, expect, it } from 'vitest';
import {
  attendanceLabel,
  shouldUnassignAfterAttendance,
} from './attendanceStatus';

describe('attendanceStatus', () => {
  it('labels known statuses', () => {
    expect(attendanceLabel('no_show')).toBe('No show');
    expect(attendanceLabel('sick')).toBe('Sick');
    expect(attendanceLabel('other')).toBe('Other');
    expect(attendanceLabel('late')).toBe('Late');
    expect(attendanceLabel(null)).toBe(null);
  });

  it('unassigns after tracked absence statuses only', () => {
    expect(shouldUnassignAfterAttendance('no_show')).toBe(true);
    expect(shouldUnassignAfterAttendance('sick')).toBe(true);
    expect(shouldUnassignAfterAttendance('other')).toBe(true);
    expect(shouldUnassignAfterAttendance('late')).toBe(false);
    expect(shouldUnassignAfterAttendance(null)).toBe(false);
  });
});
