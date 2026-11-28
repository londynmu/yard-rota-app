/**
 * Pure helpers for VMU defect digest email copy (EN) + London windows.
 * Used by unit tests; Edge Function mirrors the same wording / window rules.
 */

export const VMU_DEFECT_EMAIL_FROM_CANONICAL = 'vmu@shunters.net';
export const VMU_DEFECT_EMAIL_FROM_DOMAIN = 'shunters.net';
export const VMU_DEFECT_EMAIL_FROM_NAME_DEFAULT = 'VMU Alerts';

export const VMU_DIGEST_SLOTS = {
  morning: { hour: 10, label: 'morning 10:00' },
  evening: { hour: 21, label: 'evening 21:00' },
};

/**
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
export function isValidVmuDefectFromEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw.includes('@')) return false;
  return raw.endsWith(`@${VMU_DEFECT_EMAIL_FROM_DOMAIN}`);
}

/**
 * @param {Date} date
 * @returns {{ y: number, m: number, d: number, h: number, min: number, s: number, ymd: string }}
 */
export function getLondonParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);
  const min = Number(parts.minute);
  const s = Number(parts.second);
  const ymd = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { y, m, d, h, min, s, ymd };
}

/**
 * Convert Europe/London wall clock to a UTC Date.
 * @param {string} ymd YYYY-MM-DD
 * @param {string} hms HH:mm:ss
 * @returns {Date}
 */
export function londonWallToUtc(ymd, hms = '00:00:00') {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm, ss] = hms.split(':').map((n) => Number(n) || 0);
  let utcMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  for (let i = 0; i < 4; i += 1) {
    const parts = getLondonParts(new Date(utcMs));
    const asIf = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.min, parts.s);
    const wanted = Date.UTC(y, m - 1, d, hh, mm, ss);
    utcMs += wanted - asIf;
  }
  return new Date(utcMs);
}

/**
 * @param {string} ymd YYYY-MM-DD
 * @param {number} deltaDays
 * @returns {string}
 */
export function addCalendarDaysYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Digest window for a slot at (or as-of) `now`.
 * morning: yesterday 21:00 → today 10:00 Europe/London
 * evening: today 10:00 → today 21:00 Europe/London
 *
 * @param {'morning'|'evening'} slot
 * @param {Date} [now]
 * @returns {{
 *   slot: 'morning'|'evening',
 *   londonDate: string,
 *   windowStart: Date,
 *   windowEnd: Date,
 *   idempotencyKey: string,
 *   label: string,
 * }}
 */
export function getVmuDigestWindow(slot, now = new Date()) {
  if (slot !== 'morning' && slot !== 'evening') {
    throw new Error(`Invalid digest slot: ${slot}`);
  }
  const { ymd } = getLondonParts(now);
  const label = VMU_DIGEST_SLOTS[slot].label;
  if (slot === 'morning') {
    const yesterday = addCalendarDaysYmd(ymd, -1);
    const windowStart = londonWallToUtc(yesterday, '21:00:00');
    const windowEnd = londonWallToUtc(ymd, '10:00:00');
    return {
      slot,
      londonDate: ymd,
      windowStart,
      windowEnd,
      idempotencyKey: `digest:morning:${ymd}`,
      label,
    };
  }
  const windowStart = londonWallToUtc(ymd, '10:00:00');
  const windowEnd = londonWallToUtc(ymd, '21:00:00');
  return {
    slot,
    londonDate: ymd,
    windowStart,
    windowEnd,
    idempotencyKey: `digest:evening:${ymd}`,
    label,
  };
}

/**
 * @param {{ slot: 'morning'|'evening', londonDate: string }} input
 */
export function buildVmuDigestSubject(input) {
  const label = VMU_DIGEST_SLOTS[input.slot]?.label || input.slot;
  return `VMU defect digest — ${label} (${input.londonDate})`;
}

/**
 * Operational status ranking (not severity — severity does not exist).
 * Lower = higher priority in the list.
 * @param {string|null|undefined} repairStatus
 * @returns {number}
 */
export function digestStatusRank(repairStatus) {
  const key = String(repairStatus || 'open').toLowerCase();
  if (key === 'open') return 0;
  if (key === 'acknowledged') return 1;
  if (key === 'in_progress' || key === 'in-progress') return 2;
  if (key === 'resolved' || key === 'closed') return 9;
  return 5;
}

/**
 * @param {Array<{
 *   tugLabel?: string,
 *   itemLabel?: string,
 *   description?: string,
 *   reportedBy?: string,
 *   locationName?: string|null,
 *   source?: string|null,
 *   repairStatus?: string|null,
 *   createdAt?: string|Date|null,
 *   hasPhoto?: boolean,
 * }>} defects
 * @param {{
 *   slot: 'morning'|'evening',
 *   londonDate: string,
 *   windowStart: Date,
 *   windowEnd: Date,
 *   vmuUrl: string,
 * }} meta
 */
export function buildVmuDigestBody(defects, meta) {
  const list = Array.isArray(defects) ? [...defects] : [];
  list.sort((a, b) => {
    const rank = digestStatusRank(a.repairStatus) - digestStatusRank(b.repairStatus);
    if (rank !== 0) return rank;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });

  const bySource = {};
  const byStatus = {};
  let withPhotos = 0;
  for (const d of list) {
    const source = String(d.source || 'unknown');
    bySource[source] = (bySource[source] || 0) + 1;
    const status = String(d.repairStatus || 'open');
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (d.hasPhoto) withPhotos += 1;
  }

  const fmt = (date) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date instanceof Date ? date : new Date(date));
    } catch {
      return String(date);
    }
  };

  const label = VMU_DIGEST_SLOTS[meta.slot]?.label || meta.slot;
  const lines = [
    `VMU defect digest (${label}, Europe/London).`,
    `Window: ${fmt(meta.windowStart)} → ${fmt(meta.windowEnd)}`,
    `Total new defects: ${list.length}`,
    '',
    'Counts by source:',
  ];
  const sourceKeys = Object.keys(bySource).sort();
  if (sourceKeys.length === 0) {
    lines.push('- (none)');
  } else {
    for (const key of sourceKeys) {
      lines.push(`- ${key}: ${bySource[key]}`);
    }
  }
  lines.push('Counts by status (open / acknowledged listed first):');
  const statusKeys = Object.keys(byStatus).sort(
    (a, b) => digestStatusRank(a) - digestStatusRank(b),
  );
  if (statusKeys.length === 0) {
    lines.push('- (none)');
  } else {
    for (const key of statusKeys) {
      lines.push(`- ${key}: ${byStatus[key]}`);
    }
  }
  lines.push(`With photos: ${withPhotos}`);
  lines.push('');
  lines.push('Defects (open / acknowledged first):');

  if (list.length === 0) {
    lines.push('(none)');
  } else {
    list.forEach((d, index) => {
      const tug = String(d.tugLabel || 'Unknown tug').trim() || 'Unknown tug';
      const item = String(d.itemLabel || 'Check item').trim() || 'Check item';
      const description = String(d.description || '').trim() || '(no description)';
      const reportedBy = String(d.reportedBy || 'Unknown').trim() || 'Unknown';
      const location = String(d.locationName || '').trim();
      const source = String(d.source || '').trim() || 'unknown';
      const status = String(d.repairStatus || 'open').trim() || 'open';
      const when = d.createdAt ? fmt(d.createdAt) : 'unknown time';
      lines.push('');
      lines.push(`${index + 1}. ${tug}${location ? ` @ ${location}` : ''}`);
      lines.push(`   Item: ${item}`);
      lines.push(`   Status: ${status} | Source: ${source}`);
      lines.push(`   Reported by: ${reportedBy} at ${when}`);
      lines.push(`   What is wrong: ${description}`);
      if (d.hasPhoto) lines.push('   Photo: yes (view in VMU)');
    });
  }

  lines.push('');
  lines.push(`Open VMU: ${meta.vmuUrl || 'https://shunters.net/vmu'}`);
  lines.push('');
  lines.push('---');
  lines.push('This is an automatic email from Yard Rota VMU alerts.');
  lines.push('This email is not monitored.');
  lines.push('Do not reply — replies are not read and will not receive a response.');

  return lines.join('\n');
}

/** @deprecated Instant per-defect alerts were replaced by digests. Kept for tests/back-compat. */
export function buildVmuDefectAlertSubject(input) {
  const tug = String(input.tugLabel || 'Tug').trim() || 'Tug';
  const item = String(input.itemLabel || 'Check item').trim() || 'Check item';
  return `New defect: ${tug} — ${item}`;
}

/** @deprecated Instant per-defect alerts were replaced by digests. Kept for tests/back-compat. */
export function buildVmuDefectAlertBody(input) {
  return buildVmuDigestBody(
    [{
      tugLabel: input.tugLabel,
      itemLabel: input.itemLabel,
      description: input.description,
      reportedBy: input.reportedBy,
      locationName: input.locationName,
      source: input.source,
      repairStatus: 'open',
      hasPhoto: Boolean(input.hasPhotoAttachment),
      createdAt: new Date(),
    }],
    {
      slot: 'morning',
      londonDate: getLondonParts().ymd,
      windowStart: new Date(),
      windowEnd: new Date(),
      vmuUrl: input.vmuUrl || 'https://shunters.net/vmu',
    },
  );
}
