import {
  assignmentSlotKey,
  buildAdditionalBookingsEmail,
  buildMailtoHref,
  countAdditionalPeople,
  diffAddedSlots,
  EMAIL_SIGN_OFF,
  formatShiftClock,
  formatWeekRangeLabel,
  groupAddedSlotsByAgency,
  isMailtoTooLong,
  parseAgencyEmails,
} from './rotaAdditionalBookings';

describe('formatShiftClock', () => {
  test('strips seconds from Postgres time', () => {
    expect(formatShiftClock('07:00:00')).toBe('07:00');
    expect(formatShiftClock('15:30:00')).toBe('15:30');
    expect(formatShiftClock('7:05:09')).toBe('07:05');
  });

  test('keeps HH:mm unchanged', () => {
    expect(formatShiftClock('07:00')).toBe('07:00');
    expect(formatShiftClock('23:45')).toBe('23:45');
  });

  test('handles empty values', () => {
    expect(formatShiftClock('')).toBe('');
    expect(formatShiftClock(null)).toBe('');
    expect(formatShiftClock(undefined)).toBe('');
  });
});

describe('assignmentSlotKey', () => {
  test('normalizes time and date so 07:00:00 matches 07:00', () => {
    const a = assignmentSlotKey({
      user_id: 'u1',
      date: '2026-08-29T00:00:00.000Z',
      start_time: '07:00:00',
      end_time: '15:00:00',
      location: 'Yard A',
    });
    const b = assignmentSlotKey({
      user_id: 'u1',
      date: '2026-08-29',
      start_time: '07:00',
      end_time: '15:00',
      location: 'Yard A',
    });
    expect(a).toBe(b);
  });
});

const janeWed = {
  user_id: 'jane',
  first_name: 'Jane',
  last_name: 'Doe',
  date: '2026-08-26',
  start_time: '07:00:00',
  end_time: '15:00:00',
  location: 'Dagenham',
  shift_type: 'day',
  agency_id: 'ag-1',
  agency_name: 'Agency One',
  agency_email: 'one@agency.test',
};

const janeFri = {
  ...janeWed,
  date: '2026-08-28',
  start_time: '17:00:00',
  end_time: '07:00:00',
  shift_type: 'night',
};

const johnNew = {
  user_id: 'john',
  first_name: 'John',
  last_name: 'Smith',
  date: '2026-08-27',
  start_time: '07:00:00',
  end_time: '15:00:00',
  location: 'Dagenham',
  shift_type: 'day',
  agency_id: 'ag-1',
  agency_name: 'Agency One',
  agency_email: 'one@agency.test',
};

describe('diffAddedSlots', () => {
  test('ignores slots already in the baseline', () => {
    const added = diffAddedSlots([janeWed, janeFri], [janeWed]);
    expect(added).toHaveLength(1);
    expect(added[0].date).toBe('2026-08-28');
  });

  test('returns a fully new person', () => {
    const added = diffAddedSlots([janeWed, johnNew], [janeWed]);
    expect(added.map((s) => s.user_id)).toEqual(['john']);
  });
});

describe('groupAddedSlotsByAgency', () => {
  test('marks extra shifts vs new bookings and sorts chronologically', () => {
    const added = [janeFri, johnNew];
    const groups = groupAddedSlotsByAgency(added, [janeWed]);
    expect(groups).toHaveLength(1);
    expect(groups[0].people).toHaveLength(2);

    const jane = groups[0].people.find((p) => p.userId === 'jane');
    const john = groups[0].people.find((p) => p.userId === 'john');
    expect(jane.kind).toBe('extra');
    expect(john.kind).toBe('new');
    expect(jane.shifts[0].start_time).toBe('17:00');
  });

  test('puts people without an agency in No agency', () => {
    const orphan = { ...johnNew, agency_id: null, agency_name: '', agency_email: '' };
    const groups = groupAddedSlotsByAgency([orphan], []);
    expect(groups[0].agencyId).toBeNull();
    expect(groups[0].agencyName).toBe('No agency');
    expect(countAdditionalPeople(groups)).toBe(1);
  });
});

describe('additional booking email', () => {
  test('uses Michal Warda and HH:mm hours', () => {
    const groups = groupAddedSlotsByAgency([janeFri, johnNew], [janeWed]);
    const { subject, body } = buildAdditionalBookingsEmail({
      weekStartIso: '2026-08-22',
      people: groups[0].people,
    });
    expect(subject).toContain('22/08/2026');
    expect(formatWeekRangeLabel('2026-08-22')).toBe('22/08/2026 - 28/08/2026');
    expect(body).toContain(EMAIL_SIGN_OFF);
    expect(body).not.toContain('Keith Thomas');
    expect(body).toContain('17:00-07:00');
    expect(body).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(body).toContain('John Smith (new booking)');
    expect(body).toContain('Jane Doe (extra shifts)');
  });

  test('parses multiple agency emails', () => {
    expect(parseAgencyEmails('a@x.test, b@x.test;\nc@x.test')).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
    ]);
  });

  test('mailto length helper', () => {
    const href = buildMailtoHref({
      emails: ['one@agency.test'],
      subject: 'Hi',
      body: 'x'.repeat(1900),
    });
    expect(isMailtoTooLong(href, 'x'.repeat(1900))).toBe(true);
    expect(isMailtoTooLong('mailto:a@b.c?subject=Hi&body=ok', 'ok')).toBe(false);
  });
});
