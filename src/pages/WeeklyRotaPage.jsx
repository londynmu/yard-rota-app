import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../lib/NotificationContext';
import { supabase } from '../lib/supabaseClient';
import { format, addDays, subDays, isSameDay, getWeek } from 'date-fns';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import AttendanceStatusModal from '../components/Attendance/AttendanceStatusModal';
import { Sun, Moon, Cloud, X, AlertCircle, RefreshCw } from 'lucide-react';

// Utility to get week start on Saturday
const getWeekStart = (date) => {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : (day + 1); // number of days since last Saturday
  return subDays(date, diff);
};

const WeeklyRotaPage = () => {
  const { user } = useAuth();
  const { isAdmin } = useNotifications();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [dailyRotaData, setDailyRotaData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDayMobile, setExpandedDayMobile] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('Rugby');
  const [selectedShiftType, setSelectedShiftType] = useState(() => {
    const savedShift = localStorage.getItem('weekly_rota_shift_type');
    return savedShift || 'all';
  });
  const [locations, setLocations] = useState([]);
  const dayRefs = useRef({});
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [attendanceBySlotId, setAttendanceBySlotId] = useState({});
  const [attendanceModalSlot, setAttendanceModalSlot] = useState(null);
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  // After changing expanded day on mobile, align the selected day just below the sticky header
  // When closing (expandedDayMobile becomes null), scroll back to top
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    
    // If closing expanded day (null), scroll to top
    if (!expandedDayMobile) {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch {
            window.scrollTo(0, 0);
          }
        });
      }, 360);
      return () => clearTimeout(timer);
    }
    
    // If opening a day, scroll to it
    const el = dayRefs.current[expandedDayMobile];
    if (!el) return;
    
    const nav = document.getElementById('weekly-top-nav');
    const headerHeight = nav ? nav.getBoundingClientRect().height : 64;
    const scrollToTarget = () => {
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const extraGap = 8;
        const targetY = Math.max(0, window.scrollY + rect.top - headerHeight - extraGap);
        try {
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        } catch {
          window.scrollTo(0, targetY);
        }
      });
    };
    const timer = setTimeout(scrollToTarget, 360);
    return () => clearTimeout(timer);
  }, [expandedDayMobile]);

  // Fetch available locations from database - only once on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setLocations(data);
          
          // Set saved location or first location as default
          const savedLocation = localStorage.getItem('weekly_rota_location');
          if (savedLocation && data.some(loc => loc.name === savedLocation)) {
            setSelectedLocation(savedLocation);
          } else {
            setSelectedLocation(data[0].name);
          }
        } else {
          // Fallback to Rugby, NRC if no locations in database
          setLocations([
            { id: '1', name: 'Rugby' },
            { id: '2', name: 'NRC' },
            { id: '3', name: 'Nuneaton' }
          ]);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        // Fallback locations
        setLocations([
          { id: '1', name: 'Rugby' },
          { id: '2', name: 'NRC' },
          { id: '3', name: 'Nuneaton' }
        ]);
      }
    };

    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Save selected location when it changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('weekly_rota_location', selectedLocation);
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedLocation]);

  // Save selected shift type when it changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('weekly_rota_shift_type', selectedShiftType);
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedShiftType]);

  // Memoized sort function to avoid recreating it on every render
  const sortSlots = useCallback((slots) => {
    return slots.sort((a, b) => {
      // First sort by start_time
      const startTimeCompare = a.start_time.localeCompare(b.start_time);
      if (startTimeCompare !== 0) return startTimeCompare;
      
      // If start_times are equal, sort by end_time
      const endTimeCompare = a.end_time.localeCompare(b.end_time);
      if (endTimeCompare !== 0) return endTimeCompare;
      
      // If both times are equal, sort alphabetically by name
      const aName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : '';
      const bName = b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : '';
      return aName.localeCompare(bName);
    });
  }, []);

  useEffect(() => {
    const fetchFullRota = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const start = format(weekStart, 'yyyy-MM-dd');
        const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');

        // Set up the base query with date range and location
        let query = supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            user_id,
            task
          `)
          .gte('date', start)
          .lte('date', end)
          .eq('location', selectedLocation);

        // Add shift type filter if not 'all'
        if (selectedShiftType !== 'all') {
          query = query.eq('shift_type', selectedShiftType);
        }

        const { data: rotaData, error: rotaError } = await query;

        if (rotaError) throw rotaError;

        // 2) Fetch profiles for all unique user_ids in the rota
        const userIds = [...new Set(rotaData.map(r => r.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          if (profilesError) throw profilesError;

          profilesMap = profilesData.reduce((acc, prof) => {
            acc[prof.id] = prof;
            return acc;
          }, {});
        }

        // 3) Attach profile data to each rota entry
        const rotaWithProfiles = rotaData.map(slot => ({
          ...slot,
          profiles: profilesMap[slot.user_id] || null,
        }));
        
        // DEDUPLICATE: Remove duplicate entries (same user_id, date, start_time, end_time)
        const uniqueSlots = [];
        const seenKeys = new Set();
        
        rotaWithProfiles.forEach(slot => {
          // Create unique key from user_id, date, start_time, end_time
          const key = `${slot.user_id}-${slot.date}-${slot.start_time}-${slot.end_time}`;
          
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueSlots.push(slot);
          }
        });

        // 4) Group all fetched slots by date
        const grouped = {};
        uniqueSlots.forEach((slot) => {
          if (!grouped[slot.date]) grouped[slot.date] = [];
          grouped[slot.date].push(slot);
        });
        
        // Sort slots within each day - using callback to avoid recreation
        for (const date in grouped) {
          sortSlots(grouped[date]);
        }
        
        setDailyRotaData(grouped);

        if (uniqueSlots.length > 0) {
          const slotIds = uniqueSlots.map(s => s.id);
          const { data: attendanceData } = await supabase
            .from('attendance')
            .select('scheduled_rota_id, status')
            .in('scheduled_rota_id', slotIds);
          const bySlot = {};
          (attendanceData || []).forEach((r) => {
            bySlot[r.scheduled_rota_id] = { status: r.status };
          });
          setAttendanceBySlotId(bySlot);
        } else {
          setAttendanceBySlotId({});
        }
      } catch (e) {
        console.error('Error fetching full rota:', e);
        setError(`Failed to load rota: ${e.message || 'Unknown error. Check permissions or connection.'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFullRota();
  }, [weekStart, user, selectedLocation, selectedShiftType, sortSlots, isAdmin]);

  // Format time from HH:MM:SS to HH:MM - memoized
  const fmtTime = useCallback((t) => (t ? t.slice(0, 5) : ''), []);

  // Memoized handlers for modals
  const handlePreviousWeek = useCallback(() => {
    setWeekStart(prev => addDays(prev, -7));
    setShowWeekModal(false);
  }, []);

  const handleCurrentWeek = useCallback(() => {
    setWeekStart(getWeekStart(new Date()));
    setShowWeekModal(false);
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart(prev => addDays(prev, 7));
    setShowWeekModal(false);
  }, []);

  const handleLocationChange = useCallback((locationName) => {
    setSelectedLocation(locationName);
    setShowLocationModal(false);
  }, []);

  const handleShiftTypeChange = useCallback((shiftType) => {
    setSelectedShiftType(shiftType);
    setShowShiftModal(false);
  }, []);

  const handleAttendanceSlotClick = useCallback((slot) => {
    setAttendanceModalSlot(slot);
  }, []);

  const handleAttendanceSave = useCallback(async (status) => {
    if (!attendanceModalSlot || !user) return;
    setAttendanceSaving(true);
    try {
      if (status === null) {
        const { error: delError } = await supabase
          .from('attendance')
          .delete()
          .eq('scheduled_rota_id', attendanceModalSlot.id);
        if (delError) throw delError;
        setAttendanceBySlotId((prev) => {
          const next = { ...prev };
          delete next[attendanceModalSlot.id];
          return next;
        });
      } else {
        const { error: upsertError } = await supabase
          .from('attendance')
          .upsert(
            {
              scheduled_rota_id: attendanceModalSlot.id,
              status,
              recorded_by: user.id,
            },
            { onConflict: 'scheduled_rota_id' }
          );
        if (upsertError) throw upsertError;
        setAttendanceBySlotId((prev) => ({
          ...prev,
          [attendanceModalSlot.id]: { status },
        }));
      }
      setAttendanceModalSlot(null);
    } catch (e) {
      console.error('Error saving attendance:', e);
    } finally {
      setAttendanceSaving(false);
    }
  }, [attendanceModalSlot, user]);

  // Component to render the details for an expanded day - Memoized for performance
  const DayDetails = React.memo(({ dateStr, isAdmin, attendanceBySlotId, onSlotClick }) => {
    const daySlots = useMemo(() => 
      (dailyRotaData[dateStr] || []).filter(slot => slot.profiles),
      [dateStr]
    );
    
    // Memoize sorted slots to avoid re-sorting on every render
    const sortedSlots = useMemo(() => {
      return [...daySlots].sort((a, b) => {
        // First sort by start_time
        const startTimeCompare = a.start_time.localeCompare(b.start_time);
        if (startTimeCompare !== 0) return startTimeCompare;
        
        // If start_times are equal, sort by end_time
        const endTimeCompare = a.end_time.localeCompare(b.end_time);
        if (endTimeCompare !== 0) return endTimeCompare;
        
        // If both times are equal, sort alphabetically by name
        const aName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : '';
        const bName = b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : '';
        return aName.localeCompare(bName);
      });
    }, [daySlots]);
    
    const slotsByShiftType = useMemo(() => ({
      day: sortedSlots.filter(s => s.shift_type === 'day'),
      afternoon: sortedSlots.filter(s => s.shift_type === 'afternoon'),
      night: sortedSlots.filter(s => s.shift_type === 'night')
    }), [sortedSlots]);

    if (daySlots.length === 0) {
      return (
        <div className="p-3 text-center bg-slate-50/50 rounded-xl border border-slate-200/60">
          <p className="text-slate-600 text-sm">No shifts scheduled</p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {Object.entries(slotsByShiftType).map(([shiftType, slots]) => {
          if (slots.length === 0) return null;
          
          // Different styling based on shift type
          const shiftConfig = {
            day: {
              title: "Day Shift",
              bgColor: "bg-amber-50",
              textColor: "text-amber-900",
              badgeBg: "bg-white",
              icon: <Sun className="h-3.5 w-3.5 text-amber-600" />
            },
            afternoon: {
              title: "Afternoon Shift",
              bgColor: "bg-orange-50",
              textColor: "text-orange-900",
              badgeBg: "bg-white",
              icon: <Cloud className="h-3.5 w-3.5 text-orange-600" />
            },
            night: {
              title: "Night Shift",
              bgColor: "bg-blue-50",
              textColor: "text-blue-900",
              badgeBg: "bg-white",
              icon: <Moon className="h-3.5 w-3.5 text-blue-600" />
            }
          };

          const config = shiftConfig[shiftType];
          
          // Group slots by start time - memoized
          const { slotsByStartTime, sortedStartTimes } = useMemo(() => {
            const grouped = {};
            slots.forEach(slot => {
              const startTime = fmtTime(slot.start_time);
              if (!grouped[startTime]) {
                grouped[startTime] = [];
              }
              grouped[startTime].push(slot);
            });
            
            return {
              slotsByStartTime: grouped,
              sortedStartTimes: Object.keys(grouped).sort()
            };
          }, [slots]);
          
          return (
            <div key={shiftType} className="mt-2.5 first:mt-0">
              <div className={`${config.bgColor} ${config.textColor} px-2.5 py-1.5 flex items-center justify-between rounded-xl border border-slate-200/60`}>
                <div className="flex items-center gap-1.5">
                  {config.icon}
                  <h4 className="text-xs font-semibold">{config.title}</h4>
                </div>
                <span className={`${config.badgeBg} text-slate-700 text-xs px-2 py-0.5 rounded-full font-medium border border-slate-200/60`}>
                  {slots.filter(s => !attendanceBySlotId?.[s.id]).length}
                </span>
              </div>
              
              <div className="bg-white/90 rounded-xl border border-slate-200/60 mt-1.5 overflow-hidden">
                {sortedStartTimes.map((startTime, timeIndex) => {
                  const timeSlots = slotsByStartTime[startTime];
                  // Get end time from first slot (all slots with same start time should have same end time)
                  const endTime = fmtTime(timeSlots[0].end_time);
                  
                  return (
                    <div key={startTime} className={timeIndex > 0 ? 'border-t border-slate-200/60' : ''}>
                      {/* Time Header */}
                      <div className={`${config.bgColor} px-2.5 py-1.5 text-center border-b border-slate-200/60`}>
                        <span className="text-sm font-semibold text-slate-700">
                          {startTime} - {endTime}
                        </span>
                      </div>
                      
                      {/* List of employees for this start time */}
                      <ul className="divide-y divide-slate-100">
                        {timeSlots.map((slot) => {
                          const isCurrentUser = slot.user_id === user?.id;
                          const attendanceStatus = attendanceBySlotId?.[slot.id]?.status;
                          return (
                            <li
                              key={slot.id}
                              role={isAdmin ? 'button' : undefined}
                              onClick={isAdmin ? (e) => { e.stopPropagation(); onSlotClick?.(slot); } : undefined}
                              className={`p-2 transition-colors ${isAdmin ? 'cursor-pointer hover:bg-slate-50' : ''} ${isCurrentUser ? 'bg-amber-50/60 border-l-2 border-l-amber-500' : !isAdmin ? 'hover:bg-slate-50' : ''}`}
                            >
                              <div className="flex flex-col items-center">
                                <div className="text-center">
                                  <span className={`text-sm font-medium ${isCurrentUser ? 'text-amber-900' : 'text-charcoal'}`}>
                                    {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                                  </span>
                                  {attendanceStatus && (
                                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-rose-50/80 text-rose-700 border border-rose-200/60">
                                      {attendanceStatus === 'no_show' ? 'No show' : attendanceStatus === 'sick' ? 'Sick' : 'Late'}
                                    </span>
                                  )}
                                  {isCurrentUser && (
                                    <span className="ml-1.5 text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full uppercase font-semibold border border-amber-200/60">
                                      You
                                    </span>
                                  )}
                                </div>
                                
                                {/* Task Indicator */}
                                {slot.task && (
                                  <span className="inline-flex items-center text-xs text-rose-700 bg-rose-50/80 border border-rose-200/60 px-2 py-0.5 rounded-full mt-1">
                                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full mr-1"></span>
                                    {slot.task}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  });

  DayDetails.displayName = 'DayDetails';
  DayDetails.propTypes = {
    dateStr: PropTypes.string.isRequired,
    isAdmin: PropTypes.bool,
    attendanceBySlotId: PropTypes.object,
    onSlotClick: PropTypes.func,
  };

  // Memoized Day Card Component
  const DayCard = React.memo(({ 
    dateObj, 
    dateStr, 
    isWeekend, 
    isToday, 
    dayData, 
    userHasShift, 
    isExpanded,
    onHeaderClick,
    setRef,
    isAdmin,
    attendanceBySlotId,
    onAttendanceSlotClick
  }) => {
    return (
      <div
        key={dateStr}
        className={`
          card-modern
          ${isToday ? 'ring-2 ring-blue-500 ring-offset-2 shadow-lg' : ''} 
          ${isWeekend ? 'bg-slate-50/50' : ''}
          ${userHasShift ? 'border-l-2 border-l-blue-500' : ''}
          relative
          scroll-mt-28 md:scroll-mt-32
          transition-all hover:shadow-xl
        `}
        ref={setRef}
      >
        {/* Day Header - Sticky on mobile */}
        <div 
          className={`
            relative
            p-2.5 md:p-2
            border-b border-slate-200/60
            bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50
            cursor-pointer
            flex flex-col gap-1.5
            sticky top-0 z-10
            ${userHasShift ? 'bg-gradient-to-r from-slate-50 via-blue-50/50 to-slate-50' : ''}
            ${isToday ? 'bg-gradient-to-r from-blue-50/80 via-blue-50 to-blue-50/80' : ''}
          `}
          onClick={onHeaderClick}
        >
          {/* Top row: Date as WEDNESDAY 2ND, THURSDAY 3RD */}
          <div className="relative flex items-center justify-center w-full min-h-[2rem]">
            <h3 className="text-sm md:text-base font-semibold text-charcoal uppercase tracking-wide leading-tight text-center">
              {format(dateObj, 'EEEE').toUpperCase()} {format(dateObj, 'do').toUpperCase()}
            </h3>
            
            {/* Expand/Collapse button - only on mobile, positioned so title stays centered */}
            <div className="md:hidden absolute right-0 top-1/2 -translate-y-1/2 flex-shrink-0">
              <div
                className={`
                  w-7 h-7 
                  flex items-center justify-center 
                  rounded-full 
                  bg-white
                  border border-slate-200/60
                  transition-colors 
                  hover:bg-slate-50
                `}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-4 w-4 text-slate-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Bottom row: Shift badges in horizontal layout */}
          {dayData.length > 0 ? (
            <div className="flex flex-row flex-wrap items-center justify-center gap-1 w-full">
              {(() => {
                const presentSlots = dayData.filter(slot => slot.profiles && !attendanceBySlotId?.[slot.id]);
                const shiftCounts = {
                  day: presentSlots.filter(s => s.shift_type === 'day').length,
                  afternoon: presentSlots.filter(s => s.shift_type === 'afternoon').length,
                  night: presentSlots.filter(s => s.shift_type === 'night').length
                };
                return (
                  <>
                    {shiftCounts.day > 0 && (
                      <span className="inline-flex items-center text-xs bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200/60 font-medium">
                        <Sun className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                        {shiftCounts.day}
                      </span>
                    )}
                    {shiftCounts.afternoon > 0 && (
                      <span className="inline-flex items-center text-xs bg-orange-50 text-orange-800 px-1.5 py-0.5 rounded-full border border-orange-200/60 font-medium">
                        <Cloud className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                        {shiftCounts.afternoon}
                      </span>
                    )}
                    {shiftCounts.night > 0 && (
                      <span className="inline-flex items-center text-xs bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded-full border border-blue-200/60 font-medium">
                        <Moon className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                        {shiftCounts.night}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
        
        {/* Mobile: Conditionally visible details area with transition */}
        {isExpanded && (
          <div className="overflow-auto md:hidden transition-all duration-200">
            <div className="p-2.5">
              <DayDetails dateStr={dateStr} isAdmin={isAdmin} attendanceBySlotId={attendanceBySlotId} onSlotClick={onAttendanceSlotClick} />
            </div>
          </div>
        )}

        {/* Desktop: Always visible details area */}
        <div className="hidden md:block p-2.5 md:p-2">
          <DayDetails dateStr={dateStr} isAdmin={isAdmin} attendanceBySlotId={attendanceBySlotId} onSlotClick={onAttendanceSlotClick} />
        </div>
      </div>
    );
  });

  DayCard.displayName = 'DayCard';
  DayCard.propTypes = {
    dateObj: PropTypes.instanceOf(Date).isRequired,
    dateStr: PropTypes.string.isRequired,
    isWeekend: PropTypes.bool.isRequired,
    isToday: PropTypes.bool.isRequired,
    dayData: PropTypes.array.isRequired,
    userHasShift: PropTypes.bool.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    onHeaderClick: PropTypes.func.isRequired,
    setRef: PropTypes.func.isRequired,
    isAdmin: PropTypes.bool,
    attendanceBySlotId: PropTypes.object,
    onAttendanceSlotClick: PropTypes.func,
  };

  // Skeleton loading component
  const SkeletonDay = () => (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden border border-slate-200/60 animate-pulse">
      {/* Header skeleton - date line + horizontal badges */}
      <div className="p-2.5 md:p-2 border-b border-slate-200/60 bg-slate-50">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="md:hidden w-7 h-7 rounded-full bg-slate-200" />
          </div>
          <div className="flex flex-row gap-1">
            <div className="h-5 w-10 bg-slate-200 rounded-full" />
            <div className="h-5 w-10 bg-slate-200 rounded-full" />
          </div>
        </div>
      </div>
      
      {/* Content skeleton - visible on desktop, hidden on mobile */}
      <div className="hidden md:block p-2.5 md:p-2 space-y-2.5">
        {/* Shift type badge skeleton */}
        <div className="h-7 bg-slate-100 rounded-xl" />
        
        {/* Time group skeleton */}
        <div className="space-y-1.5">
          <div className="h-8 bg-slate-50 rounded" />
          <div className="space-y-1">
            <div className="h-10 bg-slate-50/50 rounded" />
            <div className="h-10 bg-slate-50/50 rounded" />
            <div className="h-10 bg-slate-50/50 rounded" />
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <>
        {/* Navigation skeleton */}
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60 pt-safe">
          <div className="max-w-4xl mx-auto px-4 py-3 md:py-3.5">
            <div className="filter-bar-segmented grid-cols-3">
              <div className="h-9 bg-slate-200 rounded-xl animate-pulse min-w-0" />
              <div className="h-9 bg-slate-200 rounded-xl animate-pulse min-w-0" />
              <div className="h-9 bg-slate-200 rounded-xl animate-pulse min-w-0" />
            </div>
          </div>
        </div>

        <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6">
          <div className="page-content-inner">
          {/* Skeleton grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3 md:gap-2 mt-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonDay key={index} />
            ))}
          </div>
        </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-4">
        <div className="glass-card p-6 max-w-md w-full shadow-strong">
          <h3 className="text-xl font-bold mb-3 flex items-center text-charcoal">
            <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
            Error Loading Rota
          </h3>
          <p className="mb-5 text-slate-600 text-sm">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="btn-primary flex-1 flex items-center justify-center"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Week Navigation */}
      <div id="weekly-top-nav" className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 pt-safe">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-3.5">
          <div className="filter-bar-segmented grid-cols-3">
            {/* Week Button */}
            <button
              type="button"
              onClick={() => setShowWeekModal(true)}
              className="flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-slate-300/70"
            >
              Week {getWeek(weekStart)}
            </button>

            {/* Location Button */}
            <button
              type="button"
              onClick={() => setShowLocationModal(true)}
              className="flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-slate-300/70 min-w-0 truncate"
            >
              <span className="min-w-0 truncate">{selectedLocation || 'Hub'}</span>
            </button>

            {/* Shift Button */}
            <button
              type="button"
              onClick={() => setShowShiftModal(true)}
              className="flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm hover:border-slate-300/70"
            >
              {selectedShiftType === 'all' ? 'All'
                : selectedShiftType === 'day' ? 'Day'
                : selectedShiftType === 'afternoon' ? 'Afternoon'
                : 'Night'}
            </button>
          </div>
        </div>
      </div>

      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6">
        <div className="page-content-inner">
        {/* Week Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3 md:gap-2 mt-2">
          {/* Generate 7 days starting from weekStart */}
          {Array.from({ length: 7 }).map((_, index) => {
            const dateObj = addDays(weekStart, index);
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            const isWeekend = [0, 6].includes(dateObj.getDay()); // Sunday (0) or Saturday (6)
            const isToday = isSameDay(dateObj, new Date());
            
            // Check if the current user has shifts on this day
            const dayData = dailyRotaData[dateStr] || [];
            const userHasShift = dayData.some(slot => slot.user_id === user?.id);
            
            // Determine if this day should be expanded on mobile
            const isExpanded = expandedDayMobile === dateStr;
            
            const handleHeaderClick = () => {
              // Toggle expanded state on mobile; scrolling handled in useEffect after state update
              if (expandedDayMobile === dateStr) {
                setExpandedDayMobile(null);
              } else {
                setExpandedDayMobile(dateStr);
              }
            };
            
            return (
              <DayCard
                key={dateStr}
                dateObj={dateObj}
                dateStr={dateStr}
                isWeekend={isWeekend}
                isToday={isToday}
                dayData={dayData}
                userHasShift={userHasShift}
                isExpanded={isExpanded}
                onHeaderClick={handleHeaderClick}
                setRef={(el) => { dayRefs.current[dateStr] = el; }}
                isAdmin={isAdmin}
                attendanceBySlotId={attendanceBySlotId}
                onAttendanceSlotClick={handleAttendanceSlotClick}
              />
            );
          })}
        </div>
        </div>
      </div>

      {/* Week Selection Modal */}
      {showWeekModal && createPortal(
        <div className="fixed inset-0 bg-rota-modal-overlay flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-sm w-full shadow-strong rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-charcoal">Select Week</h3>
              <button
                onClick={() => setShowWeekModal(false)}
                className="text-rota-text-muted-light hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={handlePreviousWeek}
                className="w-full px-4 py-2.5 rounded-xl text-slate-700 hover:bg-slate-50 font-medium border border-slate-200/60 transition-colors"
              >
                Previous Week
              </button>
              <button
                onClick={handleCurrentWeek}
                className="w-full px-4 py-2.5 rounded-xl text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 font-medium border border-blue-600 transition-colors"
              >
                Current Week
              </button>
              <button
                onClick={handleNextWeek}
                className="w-full px-4 py-2.5 rounded-xl text-slate-700 hover:bg-slate-50 font-medium border border-slate-200/60 transition-colors"
              >
                Next Week
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Location Selection Modal */}
      {showLocationModal && createPortal(
        <div className="fixed inset-0 bg-rota-modal-overlay flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-sm w-full max-h-[80vh] flex flex-col shadow-strong rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-xl font-bold text-charcoal">Select Location</h3>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-rota-text-muted-light hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => handleLocationChange(loc.name)}
                  className={`w-full px-4 py-2.5 rounded-xl font-medium border transition-colors ${
                    selectedLocation === loc.name
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800'
                      : 'text-slate-700 hover:bg-slate-50 border-slate-200/60'
                  }`}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Shift Type Selection Modal */}
      {showShiftModal && createPortal(
        <div className="fixed inset-0 bg-rota-modal-overlay flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-sm w-full shadow-strong rounded-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-charcoal">Select Shift Type</h3>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-rota-text-muted-light hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleShiftTypeChange('all')}
                className={`w-full px-4 py-2.5 rounded-xl font-medium border transition-colors ${
                  selectedShiftType === 'all'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800'
                    : 'text-slate-700 hover:bg-slate-50 border-slate-200/60'
                }`}
              >
                All Shifts
              </button>
              <button
                onClick={() => handleShiftTypeChange('day')}
                className={`w-full px-4 py-2.5 rounded-xl font-medium border transition-colors ${
                  selectedShiftType === 'day'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800'
                    : 'text-slate-700 hover:bg-slate-50 border-slate-200/60'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => handleShiftTypeChange('afternoon')}
                className={`w-full px-4 py-2.5 rounded-xl font-medium border transition-colors ${
                  selectedShiftType === 'afternoon'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800'
                    : 'text-slate-700 hover:bg-slate-50 border-slate-200/60'
                }`}
              >
                Afternoon
              </button>
              <button
                onClick={() => handleShiftTypeChange('night')}
                className={`w-full px-4 py-2.5 rounded-xl font-medium border transition-colors ${
                  selectedShiftType === 'night'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800'
                    : 'text-slate-700 hover:bg-slate-50 border-slate-200/60'
                }`}
              >
                Night
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {attendanceModalSlot && (
        <AttendanceStatusModal
          open={!!attendanceModalSlot}
          onClose={() => setAttendanceModalSlot(null)}
          slot={attendanceModalSlot}
          currentStatus={attendanceBySlotId[attendanceModalSlot.id]?.status ?? null}
          onSave={handleAttendanceSave}
          saving={attendanceSaving}
        />
      )}

    </>
  );
};

export default WeeklyRotaPage; 