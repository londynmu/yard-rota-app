import { describe, expect, it } from 'vitest';
import {
  buildVmuDefectAlertBody,
  buildVmuDefectAlertSubject,
  isValidVmuDefectFromEmail,
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

describe('buildVmuDefectAlertSubject / body', () => {
  it('builds subject with tug and item', () => {
    expect(
      buildVmuDefectAlertSubject({
        tugLabel: 'Tug 12',
        itemLabel: 'Service brakes',
        description: 'worn',
        reportedBy: 'Ada',
        vmuUrl: 'https://shunters.net/vmu',
      }),
    ).toBe('New defect: Tug 12 — Service brakes');
  });

  it('includes automatic disclaimer and no-reply wording', () => {
    const body = buildVmuDefectAlertBody({
      tugLabel: 'Tug 12',
      itemLabel: 'Lights',
      description: 'broken lens',
      reportedBy: 'Bob Smith',
      locationName: 'Rugby',
      source: 'check_item',
      vmuUrl: 'https://shunters.net/vmu',
      hasPhotoAttachment: true,
    });
    expect(body).toContain('Tug: Tug 12');
    expect(body).toContain('What is wrong: broken lens');
    expect(body).toContain('Photo: attached');
    expect(body).toContain('This is an automatic email');
    expect(body).toContain('not monitored');
    expect(body).toContain('Do not reply');
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
