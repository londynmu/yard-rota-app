import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Keep selected location in sync with currently active locations
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
      const defaultLocation = availableLocations[0];
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
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded-lg shadow-lg text-center text-base font-medium border
                     ${popup.type === 'error' ? 'bg-red-50 text-red-700 border-red-500' : 'bg-green-50 text-green-700 border-green-500'}`}>
           {popup.message}
        </div>
      )}
      
      {/* Main scrollable container */}
      <div className="h-full overflow-y-auto bg-slate-50 px-4 py-6 md:px-6 pb-20 md:pb-6">
        <div className="max-w-4xl mx-auto space-y-6 min-h-screen">
          
          {/* Availability Calendar Section - No white container */}
          <div>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg shadow-sm">
                {errorMessage}
              </div>
            )}
            
            {/* Legend - Above Calendar */}
            <div className="mb-4">
              <div className="flex justify-center items-center gap-6 text-sm font-medium text-charcoal">
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                  <span>Available</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                  <span>Unavailable</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                  <span>Holiday</span>
                </div>
              </div>
            </div>
            
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-charcoal"
                aria-label="Previous month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h3 className="text-2xl font-bold text-charcoal">
                {format(currentDate, 'MMMM yyyy')}
              </h3>
              
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-charcoal"
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
          
          {/* Pastel Divider Line */}
          <div className="border-t-2 border-blue-100"></div>
          
          {/* Today's Breaks Section - Title with Badges */}
          <div className="mb-3">
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-charcoal">Today's Breaks</h2>
              {userBreakLabel && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                  {userBreakLabel}
                </span>
              )}
            </div>
            
            {/* Badges Row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Location Badge */}
              <button
                onClick={handleLocationToggle}
                disabled={availableLocations.length === 0}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
              >
                {selectedLocation || 'No locations'}
              </button>
              
              {/* Shift Badges - Clickable filters */}
              <button
                onClick={() => handleShiftToggle('day')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('day')
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Day {shiftCounts.day > 0 && `(${shiftCounts.day})`}
              </button>
              
              <button
                onClick={() => handleShiftToggle('afternoon')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('afternoon')
                    ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Afternoon {shiftCounts.afternoon > 0 && `(${shiftCounts.afternoon})`}
              </button>
              
              <button
                onClick={() => handleShiftToggle('night')}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('night')
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Night {shiftCounts.night > 0 && `(${shiftCounts.night})`}
              </button>
            </div>
          </div>
          
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