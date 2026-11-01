import { describe, expect, it } from 'vitest';
import {
  buildCollectiveShunterAwardEmail,
  buildShunterAwardEmail,
  formatWinnerLine,
  getMonthLongLabel,
  groupShunterAwardsByAgency,
  periodLabel,
  winnerDisplayName,
} from './shunterAwardEmails';

describe('getMonthLongLabel', () => {
  it('formats YYYY-MM as long English month', () => {
    expect(getMonthLongLabel('2026-11')).toBe('November 2026');
  });

  it('returns empty for missing key', () => {
    expect(getMonthLongLabel('')).toBe('');
    expect(getMonthLongLabel(null)).toBe('');
  });
});

describe('winnerDisplayName / periodLabel', () => {
  it('builds name from parts', () => {
    expect(winnerDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace');
  });

  it('prefers fullName', () => {
    expect(winnerDisplayName({ fullName: 'Ada L', firstName: 'X' })).toBe('Ada L');
  });

  it('labels periods', () => {
    expect(periodLabel('day')).toBe('Day');
    expect(periodLabel('night')).toBe('Night / Afternoon');
  });
});

describe('formatWinnerLine', () => {
  it('includes agency and amount', () => {
    expect(
      formatWinnerLine({
        period: 'day',
        fullName: 'Day Winner',
        agencyName: 'Alpha Staff',
        amount: 50,
      })
    ).toBe('- Day: Day Winner (Alpha Staff) – £50');
  });

  it('uses No agency when missing', () => {
    expect(
      formatWinnerLine({ period: 'night', fullName: 'Night Winner', amount: 50 })
    ).toBe('- Night / Afternoon: Night Winner (No agency) – £50');
  });
});

describe('buildCollectiveShunterAwardEmail', () => {
  it('builds Hello all announcement with agencies and no recognition text', () => {
    const { subject, body } = buildCollectiveShunterAwardEmail({
      monthKey: '2026-11',
      winners: [
        {
          period: 'day',
          fullName: 'Day Winner',
          agencyName: 'Alpha Staff',
          amount: 50,
        },
        {
          period: 'night',
          firstName: 'Night',
          lastName: 'Winner',
          agencyName: 'Beta Crew',
          amount: 50,
        },
      ],
    });

    expect(subject).toBe('Shunter of the Month – November 2026');
    expect(body).toContain('Hello all,');
    expect(body).toContain('For November 2026, Shunter of the Month is:');
    expect(body).toContain('- Day: Day Winner (Alpha Staff) – £50');
    expect(body).toContain('- Night / Afternoon: Night Winner (Beta Crew) – £50');
    expect(body).toContain('Thank you');
    expect(body).not.toContain('recognition');
    expect(body).not.toContain('Yard operations');
  });
});

describe('buildShunterAwardEmail', () => {
  it('builds per-agency body with agency lines and no recognition', () => {
    const { subject, body } = buildShunterAwardEmail({
      monthKey: '2026-11',
      winners: [
        { period: 'day', fullName: 'Day Winner', agencyName: 'Alpha Staff', amount: 50 },
      ],
    });

    expect(subject).toBe('Shunter of the Month – November 2026');
    expect(body).toContain('Hello,');
    expect(body).toContain('- Day: Day Winner (Alpha Staff) – £50');
    expect(body).not.toContain('recognition');
    expect(body).not.toContain('according to our agreement');
  });
});

describe('groupShunterAwardsByAgency', () => {
  const day = {
    period: 'day',
    firstName: 'Day',
    lastName: 'One',
    amount: 50,
    agencyId: 'a1',
    agencyName: 'Alpha Staff',
    agencyEmail: 'alpha@example.com, ops@alpha.com',
    userId: 'u1',
  };
  const nightSame = {
    period: 'night',
    firstName: 'Night',
    lastName: 'Same',
    amount: 50,
    agencyId: 'a1',
    agencyName: 'Alpha Staff',
    agencyEmail: 'alpha@example.com',
    userId: 'u2',
  };
  const nightOther = {
    period: 'night',
    firstName: 'Night',
    lastName: 'Other',
    amount: 50,
    agencyId: 'a2',
    agencyName: 'Beta Crew',
    agencyEmail: 'beta@example.com',
    userId: 'u3',
  };
  const orphan = {
    period: 'day',
    firstName: 'Solo',
    lastName: 'Person',
    amount: 50,
    agencyId: null,
    agencyName: null,
    agencyEmail: null,
    userId: 'u4',
  };
  const noEmail = {
    period: 'night',
    firstName: 'No',
    lastName: 'Mail',
    amount: 50,
    agencyId: 'a3',
    agencyName: 'Gamma Ltd',
    agencyEmail: '',
    userId: 'u5',
  };

  it('groups same agency into one draft with both winners', () => {
    const groups = groupShunterAwardsByAgency([day, nightSame], '2026-11');
    expect(groups).toHaveLength(1);
    expect(groups[0].agencyName).toBe('Alpha Staff');
    expect(groups[0].hasEmail).toBe(true);
    expect(groups[0].emails).toEqual(['alpha@example.com', 'ops@alpha.com']);
    expect(groups[0].winners).toHaveLength(2);
    expect(groups[0].winners[0].period).toBe('day');
    expect(groups[0].winners[0].agencyName).toBe('Alpha Staff');
    expect(groups[0].subject).toContain('November 2026');
    expect(groups[0].body).toContain('(Alpha Staff)');
    expect(groups[0].body).not.toContain('recognition');
    expect(groups[0].mailtoHref).toMatch(/^mailto:/);
    expect(groups[0].mailtoTooLong).toBe(false);
  });

  it('creates separate groups per agency', () => {
    const groups = groupShunterAwardsByAgency([day, nightOther], '2026-11');
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.agencyName).sort()).toEqual(['Alpha Staff', 'Beta Crew']);
  });

  it('puts people without agency in a warning group without mailto', () => {
    const groups = groupShunterAwardsByAgency([orphan], '2026-11');
    expect(groups).toHaveLength(1);
    expect(groups[0].hasEmail).toBe(false);
    expect(groups[0].agencyName).toBe('No agency assigned');
    expect(groups[0].mailtoHref).toBeNull();
  });

  it('keeps agency without email as non-mailto group', () => {
    const groups = groupShunterAwardsByAgency([noEmail], '2026-11');
    expect(groups).toHaveLength(1);
    expect(groups[0].agencyName).toBe('Gamma Ltd');
    expect(groups[0].hasEmail).toBe(false);
    expect(groups[0].mailtoHref).toBeNull();
  });
});
