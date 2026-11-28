/**
 * Pure helpers for VMU defect alert email copy (EN).
 * Used by unit tests; Edge Function mirrors the same wording.
 */

export const VMU_DEFECT_EMAIL_FROM_CANONICAL = 'vmu@shunters.net';
export const VMU_DEFECT_EMAIL_FROM_DOMAIN = 'shunters.net';
export const VMU_DEFECT_EMAIL_FROM_NAME_DEFAULT = 'VMU Alerts';

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
 * @param {{
 *   tugLabel: string,
 *   itemLabel: string,
 *   description: string,
 *   reportedBy: string,
 *   locationName?: string|null,
 *   source?: string|null,
 *   vmuUrl: string,
 *   hasPhotoAttachment?: boolean,
 * }} input
 */
export function buildVmuDefectAlertSubject(input) {
  const tug = String(input.tugLabel || 'Tug').trim() || 'Tug';
  const item = String(input.itemLabel || 'Check item').trim() || 'Check item';
  return `New defect: ${tug} — ${item}`;
}

/**
 * @param {{
 *   tugLabel: string,
 *   itemLabel: string,
 *   description: string,
 *   reportedBy: string,
 *   locationName?: string|null,
 *   source?: string|null,
 *   vmuUrl: string,
 *   hasPhotoAttachment?: boolean,
 * }} input
 */
export function buildVmuDefectAlertBody(input) {
  const tug = String(input.tugLabel || 'Unknown tug').trim() || 'Unknown tug';
  const item = String(input.itemLabel || 'Check item').trim() || 'Check item';
  const description = String(input.description || '').trim() || '(no description)';
  const reportedBy = String(input.reportedBy || 'Unknown').trim() || 'Unknown';
  const location = String(input.locationName || '').trim();
  const source = String(input.source || '').trim();
  const vmuUrl = String(input.vmuUrl || '').trim() || 'https://shunters.net/vmu';
  const photoLine = input.hasPhotoAttachment
    ? 'Photo: attached to this email (first photo from the report).'
    : 'Photo: none attached.';

  const lines = [
    'A new pre-check defect was reported.',
    '',
    `Tug: ${tug}`,
  ];
  if (location) lines.push(`Location: ${location}`);
  lines.push(`Check item: ${item}`);
  if (source) lines.push(`Source: ${source}`);
  lines.push(`Reported by: ${reportedBy}`);
  lines.push(`What is wrong: ${description}`);
  lines.push(photoLine);
  lines.push('');
  lines.push(`Open VMU: ${vmuUrl}`);
  lines.push('');
  lines.push('---');
  lines.push('This is an automatic email from Yard Rota VMU alerts.');
  lines.push('This email is not monitored.');
  lines.push('Do not reply — replies are not read and will not receive a response.');

  return lines.join('\n');
}
