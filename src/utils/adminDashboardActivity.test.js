import { describe, expect, it } from 'vitest';
import {
  diversifySystemItems,
  formatAssessmentActivityItem,
  formatSystemActivityItem,
  interleaveActivityItems,
  mergeActivityItems,
  targetUserIdFromPayload,
} from './adminDashboardActivity';

describe('adminDashboardActivity', () => {
  it('reads assigned target from rota payload', () => {
    expect(
      targetUserIdFromPayload(
        { assigned_user_id: 'u-1', date: '2026-11-17' },
        'employee_assigned',
      ),
    ).toBe('u-1');
  });

  it('formats rota assign as actor + target', () => {
    const item = formatSystemActivityItem(
      {
        id: 'log-1',
        first_name: 'Andrzej',
        last_name: 'Kowalski',
        entity_type: 'rota',
        action_type: 'employee_assigned',
        payload: { assigned_user_id: 'u-2', date: '2026-11-17' },
        created_at: '2026-11-17T10:00:00Z',
      },
      { 'u-2': 'Marcin Kuzminski' },
    );
    expect(item).toMatchObject({
      title: 'Andrzej Kowalski',
      detail: 'Rota · Assigned Marcin Kuzminski',
      section: 'rota-planner',
    });
  });

  it('formats assessment with creator', () => {
    const item = formatAssessmentActivityItem({
      id: 'a-1',
      user_id: 'u-9',
      assessment_date: '2026-11-16',
      created_at: '2026-11-17T01:00:00Z',
      profiles: { first_name: 'Constantin', last_name: 'Marcu' },
      created_by_profile: { first_name: 'Michal', last_name: 'Warda' },
    });
    expect(item).toMatchObject({
      kind: 'assessment',
      title: 'Constantin Marcu',
      detail: 'Shunter assessment · by Michal Warda · 2026-11-16',
      userId: 'u-9',
      section: 'users',
    });
  });

  it('merges newest first and respects limit', () => {
    const merged = mergeActivityItems(
      [
        [{ id: '1', at: '2026-11-16T10:00:00Z' }],
        [{ id: '2', at: '2026-11-17T10:00:00Z' }, { id: '3', at: '2026-11-15T10:00:00Z' }],
      ],
      2,
    );
    expect(merged.map((x) => x.id)).toEqual(['2', '1']);
  });

  it('caps repeated system actions', () => {
    const capped = diversifySystemItems(
      [
        { id: 'a', actionType: 'break_assignment_added', at: '3' },
        { id: 'b', actionType: 'break_assignment_added', at: '2' },
        { id: 'c', actionType: 'break_assignment_added', at: '1' },
        { id: 'd', actionType: 'break_assignment_added', at: '0' },
        { id: 'e', actionType: 'employee_assigned', at: '4' },
      ],
      3,
    );
    expect(capped.map((x) => x.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('interleaves sources then sorts by time', () => {
    const mixed = interleaveActivityItems(
      [
        [{ id: 'assess', at: '2026-11-16T12:00:00Z' }],
        [{ id: 'rota', at: '2026-11-17T12:00:00Z' }],
        [{ id: 'check', at: '2026-11-15T12:00:00Z' }],
      ],
      3,
    );
    expect(mixed.map((x) => x.id)).toEqual(['rota', 'assess', 'check']);
  });
});
