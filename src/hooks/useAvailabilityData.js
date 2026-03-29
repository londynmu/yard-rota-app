import { useState, useEffect, useCallback } from 'react';
import {
  addDays,
  endOfMonth,
  format,
  max,
  min,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { supabase } from '../lib/supabaseClient';

/**
 * Fetch user availability for the calendar grid plus optional modal window.
 * @param {Date} currentDate - Month shown in the calendar grid
 * @param {Object} user - Authenticated user
 * @param {Date|null} [modalAnchorDate] - When set (modal open), extends the query to cover 14 days from this day for AvailabilityDialog prefill
 * @returns {{ dayData: Object, loading: boolean, error: Error|null, refetchAvailability: Function }}
 */
export function useAvailabilityData(currentDate, user, modalAnchorDate = null) {
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const userId = user?.id;

  const fetchAvailability = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = addDays(monthStart, -7);
    const gridEnd = addDays(monthEnd, 7);

    let rangeStart = gridStart;
    let rangeEnd = gridEnd;

    if (modalAnchorDate) {
      const anchorStart = startOfDay(modalAnchorDate);
      const anchorEnd = addDays(anchorStart, 13);
      rangeStart = min([gridStart, anchorStart]);
      rangeEnd = max([gridEnd, anchorEnd]);
    }

    const startYmd = format(rangeStart, 'yyyy-MM-dd');
    const endYmd = format(rangeEnd, 'yyyy-MM-dd');

    try {
      const { data, error: fetchError } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startYmd)
        .lte('date', endYmd);

      if (fetchError) throw fetchError;

      const dataMap = {};
      (data || []).forEach((item) => {
        dataMap[item.date] = item;
      });

      setDayData(dataMap);
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, userId, modalAnchorDate]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  return {
    dayData,
    loading,
    error,
    refetchAvailability: fetchAvailability,
  };
}
