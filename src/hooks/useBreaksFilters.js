import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  fetchActiveLocationNamesCached,
  fetchShowManageBreaksCached,
} from '../utils/calendarStaticCache';

const CALENDAR_BREAKS_LOCATION_KEY = 'calendar_breaks_selected_location';
const CALENDAR_BREAKS_SHIFT_FILTERS_KEY = 'calendar_breaks_selected_shifts';
const VALID_SHIFT_TYPES = ['day', 'afternoon', 'night'];

const getInitialSelectedShifts = () => {
  try {
    const savedValue = localStorage.getItem(CALENDAR_BREAKS_SHIFT_FILTERS_KEY);
    if (!savedValue) return VALID_SHIFT_TYPES;

    const parsed = JSON.parse(savedValue);
    if (!Array.isArray(parsed)) return VALID_SHIFT_TYPES;

    const normalized = [...new Set(parsed.filter((shift) => VALID_SHIFT_TYPES.includes(shift)))];
    // Empty saved selection would permanently hide the whole break list on this device — fall back to all shifts
    return normalized.length > 0 ? normalized : VALID_SHIFT_TYPES;
  } catch (error) {
    console.warn('Failed to parse saved shift filters:', error);
    return VALID_SHIFT_TYPES;
  }
};

/**
 * Location + shift filters shared by the main page break list and today's yard summary.
 * Persisted in localStorage so every Home tab (and reloads) see the same selection.
 */
export function useBreaksFilters() {
  const [selectedLocation, setSelectedLocation] = useState(
    () => localStorage.getItem(CALENDAR_BREAKS_LOCATION_KEY) || ''
  );
  const [availableLocations, setAvailableLocations] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [selectedShifts, setSelectedShifts] = useState(getInitialSelectedShifts);
  const [showManageBreaksButton, setShowManageBreaksButton] = useState(true);

  // Fetch active locations for the breaks filter (deduped across mounts via calendarStaticCache)
  useEffect(() => {
    let cancelled = false;
    const fetchLocations = async () => {
      try {
        setLocationsLoaded(false);
        const sortedLocations = await fetchActiveLocationNamesCached(supabase);
        if (!cancelled) setAvailableLocations(sortedLocations);
      } catch (error) {
        console.error('Error fetching locations:', error);
        if (!cancelled) setAvailableLocations([]);
      } finally {
        if (!cancelled) setLocationsLoaded(true);
      }
    };

    fetchLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSetting = async () => {
      try {
        const show = await fetchShowManageBreaksCached(supabase);
        if (!cancelled) setShowManageBreaksButton(show);
      } catch (err) {
        console.warn('useBreaksFilters: could not fetch show_manage_breaks_button, defaulting to true', err);
        if (!cancelled) setShowManageBreaksButton(true);
      }
    };
    fetchSetting();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep selected location in sync with currently active locations
  // When no valid selection (first visit or saved value missing): default to Rugby if available, else first location
  useEffect(() => {
    if (!locationsLoaded) return;

    if (availableLocations.length === 0) {
      if (selectedLocation !== '') {
        setSelectedLocation('');
      }
      return;
    }

    const hasSelectedLocation = availableLocations.includes(selectedLocation);
    if (!hasSelectedLocation) {
      const defaultLocation = availableLocations.includes('Rugby')
        ? 'Rugby'
        : availableLocations[0];
      setSelectedLocation(defaultLocation);
    }
  }, [availableLocations, selectedLocation, locationsLoaded]);

  useEffect(() => {
    if (selectedLocation) {
      localStorage.setItem(CALENDAR_BREAKS_LOCATION_KEY, selectedLocation);
      return;
    }

    localStorage.removeItem(CALENDAR_BREAKS_LOCATION_KEY);
  }, [selectedLocation]);

  useEffect(() => {
    localStorage.setItem(
      CALENDAR_BREAKS_SHIFT_FILTERS_KEY,
      JSON.stringify(selectedShifts)
    );
  }, [selectedShifts]);

  const handleLocationToggle = useCallback(() => {
    if (availableLocations.length === 0) return;
    const currentIndex = availableLocations.indexOf(selectedLocation);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % availableLocations.length;
    setSelectedLocation(availableLocations[nextIndex]);
  }, [selectedLocation, availableLocations]);

  const handleShiftToggle = useCallback((shiftType) => {
    setSelectedShifts((prev) =>
      prev.includes(shiftType)
        ? prev.filter((s) => s !== shiftType)
        : [...prev, shiftType]
    );
  }, []);

  return {
    availableLocations,
    selectedLocation,
    selectedShifts,
    showManageBreaksButton,
    handleLocationToggle,
    handleShiftToggle,
  };
}
