const WILDCARD_LOCATIONS = new Set(['both', 'all', 'any']);

export function normalizeLocationName(value) {
  return value?.trim().toLowerCase() || '';
}

/**
 * A person matches a rota slot location when their main yard matches,
 * one of their extra yards matches, or their main yard is unset / any yard.
 */
export function matchesSlotLocation(preferredLocation, additionalLocations, slotLocation) {
  const preferred = normalizeLocationName(preferredLocation);
  if (!preferred || WILDCARD_LOCATIONS.has(preferred)) return true;

  const slot = normalizeLocationName(slotLocation);
  if (preferred === slot) return true;

  return (additionalLocations || []).some(
    (name) => normalizeLocationName(name) === slot
  );
}

/** True when they have a specific yard and none of their yards is this slot. */
export function hasDifferentSlotLocation(preferredLocation, additionalLocations, slotLocation) {
  const preferred = normalizeLocationName(preferredLocation);
  if (!preferred || WILDCARD_LOCATIONS.has(preferred)) return false;
  return !matchesSlotLocation(preferredLocation, additionalLocations, slotLocation);
}
