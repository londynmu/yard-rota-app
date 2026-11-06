/**
 * Normalize and validate phone numbers for WhatsApp messaging (E.164).
 * Default country is GB (+44) for UK yard staff.
 */

const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPhoneE164(value) {
  return typeof value === 'string' && E164_RE.test(value);
}

/**
 * Strip formatting and convert common UK / international inputs to E.164.
 * Empty / whitespace-only → null. Invalid non-empty → throws Error with EN message.
 *
 * @param {unknown} input
 * @param {{ defaultCountry?: 'GB' }} [options]
 * @returns {string|null}
 */
export function normalizePhoneE164(input, options = {}) {
  const defaultCountry = options.defaultCountry || 'GB';
  if (input == null) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  let digits = raw.replace(/[\s\-().]/g, '');

  if (digits.startsWith('00')) {
    digits = `+${digits.slice(2)}`;
  }

  if (!digits.startsWith('+')) {
    if (defaultCountry === 'GB') {
      if (digits.startsWith('0')) {
        digits = `+44${digits.slice(1)}`;
      } else if (/^\d{10,11}$/.test(digits)) {
        // Bare national number without leading 0 (e.g. 7xxxxxxxxx)
        digits = `+44${digits}`;
      } else {
        throw new Error('Enter a valid UK mobile number (e.g. +447… or 07…)');
      }
    } else {
      throw new Error('Phone number must include a country code (e.g. +44…)');
    }
  }

  // Keep only + and digits
  digits = `+${digits.slice(1).replace(/\D/g, '')}`;

  if (!isValidPhoneE164(digits)) {
    throw new Error('Enter a valid phone number in international format (E.164)');
  }

  return digits;
}

/**
 * Profile is ready for WhatsApp PreCheck reminders.
 * @param {{ phone_e164?: string|null, whatsapp_opt_in?: boolean|null }} profile
 * @returns {boolean}
 */
export function isWhatsAppMessagingReady(profile) {
  return Boolean(
    profile?.whatsapp_opt_in && isValidPhoneE164(profile?.phone_e164 || ''),
  );
}

/**
 * Short admin chip label for WhatsApp readiness.
 * @param {{ phone_e164?: string|null, whatsapp_opt_in?: boolean|null }} profile
 * @returns {'WA ready'|'no phone'|'no consent'}
 */
export function whatsAppReadyLabel(profile) {
  if (!isValidPhoneE164(profile?.phone_e164 || '')) return 'no phone';
  if (!profile?.whatsapp_opt_in) return 'no consent';
  return 'WA ready';
}
