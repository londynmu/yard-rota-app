/** "First Last" from a profile-like object, or `fallback` when both parts are empty. */
export function formatUserName(person, fallback = 'Unknown') {
  const name = [person?.first_name, person?.last_name]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || fallback;
}

/** Up to two uppercase initials, e.g. "VF" for Vasile Floarea. */
export function getUserInitials(person) {
  const initials = [person?.first_name, person?.last_name]
    .map((part) => (part || '').trim().charAt(0))
    .join('')
    .toUpperCase();
  return initials || '?';
}
