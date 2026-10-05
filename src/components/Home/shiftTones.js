/** Shift colour tones shared by the Home cards (amber = day, orange = afternoon, blue = night). */
export const SHIFT_TONES = [
  {
    id: 'day',
    label: 'Day shift',
    short: 'Day',
    row: 'bg-gradient-to-r from-amber-50 via-amber-50/70 to-slate-50 border-amber-200',
    tile: 'border-amber-200/70',
    pill: 'bg-amber-50 border-amber-200 text-amber-700',
    value: 'text-amber-800',
    text: 'text-amber-700',
  },
  {
    id: 'afternoon',
    label: 'Afternoon shift',
    short: 'Aft',
    row: 'bg-gradient-to-r from-orange-50 via-orange-50/70 to-slate-50 border-orange-200',
    tile: 'border-orange-200/70',
    pill: 'bg-orange-50 border-orange-200 text-orange-700',
    value: 'text-orange-800',
    text: 'text-orange-700',
  },
  {
    id: 'night',
    label: 'Night shift',
    short: 'Night',
    row: 'bg-gradient-to-r from-blue-50 via-blue-50/70 to-slate-50 border-blue-200',
    tile: 'border-blue-200/70',
    pill: 'bg-blue-50 border-blue-200 text-blue-700',
    value: 'text-blue-800',
    text: 'text-blue-700',
  },
];

export const SHIFT_TONE_BY_ID = Object.fromEntries(SHIFT_TONES.map((tone) => [tone.id, tone]));
