import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import CalendarGrid from '../components/Calendar/CalendarGrid';
import AvailabilityDialog from '../components/Calendar/AvailabilityDialog';
import ShiftDashboard from '../components/User/ShiftDashboard';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useAvailabilityData } from '../hooks/useAvailabilityData';

const CALENDAR_BREAKS_LOCATION_KEY = 'calendar_breaks_selected_location';
const CALENDAR_BREAKS_SHIFT_FILTERS_KEY = 'calendar_breaks_selected_shifts';
const VALID_SHIFT_TYPES = ['day', 'afternoon', 'night'];

const getInitialSelectedShifts = () => {
  try {
    const savedValue = localStorage.getItem(CALENDAR_BREAKS_SHIFT_FILTERS_KEY);
    if (!savedValue) return VALID_SHIFT_TYPES;

    const parsed = JSON.parse(savedValue);
    if (!Array.isArray(parsed)) return VALID_SHIFT_TYPES;

    const normalized = parsed.filter((shift) => VALID_SHIFT_TYPES.includes(shift));
    return [...new Set(normalized)];
  } catch (error) {
    console.warn('Failed to parse saved shift filters:', error);
    return VALID_SHIFT_TYPES;
  }
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [popup, setPopup] = useState({ show: false, type: 'info', message: '' });
  const [selectedLocation, setSelectedLocation] = useState(
    () => localStorage.getItem(CALENDAR_BREAKS_LOCATION_KEY) || ''
  );
  const [availableLocations, setAvailableLocations] = useState([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [selectedShifts, setSelectedShifts] = useState(getInitialSelectedShifts);
  const [shiftCounts, setShiftCounts] = useState({ day: 0, afternoon: 0, night: 0 });
  const [userBreakLabel, setUserBreakLabel] = useState('');
  const [showManageBreaksButton, setShowManageBreaksButton] = useState(true);
  
  // Use custom hook for availability data fetching
  const { dayData, loading, refetchAvailability } = useAvailabilityData(currentDate, user);
  
  // Ref to track popup timeout for cleanup
  const popupTimeoutRef = useRef(null);
  
  // Function to show popup with proper cleanup
  const showPopup = useCallback((type, message, duration = 3000) => {
    // Clear any existing timeout
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    
    setPopup({ show: true, type, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup({ show: false, type: '', message: '' });
    }, duration);
  }, []);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
    };
  }, []);

  // Fetch active locations for the breaks filter
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLocationsLoaded(false);
        const { data, error } = await supabase
          .from('locations')
          .select('name')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;

        const sortedLocations = (data || [])
          .map((loc) => loc.name)
          .filter(Boolean);

        setAvailableLocations(sortedLocations);
      } catch (error) {
        console.error('Error fetching locations:', error);
        setAvailableLocations([]);
      } finally {
        setLocationsLoaded(true);
      }
    };

    fetchLocations();
  }, []);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'show_manage_breaks_button')
          .single();
        setShowManageBreaksButton(data?.value !== 'false');
      } catch (err) {
        console.warn('CalendarPage: could not fetch show_manage_breaks_button, defaulting to true', err);
        setShowManageBreaksButton(true);
      }
    };
    fetchSetting();
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

  // Persist selected location so filter state survives page reload/navigation
  useEffect(() => {
    if (selectedLocation) {
      localStorage.setItem(CALENDAR_BREAKS_LOCATION_KEY, selectedLocation);
      return;
    }

    localStorage.removeItem(CALENDAR_BREAKS_LOCATION_KEY);
  }, [selectedLocation]);

  // Persist selected shift filters so toggles survive page reload/navigation
  useEffect(() => {
    localStorage.setItem(
      CALENDAR_BREAKS_SHIFT_FILTERS_KEY,
      JSON.stringify(selectedShifts)
    );
  }, [selectedShifts]);
  
  const handlePreviousMonth = useCallback(() => {
    // Always allow navigation to previous months for viewing purposes
    setCurrentDate(prevDate => subMonths(prevDate, 1));
  }, []);
  
  const handleNextMonth = useCallback(() => {
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  }, []);
  
  // Ref to track error message timeout for cleanup
  const errorTimeoutRef = useRef(null);
  
  const handleDayClick = (date) => {
    // Prevent setting availability for past dates
    const today = startOfDay(new Date());
    
    if (isBefore(date, today)) {
      setErrorMessage("You cannot set availability for dates in the past.");
      
      // Clear any existing error timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      
      // Clear the error message after 3 seconds
      errorTimeoutRef.current = setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    // Clear any error message
    setErrorMessage('');
    setSelectedDate(date);
  };
  
  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);
  
  const handleCloseDialog = useCallback(() => {
    setSelectedDate(null);
  }, []);
  
  // Handler for location toggle
  const handleLocationToggle = useCallback(() => {
    if (availableLocations.length === 0) return;
    const currentIndex = availableLocations.indexOf(selectedLocation);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % availableLocations.length;
    setSelectedLocation(availableLocations[nextIndex]);
  }, [selectedLocation, availableLocations]);
  
  // Handler for shift filter toggle
  const handleShiftToggle = useCallback((shiftType) => {
    setSelectedShifts(prev => 
      prev.includes(shiftType) 
        ? prev.filter(s => s !== shiftType)
        : [...prev, shiftType]
    );
  }, []);
  
  const handleSaveAvailability = useCallback(async (data) => {
    if (!user) {
      alert('You must be logged in to save availability');
      return;
    }
    
    try {
      // Check if we're updating an existing record
      const existingData = dayData[data.date];
      
      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('availability')
          .update({
            status: data.status,
            comment: data.comment
          })
          .eq('id', existingData.id);
          
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('availability')
          .insert([{
            date: data.date,
            status: data.status,
            comment: data.comment,
            user_id: user.id
          }]);
          
        if (error) throw error;
      }
      
      // Refetch data using the hook's refetch function
      await refetchAvailability();
    } catch (error) {
      console.error('Error saving availability:', error);
      showPopup('error', 'Failed to save availability. Please try again.');
    }
  }, [user, dayData, refetchAvailability, showPopup]);
  
  return (
    <>
      {/* Centered Popup Message */}
      {popup.show && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded-xl shadow-lg text-center text-base font-medium border backdrop-blur-sm
                     ${popup.type === 'error' ? 'bg-rota-alert-error-bg text-rota-alert-error-text border-rota-alert-error-border' : 'bg-emerald-50/95 text-emerald-800 border-emerald-300/70'}`}>
           {popup.message}
        </div>
      )}
      
      {/* Main scrollable container */}
      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6">
        <div className="max-w-4xl mx-auto space-y-6 min-h-screen">
          
          {/* Availability Calendar Section - No white container */}
          <div>
            {errorMessage && (
              <div className="mb-4 p-3 bg-rota-alert-error-bg text-rota-alert-error-text border border-rota-alert-error-border rounded-xl shadow-sm">
                {errorMessage}
              </div>
            )}
            
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
                aria-label="Previous month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h3 className="text-2xl font-bold text-charcoal tracking-tight">
                {format(currentDate, 'MMMM yyyy')}
              </h3>
              
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
                aria-label="Next month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Calendar Grid */}
            <CalendarGrid
              currentDate={currentDate}
              dayData={dayData}
              onDayClick={handleDayClick}
              isLoading={loading}
            />
          </div>
          
          {showManageBreaksButton && (
          <div className="w-full pt-1 pb-3 md:pt-2 md:pb-3 md:flex md:justify-center">
            <Link
              to="/brakes"
              className="inline-flex items-center justify-center gap-2 w-full md:max-w-md px-4 py-3 text-sm font-medium rounded-xl bg-white/90 backdrop-blur-sm border-2 border-rota-btn-outline-border text-charcoal hover:border-charcoal/40 hover:bg-white hover:shadow-md transition-all duration-200 active:scale-[0.99]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-charcoal/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Manage my breaks
            </Link>
          </div>
          )}
          
          {/* Today's Breaks List - No container, full width like calendar */}
          <ShiftDashboard 
            initialView="breaks" 
            hideTabSwitcher={true} 
            hideLocationButton={true}
            selectedLocation={selectedLocation}
            renderShiftBadges={true}
            selectedShifts={selectedShifts}
            onShiftCountsChange={setShiftCounts}
            onUserBreakLabelChange={setUserBreakLabel}
            breakHeaderControls={(
              <div className="w-full max-w-full min-w-0 md:w-max md:max-w-full grid grid-cols-4 gap-1.5 sm:gap-2 py-2.5 px-2 sm:py-3 sm:px-3 rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/95 to-white/90 backdrop-blur-sm shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={handleLocationToggle}
                  disabled={availableLocations.length === 0}
                  className={`flex min-w-0 items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:px-2 sm:py-2.5 sm:text-sm ${
                    availableLocations.length === 0
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-slate-700 hover:text-charcoal bg-white/90 border border-slate-200/60 hover:border-slate-300/70 hover:shadow-sm'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${availableLocations.length === 0 ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm'}`} />
                  <span className="min-w-0 truncate text-left text-[10px] sm:text-xs">{selectedLocation || 'No locations'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShiftToggle('day')}
                  title={`Day${shiftCounts.day > 0 ? ` (${shiftCounts.day})` : ''}`}
                  aria-label={`Toggle day breaks${shiftCounts.day > 0 ? ` (${shiftCounts.day})` : ''}`}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
                    selectedShifts.includes('day')
                      ? 'text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-amber-300/60'
                      : 'text-slate-400 hover:text-slate-600 border border-transparent hover:bg-white/60'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${selectedShifts.includes('day') ? 'bg-amber-500 shadow-sm' : 'bg-slate-300'}`} />
                  <span>Day</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShiftToggle('afternoon')}
                  title={`Afternoon${shiftCounts.afternoon > 0 ? ` (${shiftCounts.afternoon})` : ''}`}
                  aria-label={`Toggle afternoon breaks${shiftCounts.afternoon > 0 ? ` (${shiftCounts.afternoon})` : ''}`}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
                    selectedShifts.includes('afternoon')
                      ? 'text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-orange-300/60'
                      : 'text-slate-400 hover:text-slate-600 border border-transparent hover:bg-white/60'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${selectedShifts.includes('afternoon') ? 'bg-orange-500 shadow-sm' : 'bg-slate-300'}`} />
                  <span>
                    <span className="sm:hidden">Aft</span>
                    <span className="hidden sm:inline">Afternoon</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShiftToggle('night')}
                  title={`Night${shiftCounts.night > 0 ? ` (${shiftCounts.night})` : ''}`}
                  aria-label={`Toggle night breaks${shiftCounts.night > 0 ? ` (${shiftCounts.night})` : ''}`}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
                    selectedShifts.includes('night')
                      ? 'text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-blue-300/60'
                      : 'text-slate-400 hover:text-slate-600 border border-transparent hover:bg-white/60'
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${selectedShifts.includes('night') ? 'bg-blue-500 shadow-sm' : 'bg-slate-300'}`} />
                  <span>Night</span>
                </button>
              </div>
            )}
          />
          
        </div>
      </div>
      
      {/* Availability Dialog */}
      {selectedDate && (
        <AvailabilityDialog
          date={selectedDate}
          initialData={dayData[format(selectedDate, 'yyyy-MM-dd')]}
          onClose={handleCloseDialog}
          onSave={handleSaveAvailability}
        />
      )}
    </>
  );
} 