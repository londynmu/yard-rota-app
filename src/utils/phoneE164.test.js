import { describe, expect, it } from 'vitest';
import {
  isValidPhoneE164,
  isWhatsAppMessagingReady,
  normalizePhoneE164,
  whatsAppReadyLabel,
} from './phoneE164';

describe('normalizePhoneE164', () => {
  it('returns null for empty input', () => {
    expect(normalizePhoneE164('')).toBe(null);
    expect(normalizePhoneE164('   ')).toBe(null);
    expect(normalizePhoneE164(null)).toBe(null);
    expect(normalizePhoneE164(undefined)).toBe(null);
  });

  it('keeps valid E.164', () => {
    expect(normalizePhoneE164('+447700900123')).toBe('+447700900123');
  });

  it('normalizes UK national 07… to +44', () => {
    expect(normalizePhoneE164('07700 900 123')).toBe('+447700900123');
    expect(normalizePhoneE164('(07700) 900-123')).toBe('+447700900123');
  });

  it('normalizes 00 prefix to +', () => {
    expect(normalizePhoneE164('00447700900123')).toBe('+447700900123');
  });

  it('normalizes bare UK mobile without leading 0', () => {
    expect(normalizePhoneE164('7700900123')).toBe('+447700900123');
  });

  it('throws on invalid non-empty input', () => {
    expect(() => normalizePhoneE164('abc')).toThrow(/valid/i);
    expect(() => normalizePhoneE164('+12')).toThrow(/E\.164|valid/i);
  });
});

describe('isValidPhoneE164', () => {
  it('accepts E.164 lengths 8–15 digits after +', () => {
    expect(isValidPhoneE164('+447700900123')).toBe(true);
    expect(isValidPhoneE164('+12345678')).toBe(true);
    expect(isValidPhoneE164('+1234567')).toBe(false);
    expect(isValidPhoneE164('447700900123')).toBe(false);
  });
});

describe('isWhatsAppMessagingReady / whatsAppReadyLabel', () => {
  it('requires phone + opt-in', () => {
    expect(
      isWhatsAppMessagingReady({
        phone_e164: '+447700900123',
        whatsapp_opt_in: true,
      }),
    ).toBe(true);
    expect(
      isWhatsAppMessagingReady({
        phone_e164: '+447700900123',
        whatsapp_opt_in: false,
      }),
    ).toBe(false);
    expect(
      isWhatsAppMessagingReady({ phone_e164: null, whatsapp_opt_in: true }),
    ).toBe(false);
  });

  it('labels readiness for admin chips', () => {
    expect(whatsAppReadyLabel({ phone_e164: null, whatsapp_opt_in: false })).toBe(
      'no phone',
    );
    expect(
      whatsAppReadyLabel({ phone_e164: '+447700900123', whatsapp_opt_in: false }),
    ).toBe('no consent');
    expect(
      whatsAppReadyLabel({ phone_e164: '+447700900123', whatsapp_opt_in: true }),
    ).toBe('WA ready');
  });
});
