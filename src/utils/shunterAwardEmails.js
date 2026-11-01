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
 * @param {'day' | 'night' | string} period
 * @returns {string}
 */
export function periodLabel(period) {
  return period === 'night' ? 'Night / Afternoon' : 'Day';
}

/**
 * @param {{ agencyName?: string | null }} winner
 * @returns {string}
 */
export function agencyDisplayName(winner) {
  const name = winner?.agencyName;
  if (name == null || String(name).trim() === '') return 'No agency';
  return String(name).trim();
}

/**
 * @param {{ period: string, firstName?: string, lastName?: string, fullName?: string, agencyName?: string | null, amount?: number }} winner
 * @returns {string}
 */
export function formatWinnerLine(winner) {
  const name = winnerDisplayName(winner);
  const agency = agencyDisplayName(winner);
  const amount = Number(winner?.amount) > 0 ? Number(winner.amount) : 50;
  return `- ${periodLabel(winner?.period)}: ${name} (${agency}) – £${amount}`;
}

function sortWinnersByPeriod(winners) {
  const orderPeriod = (p) => (p === 'day' ? 0 : 1);
  return [...(winners || [])].sort(
    (a, b) => orderPeriod(a.period) - orderPeriod(b.period)
  );
}

/**
 * Collective announcement for the group mailbox (copy-paste).
 * @param {{ monthKey: string, winners: Array<object> }} args
 * @returns {{ subject: string, body: string }}
 */
export function buildCollectiveShunterAwardEmail({ monthKey, winners }) {
  const monthLabel = getMonthLongLabel(monthKey) || monthKey || 'this month';
  const subject = `Shunter of the Month – ${monthLabel}`;
  const lines = sortWinnersByPeriod(winners).map(formatWinnerLine);

  const body = [
    `Hello all,`,
    ``,
    `For ${monthLabel}, Shunter of the Month is:`,
    ``,
    ...lines,
    ``,
    `Thank you`,
  ].join('\n');

  return { subject, body };
}

/**
 * Per-agency draft (optional). Same winner lines; no recognition wording.
 * @param {{ monthKey: string, winners: Array<object> }} args
 * @returns {{ subject: string, body: string }}
 */
export function buildShunterAwardEmail({ monthKey, winners }) {
  const monthLabel = getMonthLongLabel(monthKey) || monthKey || 'this month';
  const subject = `Shunter of the Month – ${monthLabel}`;
  const lines = sortWinnersByPeriod(winners).map(formatWinnerLine);

  const body = [
    `Hello,`,
    ``,
    `For ${monthLabel}, Shunter of the Month is:`,
    ``,
    ...lines,
    ``,
    `Thank you`,
  ].join('\n');

  return { subject, body };
}

/**
 * Group monthly award rows by agency for optional per-agency mailto drafts.
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
 */
export function groupShunterAwardsByAgency(awards, monthKey) {
  const groups = new Map();

  (awards || []).forEach((row) => {
    if (!row) return;
    const emails = parseAgencyEmails(row.agencyEmail);
    const hasAgency = Boolean(row.agencyId);
    const hasEmail = emails.length > 0;
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
      agencyName: row.agencyName || null,
      amount: row.amount,
      userId: row.userId,
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      group.winners = sortWinnersByPeriod(group.winners);
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
      if (a.hasEmail !== b.hasEmail) return a.hasEmail ? -1 : 1;
      return String(a.agencyName).localeCompare(String(b.agencyName));
    });
}

export { formatEmailForClipboard, buildMailtoHref, isMailtoTooLong, parseAgencyEmails };
