import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { format, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import CalendarGrid from '../components/Calendar/CalendarGrid';
import AvailabilityDialog from '../components/Calendar/AvailabilityDialog';
import ShiftDashboard from '../components/User/ShiftDashboard';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../lib/NotificationContext';
import { getAdminMenuItems } from '../config/navIcons';
import NavIcon from '../components/NavIcon';
import { useAvailabilityData } from '../hooks/useAvailabilityData';
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

    const normalized = parsed.filter((shift) => VALID_SHIFT_TYPES.includes(shift));
    return [...new Set(normalized)];
  } catch (error) {
    console.warn('Failed to parse saved shift filters:', error);
    return VALID_SHIFT_TYPES;
  }
};

export default function CalendarPage({ desktopBelowCalendar = null }) {
  const { user } = useAuth();
  const { isAdmin } = useNotifications();
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
  const [, setUserBreakLabel] = useState('');
  const [showManageBreaksButton, setShowManageBreaksButton] = useState(true);
  const [todayShiftSummary, setTodayShiftSummary] = useState({ day: 0, afternoon: 0, night: 0, total: 0 });
  
  // Use custom hook for availability data fetching
  const { dayData, loading, refetchAvailability } = useAvailabilityData(currentDate, user);
  
  // Ref to track popup timeout for cleanup
  const popupTimeoutRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const calendarDesktopCardRef = useRef(null);
  const [desktopBreaksHeight, setDesktopBreaksHeight] = useState(null);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (typeof document !== 'undefined') {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, []);

  useEffect(() => {
    const cardEl = calendarDesktopCardRef.current;
    if (!cardEl || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => {
      setDesktopBreaksHeight(cardEl.offsetHeight || null);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(cardEl);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    const fetchTodayShiftSummary = async () => {
      try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const today = `${y}-${m}-${d}`;

        const { data, error } = await supabase
          .from('scheduled_rota')
          .select('user_id, shift_type')
          .eq('date', today)
          .eq('location', selectedLocation);

        if (error) throw error;
        const uniqByShift = {
          day: new Set(),
          afternoon: new Set(),
          night: new Set(),
        };
        const uniqAll = new Set();

        (data || []).forEach((row) => {
          if (!row?.user_id) return;
          uniqAll.add(row.user_id);
          if (row.shift_type === 'day') uniqByShift.day.add(row.user_id);
          if (row.shift_type === 'afternoon') uniqByShift.afternoon.add(row.user_id);
          if (row.shift_type === 'night') uniqByShift.night.add(row.user_id);
        });

        setTodayShiftSummary({
          day: uniqByShift.day.size,
          afternoon: uniqByShift.afternoon.size,
          night: uniqByShift.night.size,
          total: uniqAll.size,
        });
      } catch (err) {
        console.warn('CalendarPage: could not fetch today shift summary', err);
        setTodayShiftSummary({ day: 0, afternoon: 0, night: 0, total: 0 });
      }
    };

    if (!selectedLocation) return;
    fetchTodayShiftSummary();
  }, [selectedLocation]);
  
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

  // Fetch active locations for the breaks filter (deduped across mounts via calendarStaticCache)
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setLocationsLoaded(false);
        const sortedLocations = await fetchActiveLocationNamesCached(supabase);
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
        const show = await fetchShowManageBreaksCached(supabase);
        setShowManageBreaksButton(show);
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

  const adminQuickLinkIds = ['users', 'approvals', 'rota-planner', 'breaks', 'prechecks'];
  const adminQuickLinks = getAdminMenuItems(0).filter((item) => adminQuickLinkIds.includes(item.id));
  const desktopCards = React.Children.toArray(
    React.isValidElement(desktopBelowCalendar) ? desktopBelowCalendar.props?.children : desktopBelowCalendar
  );
  
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
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6"
      >
        <div className="page-content-inner-desktop-wide">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rota-alert-error-bg text-rota-alert-error-text border border-rota-alert-error-border rounded-xl shadow-sm">
              {errorMessage}
            </div>
          )}

          <div className="min-w-0 md:hidden">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-charcoal tracking-tight">
                  {format(currentDate, 'MMMM yyyy')}
                </h3>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePreviousMonth}
                    className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
                    aria-label="Previous month"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

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
              </div>

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
                <div className="filter-bar-segmented">
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

          <div className="hidden md:grid md:grid-cols-4 md:gap-6 md:items-start">
            <div className="min-w-0 md:col-span-2">
              <div ref={calendarDesktopCardRef} className="card-modern p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold text-charcoal tracking-tight">
                    {format(currentDate, 'MMMM yyyy')}
                  </h3>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePreviousMonth}
                      className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
                      aria-label="Previous month"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

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
                </div>

                <CalendarGrid
                  currentDate={currentDate}
                  dayData={dayData}
                  onDayClick={handleDayClick}
                  isLoading={loading}
                />
              </div>
            </div>

            <div className="min-w-0 md:col-span-1">
              <div
                className="card-modern p-3 md:p-4 h-full"
                style={desktopBreaksHeight ? { height: `${desktopBreaksHeight}px` } : undefined}
              >
                <div className="h-full min-h-0 flex flex-col">
                  {isAdmin && (
                    <div className="flex-shrink-0">
                      <div className="grid grid-cols-1 gap-2">
                        {adminQuickLinks.map((item) => (
                          <Link
                            key={item.id}
                            to="/admin"
                            onClick={() => localStorage.setItem('adminActiveSection', item.id)}
                            className="min-h-[74px] flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border border-slate-200/60 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 text-left group"
                          >
                            <div className="flex items-center gap-3 w-full">
                              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 shadow-sm transition-transform group-hover:scale-105">
                                <NavIcon Icon={item.Icon} colorClass={item.colorClass} size="small" animate={true} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm text-charcoal truncate">
                                  {item.label}
                                </h3>
                              </div>
                              <svg className="w-4 h-4 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 md:col-span-1">
              <div
                className="card-modern p-3 md:p-4 h-full"
                style={desktopBreaksHeight ? { height: `${desktopBreaksHeight}px` } : undefined}
              >
                <div className="h-full min-h-0 flex flex-col">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="min-h-[74px] flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
                      <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 shadow-sm">
                        <span className="text-sm font-bold text-charcoal tabular-nums">{todayShiftSummary.total}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-charcoal truncate">Total shunters</p>
                        <p className="text-xs text-slate-500 truncate">{selectedLocation || 'Location'} today</p>
                      </div>
                    </div>

                    <div className="min-h-[74px] flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-amber-50 via-amber-50/70 to-slate-50 border border-amber-200 rounded-xl shadow-sm">
                      <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/90 border border-amber-200/70 shadow-sm">
                        <span className="text-sm font-bold text-amber-800 tabular-nums">{todayShiftSummary.day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-amber-700">Shunters on day shift</p>
                      </div>
                    </div>

                    <div className="min-h-[74px] flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-orange-50 via-orange-50/70 to-slate-50 border border-orange-200 rounded-xl shadow-sm">
                      <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/90 border border-orange-200/70 shadow-sm">
                        <span className="text-sm font-bold text-orange-800 tabular-nums">{todayShiftSummary.afternoon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-orange-700">Shunters on afternoon shift</p>
                      </div>
                    </div>

                    <div className="min-h-[74px] flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-blue-50 via-blue-50/70 to-slate-50 border border-blue-200 rounded-xl shadow-sm">
                      <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/90 border border-blue-200/70 shadow-sm">
                        <span className="text-sm font-bold text-blue-800 tabular-nums">{todayShiftSummary.night}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-blue-700">Shunters on night shift</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden md:grid md:grid-cols-2 md:gap-6 mt-4">
            <div className="min-w-0">
              <div
                className="card-modern p-4 md:p-5 flex flex-col"
                style={desktopBreaksHeight ? { height: `${desktopBreaksHeight}px` } : undefined}
              >
                {showManageBreaksButton && (
                  <div className="w-full mb-4 flex-shrink-0">
                    <Link
                      to="/brakes"
                      className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 text-sm font-medium rounded-xl bg-white/90 backdrop-blur-sm border-2 border-rota-btn-outline-border text-charcoal hover:border-charcoal/40 hover:bg-white hover:shadow-md transition-all duration-200 active:scale-[0.99]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-charcoal/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Manage my breaks
                    </Link>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                      <div className="filter-bar-segmented filter-bar-segmented-desktop-full">
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
            </div>
            <div className="min-w-0">
              <div className="card-modern p-3 md:p-4 h-full">
                <div className="flex h-full min-h-0 gap-3">
                  {desktopCards.map((card, index) => (
                    <div key={index} className="min-w-0 h-full w-1/2 flex-shrink-0">
                      {card}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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

CalendarPage.propTypes = {
  desktopBelowCalendar: PropTypes.node,
};