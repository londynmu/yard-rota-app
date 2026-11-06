import { describe, expect, it } from 'vitest';
import {
  adminResendIdempotencyKey,
  assignmentPingIdempotencyKey,
  classifyRotaWhatsAppRecipient,
  filterReadyRecipientIds,
  formatCreatorDisplayName,
  formatRotaWeekRangeShort,
  formatShiftDateLong,
  formatShiftTimeAmPm,
  formatShunterLocations,
  formatShunterShiftSummary,
  isRotaWhatsAppBlockingStatus,
  shunterWeekIdempotencyKey,
  summarizeRotaWhatsAppPreview,
} from './rotaWhatsApp';

describe('rotaWhatsApp idempotency keys', () => {
  it('builds week and ping keys', () => {
    expect(shunterWeekIdempotencyKey('2026-11-07', 'user-1')).toBe(
      'shunter_week:2026-11-07:user-1',
    );
    expect(assignmentPingIdempotencyKey('rota-99')).toBe(
      'assignment_ping:rota-99:shunter',
    );
  });

  it('builds unique resend keys from a base key', () => {
    expect(adminResendIdempotencyKey('shunter_week:2026-11-07:user-1', 1700000000000))
      .toBe('shunter_week:2026-11-07:user-1:resend:1700000000000');
  });
});

describe('rotaWhatsApp formatting', () => {
  it('formats am/pm times without minutes on the hour', () => {
    expect(formatShiftTimeAmPm('17:00:00')).toBe('5pm');
    expect(formatShiftTimeAmPm('05:45')).toBe('5:45am');
    expect(formatShiftTimeAmPm('12:00')).toBe('12pm');
    expect(formatShiftTimeAmPm('00:30')).toBe('12:30am');
  });

  it('formats long dates without weekday names', () => {
    expect(formatShiftDateLong('2026-12-21')).toBe('21 December');
  });

  it('formats short week ranges', () => {
    expect(formatRotaWeekRangeShort('2026-11-07')).toBe('07–13 Nov');
    expect(formatRotaWeekRangeShort('2026-11-28')).toBe('28 Nov–04 Dec');
  });

  it('stacks shift summary per day with dates and times only', () => {
    const summary = formatShunterShiftSummary([
      { date: '2026-12-22', start_time: '05:45', end_time: '18:00' },
      { date: '2026-12-21', start_time: '17:00', end_time: '17:00' },
    ]);
    expect(summary).toBe('21 December, 5pm–5pm · 22 December, 5:45am–6pm');
  });

  it('joins unique locations', () => {
    expect(formatShunterLocations([
      { location: 'DIRFT' },
      { location: 'DIRFT' },
      { location: 'Corby' },
    ])).toBe('DIRFT, Corby');
  });

  it('formats creator display name', () => {
    expect(formatCreatorDisplayName({ first_name: 'Michal', last_name: 'Warda' }))
      .toBe('Michal Warda');
    expect(formatCreatorDisplayName({})).toBe('Yard Rota');
  });
});

describe('rotaWhatsApp recipient filter', () => {
  it('classifies phone, consent, ready, and already sent', () => {
    expect(classifyRotaWhatsAppRecipient({
      userId: 'a',
      phoneE164: null,
      whatsappOptIn: true,
    }).status).toBe('skipped_no_phone');

    expect(classifyRotaWhatsAppRecipient({
      userId: 'b',
      phoneE164: '+447700900123',
      whatsappOptIn: false,
    }).label).toBe('Skipped: no WhatsApp consent');

    expect(classifyRotaWhatsAppRecipient({
      userId: 'c',
      phoneE164: '+447700900123',
      whatsappOptIn: true,
    }).status).toBe('ready');

    const already = classifyRotaWhatsAppRecipient({
      userId: 'd',
      phoneE164: '+447700900123',
      whatsappOptIn: true,
      alreadySent: true,
      lastSentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(already.status).toBe('already_sent');
    expect(already.canForceResend).toBe(true);
  });

  it('blocks force resend during cooldown', () => {
    const row = classifyRotaWhatsAppRecipient({
      userId: 'e',
      phoneE164: '+447700900123',
      whatsappOptIn: true,
      alreadySent: true,
      lastSentAt: new Date().toISOString(),
    }, { now: Date.now(), cooldownMs: 15 * 60 * 1000 });
    expect(row.canForceResend).toBe(false);
  });

  it('summarizes and filters ready ids', () => {
    const classified = [
      { userId: '1', status: 'ready' },
      { userId: '2', status: 'skipped_no_phone' },
      { userId: '3', status: 'already_sent' },
      { userId: '4', status: 'ready' },
    ];
    expect(summarizeRotaWhatsAppPreview(classified)).toEqual({
      ready: 2,
      skipped: 1,
      alreadySent: 1,
    });
    expect(filterReadyRecipientIds(classified)).toEqual(['1', '4']);
  });

  it('recognizes blocking ledger statuses', () => {
    expect(isRotaWhatsAppBlockingStatus('sent')).toBe(true);
    expect(isRotaWhatsAppBlockingStatus('failed')).toBe(false);
  });
});
