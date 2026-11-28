import { describe, expect, it } from 'vitest';
import {
  addCalendarDaysYmd,
  buildVmuDigestBody,
  buildVmuDigestSubject,
  digestStatusRank,
  getVmuDigestWindow,
  isValidVmuDefectFromEmail,
  londonWallToUtc,
  VMU_DEFECT_EMAIL_FROM_CANONICAL,
} from './vmuDefectAlertEmail';
import { parseAgencyEmails } from './rotaAdditionalBookings';

describe('isValidVmuDefectFromEmail', () => {
  it('accepts addresses on shunters.net', () => {
    expect(isValidVmuDefectFromEmail(VMU_DEFECT_EMAIL_FROM_CANONICAL)).toBe(true);
    expect(isValidVmuDefectFromEmail('defects@shunters.net')).toBe(true);
  });

  it('rejects other domains and empty values', () => {
    expect(isValidVmuDefectFromEmail('vmu@other.com')).toBe(false);
    expect(isValidVmuDefectFromEmail('')).toBe(false);
    expect(isValidVmuDefectFromEmail('not-an-email')).toBe(false);
  });
});

describe('getVmuDigestWindow', () => {
  it('morning window is previous 21:00 → today 10:00 London', () => {
    // 2026-03-15 12:00 UTC = 12:00 GMT London (before BST)
    const now = new Date('2026-03-15T12:00:00.000Z');
    const window = getVmuDigestWindow('morning', now);
    expect(window.londonDate).toBe('2026-03-15');
    expect(window.idempotencyKey).toBe('digest:morning:2026-03-15');
    expect(window.windowStart.toISOString()).toBe(
      londonWallToUtc('2026-03-14', '21:00:00').toISOString(),
    );
    expect(window.windowEnd.toISOString()).toBe(
      londonWallToUtc('2026-03-15', '10:00:00').toISOString(),
    );
  });

  it('evening window is today 10:00 → today 21:00 London', () => {
    const now = new Date('2026-03-15T12:00:00.000Z');
    const window = getVmuDigestWindow('evening', now);
    expect(window.londonDate).toBe('2026-03-15');
    expect(window.idempotencyKey).toBe('digest:evening:2026-03-15');
    expect(window.windowStart.toISOString()).toBe(
      londonWallToUtc('2026-03-15', '10:00:00').toISOString(),
    );
    expect(window.windowEnd.toISOString()).toBe(
      londonWallToUtc('2026-03-15', '21:00:00').toISOString(),
    );
  });

  it('rejects invalid slot', () => {
    expect(() => getVmuDigestWindow('noon')).toThrow(/Invalid digest slot/);
  });
});

describe('addCalendarDaysYmd', () => {
  it('rolls across month boundaries', () => {
    expect(addCalendarDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('buildVmuDigestSubject / body', () => {
  it('builds subject with slot and London date', () => {
    expect(
      buildVmuDigestSubject({ slot: 'morning', londonDate: '2026-03-15' }),
    ).toBe('VMU defect digest — morning 10:00 (2026-03-15)');
  });

  it('includes counts, status priority (not severity), list, and auto disclaimer', () => {
    const body = buildVmuDigestBody(
      [
        {
          tugLabel: 'Tug 12',
          itemLabel: 'Lights',
          description: 'broken lens',
          reportedBy: 'Bob Smith',
          locationName: 'Rugby',
          source: 'check_item',
          repairStatus: 'open',
          createdAt: '2026-03-15T09:00:00.000Z',
          hasPhoto: true,
        },
        {
          tugLabel: 'Tug 3',
          itemLabel: 'Remarks',
          description: 'noise',
          reportedBy: 'Ada',
          source: 'remarks',
          repairStatus: 'acknowledged',
          createdAt: '2026-03-15T08:00:00.000Z',
          hasPhoto: false,
        },
      ],
      {
        slot: 'morning',
        londonDate: '2026-03-15',
        windowStart: londonWallToUtc('2026-03-14', '21:00:00'),
        windowEnd: londonWallToUtc('2026-03-15', '10:00:00'),
        vmuUrl: 'https://shunters.net/vmu',
      },
    );
    expect(body).toContain('Total new defects: 2');
    expect(body).toContain('check_item: 1');
    expect(body).toContain('remarks: 1');
    expect(body).toContain('open / acknowledged listed first');
    expect(body).toContain('Tug 12');
    expect(body).toContain('What is wrong: broken lens');
    expect(body).toContain('This is an automatic email');
    expect(body).toContain('not monitored');
    expect(body).toContain('Do not reply');
    expect(body).not.toMatch(/\bseverity\b/i);
    // open before acknowledged
    expect(body.indexOf('Tug 12')).toBeLessThan(body.indexOf('Tug 3'));
  });

  it('ranks open before acknowledged', () => {
    expect(digestStatusRank('open')).toBeLessThan(digestStatusRank('acknowledged'));
  });
});

describe('vmu_defect_alert_emails parsing (reuse agency parser)', () => {
  it('parses multi-address mailing list fields', () => {
    const parsed = parseAgencyEmails(
      'vmu@shunters.net, Alerts <list@shunters.net>; other@example.com',
    );
    expect(parsed).toHaveLength(3);
    expect(parsed).toEqual(
      expect.arrayContaining([
        'vmu@shunters.net',
        'list@shunters.net',
        'other@example.com',
      ]),
    );
  });
});
