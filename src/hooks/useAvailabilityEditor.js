import { useState, useEffect, useRef, useCallback } from 'react';
import { format, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useAvailabilityData } from './useAvailabilityData';

/**
 * Month navigation, day selection and availability saving for the main calendar.
 */
export function useAvailabilityEditor() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDates, setSelectedDates] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [popup, setPopup] = useState({ show: false, type: 'info', message: '' });
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);

  const { dayData, loading, refetchAvailability } = useAvailabilityData(
    currentDate,
    user,
    selectedDate
  );

  const popupTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);

  const showPopup = useCallback((type, message, duration = 3000) => {
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }

    setPopup({ show: true, type, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup({ show: false, type: '', message: '' });
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const handlePreviousMonth = useCallback(() => {
    setCurrentDate((prevDate) => subMonths(prevDate, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentDate((prevDate) => addMonths(prevDate, 1));
  }, []);

  const handleDayClick = useCallback((date) => {
    const today = startOfDay(new Date());

    if (isBefore(date, today)) {
      setErrorMessage('You cannot set availability for dates in the past.');
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    setErrorMessage('');
    setSelectedDate(date);
    setSelectedDates([format(date, 'yyyy-MM-dd')]);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setSelectedDate(null);
    setSelectedDates([]);
  }, []);

  const handleSaveAvailability = useCallback(async (data) => {
    if (!user) {
      alert('You must be logged in to save availability');
      return false;
    }

    const requestedEntries = Array.isArray(data.entries) && data.entries.length > 0
      ? data.entries
        .filter((entry) => entry?.date && entry?.status)
        .reduce((acc, entry) => {
          acc[entry.date] = entry.status;
          return acc;
        }, {})
      : ((Array.isArray(data.dates) && data.dates.length > 0)
        ? [...new Set(data.dates)].reduce((acc, targetDate) => {
          acc[targetDate] = data.status;
          return acc;
        }, {})
        : (data.date && data.status ? { [data.date]: data.status } : {}));
    const uniqueEntries = Object.entries(requestedEntries).map(([targetDate, targetStatus]) => ({
      date: targetDate,
      status: targetStatus,
    }));
    const isSingleDate = uniqueEntries.length === 1;
    const shouldApplyComment = Boolean(data.applyComment && isSingleDate);
    const normalizedComment = data.comment ?? '';

    if (uniqueEntries.length === 0) {
      showPopup('error', 'Select at least one day before saving.');
      return false;
    }

    let successCount = 0;
    setIsSavingAvailability(true);

    try {
      for (const { date: targetDate, status: targetStatus } of uniqueEntries) {
        const existingData = dayData[targetDate];

        if (existingData) {
          const updatePayload = {
            status: targetStatus,
          };

          if (shouldApplyComment) {
            updatePayload.comment = normalizedComment;
          }

          const { error } = await supabase
            .from('availability')
            .update(updatePayload)
            .eq('id', existingData.id);

          if (error) throw error;
        } else {
          const insertPayload = {
            date: targetDate,
            status: targetStatus,
            user_id: user.id,
          };

          if (shouldApplyComment) {
            insertPayload.comment = normalizedComment;
          }

          const { error } = await supabase
            .from('availability')
            .insert([insertPayload]);

          if (error) throw error;
        }

        successCount += 1;
      }

      await refetchAvailability();
      showPopup(
        'success',
        uniqueEntries.length > 1
          ? `Saved availability for ${successCount} days.`
          : 'Availability saved successfully.'
      );
      return true;
    } catch (error) {
      console.error('Error saving availability:', error);
      showPopup(
        'error',
        successCount > 0
          ? `Saved ${successCount} day(s), then an error occurred. Please try again.`
          : 'Failed to save availability. Please try again.'
      );
      return false;
    } finally {
      setIsSavingAvailability(false);
    }
  }, [user, dayData, refetchAvailability, showPopup]);

  return {
    currentDate,
    selectedDate,
    selectedDates,
    errorMessage,
    popup,
    isSavingAvailability,
    dayData,
    loading,
    handlePreviousMonth,
    handleNextMonth,
    handleDayClick,
    handleCloseDialog,
    handleSaveAvailability,
  };
}
