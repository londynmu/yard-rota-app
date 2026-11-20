import { describe, expect, it } from 'vitest';
import {
  AUTO_DUE_SOURCE,
  buildAutoDueAssessmentPayload,
  defaultNextDueFromFirstLogin,
  firstLoginYmd,
  isAutoDueAssessment,
  isReassessmentEligibleRole,
} from './reassessmentDefaults';

describe('reassessmentDefaults', () => {
  it('allows shunter user roles only', () => {
    expect(isReassessmentEligibleRole('user')).toBe(true);
    expect(isReassessmentEligibleRole(null)).toBe(true);
    expect(isReassessmentEligibleRole('')).toBe(true);
    expect(isReassessmentEligibleRole('admin')).toBe(false);
    expect(isReassessmentEligibleRole('vmu')).toBe(false);
    expect(isReassessmentEligibleRole('transport_manager')).toBe(false);
    expect(isReassessmentEligibleRole('transport')).toBe(false);
  });

  it('computes due date one year after first login', () => {
    expect(defaultNextDueFromFirstLogin('2025-04-24T10:00:00Z')).toBe('2026-04-24');
    expect(firstLoginYmd('2025-04-24T10:00:00Z')).toBe('2025-04-24');
  });

  it('builds auto-due payload with source marker', () => {
    const payload = buildAutoDueAssessmentPayload({
      user: {
        id: 'u1',
        role: 'user',
        created_at: '2025-04-24T12:00:00Z',
        first_name: 'Ada',
        last_name: 'Lovelace',
      },
      createdBy: 'admin1',
    });
    expect(payload.user_id).toBe('u1');
    expect(payload.assessment_date).toBe('2025-04-24');
    expect(payload.next_due_date).toBe('2026-04-24');
    expect(payload.profile_snapshot.source).toBe(AUTO_DUE_SOURCE);
    expect(payload.created_by).toBe('admin1');
    expect(isAutoDueAssessment(payload)).toBe(true);
  });
});
