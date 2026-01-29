import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Custom hook to fetch and manage user availability data for a given month
 * @param {Date} currentDate - The date to determine which month to fetch
 * @param {Object} user - The authenticated user object
 * @returns {Object} { dayData, loading, error, refetchAvailability }
 */
export function useAvailabilityData(currentDate, user) {
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAvailability = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    // Add some buffer to get days from previous/next month that might appear in the grid
    const startDate = new Date(startOfMonth);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(endOfMonth);
    endDate.setDate(endDate.getDate() + 7);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);
      
      if (fetchError) throw fetchError;
      
      // Transform data into a map for easy lookup by date
      const dataMap = {};
      data.forEach(item => {
        dataMap[item.date] = item;
      });
      
      setDayData(dataMap);
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, user]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  return { 
    dayData, 
    loading, 
    error, 
    refetchAvailability: fetchAvailability 
  };
}
