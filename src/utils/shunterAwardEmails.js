import {
  buildMailtoHref,
  formatEmailForClipboard,
  isMailtoTooLong,
  parseAgencyEmails,
} from './rotaAdditionalBookings';

/**
 * @param {string} monthKey YYYY-MM
 * @returns {string} e.g. "November 2026"
 */
export function getMonthLongLabel(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return '';
  try {
    const [year, month] = monthKey.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(d.getTime())) return monthKey;
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch {
    return monthKey;
  }
}

/**
 * @param {{ period: string, firstName?: string, lastName?: string, fullName?: string }} winner
 * @returns {string}
 */
export function winnerDisplayName(winner) {
  if (!winner) return 'Unknown';
  if (winner.fullName) return winner.fullName;
  const name = [winner.firstName, winner.lastName].filter(Boolean).join(' ').trim();
  return name || 'Unknown';
}

/**
 * @param {{ period: 'day' | 'night' }} winner
 * @returns {string}
 */
export function periodLabel(period) {
  return period === 'night' ? 'Night / Afternoon' : 'Day';
}

/**
 * Build subject + body for one agency (or orphan) draft.
 * @param {{ monthKey: string, winners: Array<{ period: string, firstName?: string, lastName?: string, fullName?: string, amount?: number }> }} args
 * @returns {{ subject: string, body: string }}
 */
export function buildShunterAwardEmail({ monthKey, winners }) {
  const monthLabel = getMonthLongLabel(monthKey) || monthKey || 'this month';
  const subject = `Shunter of the Month – ${monthLabel}`;

  const lines = (winners || []).map((w) => {
    const name = winnerDisplayName(w);
    const amount = Number(w.amount) > 0 ? Number(w.amount) : 50;
    return `- ${periodLabel(w.period)}: ${name} (£${amount})`;
  });

  const body = [
    `Hello,`,
    ``,
    `Please find the Shunter of the Month winners for ${monthLabel}:`,
    ``,
    ...lines,
    ``,
    `Could you please arrange recognition / payment according to our agreement with your agency?`,
    ``,
    `Thank you,`,
    `Yard operations`,
  ].join('\n');

  return { subject, body };
}

/**
 * Group monthly award rows by agency for mailto drafts.
 * Orphans (no agency / no email) are separate groups with hasEmail=false.
 *
 * @param {Array<{
 *   period: string,
 *   firstName?: string,
 *   lastName?: string,
 *   amount?: number,
 *   agencyId?: string | null,
 *   agencyName?: string | null,
 *   agencyEmail?: string | null,
 *   userId?: string,
 * }>} awards
 * @param {string} monthKey
 * @returns {Array<{
 *   key: string,
 *   agencyId: string | null,
 *   agencyName: string,
 *   agencyEmail: string | null,
 *   emails: string[],
 *   hasEmail: boolean,
 *   winners: Array<object>,
 *   subject: string,
 *   body: string,
 *   mailtoHref: string | null,
 *   mailtoTooLong: boolean,
 * }>}
 */
export function groupShunterAwardsByAgency(awards, monthKey) {
  const groups = new Map();

  (awards || []).forEach((row) => {
    if (!row) return;
    const emails = parseAgencyEmails(row.agencyEmail);
    const hasAgency = Boolean(row.agencyId);
    const hasEmail = emails.length > 0;
    // One draft per agency; orphans without agency share one bucket; agency without email stays with that agency
    const key = hasAgency ? `agency:${row.agencyId}` : 'orphan:no-agency';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        agencyId: row.agencyId || null,
        agencyName: hasAgency
          ? (row.agencyName || 'Unknown agency')
          : 'No agency assigned',
        agencyEmail: row.agencyEmail || null,
        emails,
        hasEmail,
        winners: [],
      });
    }

    const group = groups.get(key);
    // Prefer non-empty email if later row has it
    if (!group.hasEmail && hasEmail) {
      group.emails = emails;
      group.hasEmail = true;
      group.agencyEmail = row.agencyEmail || null;
    }
    if (!group.agencyName && row.agencyName) {
      group.agencyName = row.agencyName;
    }

    group.winners.push({
      period: row.period,
      firstName: row.firstName,
      lastName: row.lastName,
      fullName: winnerDisplayName(row),
      amount: row.amount,
      userId: row.userId,
    });
  });

  const orderPeriod = (p) => (p === 'day' ? 0 : 1);

  return Array.from(groups.values())
    .map((group) => {
      group.winners.sort((a, b) => orderPeriod(a.period) - orderPeriod(b.period));
      const { subject, body } = buildShunterAwardEmail({
        monthKey,
        winners: group.winners,
      });
      const mailtoHref = group.hasEmail
        ? buildMailtoHref({ emails: group.emails, subject, body })
        : null;
      const mailtoTooLong = group.hasEmail
        ? isMailtoTooLong(mailtoHref, body)
        : false;
      return {
        ...group,
        subject,
        body,
        mailtoHref,
        mailtoTooLong,
      };
    })
    .sort((a, b) => {
      // Agencies with email first, then by name
      if (a.hasEmail !== b.hasEmail) return a.hasEmail ? -1 : 1;
      return String(a.agencyName).localeCompare(String(b.agencyName));
    });
}

export { formatEmailForClipboard, buildMailtoHref, isMailtoTooLong, parseAgencyEmails };
