export const QUARTER_HOUR_TIMES = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4).toString().padStart(2, '0');
  const minutes = ((index % 4) * 15).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
});

export function defaultPreferredStartTime(shiftPreference) {
  const shift = shiftPreference?.trim().toLowerCase();
  if (shift === 'night') return '17:00';
  if (shift === 'afternoon') return '13:45';
  return '05:00';
}

export function formatPreferredStartTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}
