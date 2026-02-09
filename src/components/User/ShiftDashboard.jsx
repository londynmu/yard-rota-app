import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
// Removed framer-motion import to reduce layout shifts and improve performance

// Helper to calculate end time for breaks
const calculateEndTime = (startTime, durationMinutes) => {
  try {
    // Assuming startTime is in HH:MM format
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0); // Set time on today's date
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    return format(endDate, 'HH:mm');
  } catch (e) {
    console.error("Error calculating end time:", e);
    return '??:??';
  }
};

// Helper to sort breaks so that evening times (18:00+) appear before early morning times
const getNightSortValue = (timeStr) => {
  if (!timeStr) return Number.MAX_SAFE_INTEGER;
  const normalized = timeStr.slice(0, 5); // HH:MM
  const [hours, minutes] = normalized.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.MAX_SAFE_INTEGER;

  let totalMinutes = hours * 60 + minutes;
  // Move times before 18:00 to the end of the ordering (add 24h)
  if (totalMinutes < 18 * 60) {
    totalMinutes += 24 * 60;
  }

  return totalMinutes;
};

export default function ShiftDashboard({ 
  initialView = 'shift', 
  hideTabSwitcher = false, 
  hideLocationButton = false,
  selectedLocation = null,
  renderShiftBadges = false,
  selectedShifts = ['day', 'afternoon', 'night'],
  onShiftCountsChange = null
}) {
  const { user } = useAuth();
  const [shift, setShift] = useState(null);
  const [breakInfo, setBreakInfo] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeView, setActiveView] = useState(initialView === 'shifts' ? 'team' : initialView === 'breaks' ? 'team' : initialView); // 'shift', 'breaks', or 'team'
  const [allShifts, setAllShifts] = useState([]);
  const [allBreaks, setAllBreaks] = useState([]);
  const [teamView, setTeamView] = useState(initialView === 'breaks' ? 'breaks' : 'shifts'); // 'shifts' or 'breaks' - for team schedule
  const [teamLocation, setTeamLocation] = useState(selectedLocation || 'Rugby'); // location tab (Rugby default)
  const [showLocationModal, setShowLocationModal] = useState(false);
  
  // Sync with external selectedLocation if provided
  useEffect(() => {
    if (selectedLocation) {
      setTeamLocation(selectedLocation);
    }
  }, [selectedLocation]);
  
  // Update shift counts when data changes
  useEffect(() => {
    if (onShiftCountsChange && allBreaks.length > 0) {
      const userLocationMap = new Map(allShifts.map(s => [s.user_id, s.location]));
      const breaksByType = {
        day: allBreaks.filter(b => b.shift_type === 'day'),
        afternoon: allBreaks.filter(b => b.shift_type === 'afternoon'),
        night: allBreaks.filter(b => b.shift_type === 'night')
      };
      const counts = {
        day: breaksByType.day.filter(b => userLocationMap.get(b.user_id) === teamLocation).length,
        afternoon: breaksByType.afternoon.filter(b => userLocationMap.get(b.user_id) === teamLocation).length,
        night: breaksByType.night.filter(b => userLocationMap.get(b.user_id) === teamLocation).length
      };
      onShiftCountsChange(counts);
    }
  }, [allBreaks, allShifts, teamLocation, onShiftCountsChange]);
  
  // Fetch user profile to get shift preference
  useEffect(() => {
    if (!user) return;

    const fetchUserProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, shift_preference')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setUserProfile(data);
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    fetchUserProfile();
  }, [user]);

  // Fetch today's shift
  useEffect(() => {
    const fetchTodaysShift = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch shift for today
        const { data, error } = await supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            start_time,
            end_time,
            location,
            shift_type
          `)
          .eq('user_id', user.id)
          .eq('date', today)
          .order('start_time', { ascending: true });
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Get scheduled breaks if there are any
          const { data: breaks, error: breaksError } = await supabase
            .from('scheduled_breaks')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('break_start_time', { ascending: true });
            
          if (breaksError) {
            console.warn('Error fetching breaks:', breaksError);
          }
          
          // Add breaks to shift data
          setShift({
            ...data[0],
            breaks: breaks || []
          });
        } else {
          setShift(null); // No shift today
        }
      } catch (err) {
        console.error('Error fetching today\'s shift:', err);
        setError('Could not load shift information');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTodaysShift();
    
    // Update current time every minute for progress bars and time calculations
    const timeIntervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);
    
    // Refresh data every 15 minutes
    const dataIntervalId = setInterval(fetchTodaysShift, 15 * 60 * 1000);
    
    return () => {
      clearInterval(timeIntervalId);
      clearInterval(dataIntervalId);
    };
  }, [user]);

  // Fetch ALL today's shifts and breaks for team view
  useEffect(() => {
    const fetchTeamSchedule = async () => {
      if (!user) return;

      try {
        // Dates: keep shifts on calendar 'today', but for breaks, anchor to previous day until 06:00
        const toLocalYmd = (d) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const now = new Date();
        const today = toLocalYmd(now);
        const yesterday = toLocalYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
        const beforeSix = now.getHours() < 6;
        const effectiveForBreaks = toLocalYmd(beforeSix ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : now);
        
        // Fetch shifts for today and yesterday (to correctly handle night shift window before 06:00)
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('scheduled_rota')
          .select('id, user_id, date, start_time, end_time, location, shift_type')
          .in('date', [today, yesterday])
          .order('start_time');
          
        if (shiftsError) throw shiftsError;

        // Fetch profiles for all unique user_ids
        if (shiftsData && shiftsData.length > 0) {
          // Apply date selection rules:
          // - Day/Afternoon: always today (00:00-23:59 of 'today')
          // - Night: before 06:00 show yesterday's night (18:00-06:00), after 06:00 show today's night
          const selectedShiftsRaw = shiftsData.filter(s => {
            if (s.shift_type === 'night') {
              return beforeSix ? s.date === yesterday : s.date === today;
            }
            return s.date === today; // day and afternoon
          });
          
          // Filter out null user_ids before fetching
          const userIds = [...new Set(selectedShiftsRaw.map(s => s.user_id).filter(id => id !== null))];
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          
          // Map profiles to shifts
          const profilesMap = {};
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });
          
          // Only include shifts where we found a profile
          // Sort to prefer night shifts before day/afternoon before 06:00, else day/afternoon first
          const preferenceWeight = (s) => {
            if (beforeSix) return s.shift_type === 'night' ? 0 : 1;
            return s.shift_type === 'night' ? 1 : 0;
          };
          const shiftsWithProfiles = selectedShiftsRaw
            .sort((a, b) => preferenceWeight(a) - preferenceWeight(b) || (a.start_time || '').localeCompare(b.start_time || ''))
            .filter(s => s.user_id && profilesMap[s.user_id])
            .map(s => ({
              ...s,
              profiles: profilesMap[s.user_id]
            }));
          
          // DEDUPLICATE: Remove duplicate entries - same user can have multiple shifts, show only once
          const uniqueShifts = [];
          const seenUserIds = new Set();
          
          shiftsWithProfiles.forEach(shift => {
            if (!seenUserIds.has(shift.user_id)) {
              seenUserIds.add(shift.user_id);
              uniqueShifts.push(shift);
            }
          });
          
          setAllShifts(uniqueShifts);
        } else {
          setAllShifts([]);
        }

        // Fetch ALL breaks for today (without profiles join)
        const { data: breaksData, error: breaksError } = await supabase
          .from('scheduled_breaks')
          .select('id, user_id, break_start_time, break_duration_minutes, break_type, shift_type, date')
          .eq('date', effectiveForBreaks)
          .order('break_start_time');
          
        if (breaksError) throw breaksError;

        // Fetch profiles for breaks
        if (breaksData && breaksData.length > 0) {
          // Filter out null user_ids before fetching
          const userIds = [...new Set(breaksData.map(b => b.user_id).filter(id => id !== null))];
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          
          const profilesMap = {};
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });

          // Fetch tug assignments from today's prechecks
          const tugMap = {};
          try {
            const { data: tugAssignments } = await supabase
              .rpc('get_tug_assignments_for_date', { target_date: effectiveForBreaks });
            tugAssignments?.forEach(ta => {
              tugMap[ta.user_id] = ta.tug_name;
            });
          } catch (e) {
            console.warn('Could not fetch tug assignments:', e);
          }
          
          // Only include breaks where we found a profile
          const breaksWithProfiles = breaksData
            .filter(b => b.user_id && profilesMap[b.user_id])
            .map(b => ({
              ...b,
              profiles: profilesMap[b.user_id],
              tug_name: tugMap[b.user_id] || null
            }));
          
          // DEDUPLICATE: Remove duplicate entries - same user can have multiple breaks
          const uniqueBreaks = [];
          const seenBreakKeys = new Set();
          
          breaksWithProfiles.forEach(breakItem => {
            const key = `${breakItem.user_id}-${breakItem.break_start_time}`;
            if (!seenBreakKeys.has(key)) {
              seenBreakKeys.add(key);
              uniqueBreaks.push(breakItem);
            }
          });
          
          const sortedBreaks = uniqueBreaks.sort((a, b) => 
            getNightSortValue(a.break_start_time) - getNightSortValue(b.break_start_time)
          );
          
          setAllBreaks(sortedBreaks);
        } else {
          setAllBreaks([]);
        }
      } catch (err) {
        console.error('Error fetching team schedule:', err);
      }
    };

    fetchTeamSchedule();
    
    // Refresh team data every 15 minutes
    const teamDataInterval = setInterval(fetchTeamSchedule, 15 * 60 * 1000);
    return () => clearInterval(teamDataInterval);
  }, [user]);

  // Fetch team break info
  useEffect(() => {
    if (!user || !userProfile) {
      setBreakInfo(null);
      return;
    }

    const fetchBreakInfo = async () => {
      // Use local-date logic with a 06:00 boundary for night shift continuity
      const toLocalYmd = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const now = new Date();
      const effectiveDateObj = now.getHours() < 6 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : now;
      const today = toLocalYmd(effectiveDateObj); // YYYY-MM-DD format anchored to shift start day

      try {
        // Determine which shifts to show based on user's shift preference
        let shiftFilter = '';
        if (userProfile.shift_preference === 'day') {
          shiftFilter = 'shift_type.eq.day,shift_type.eq.afternoon';
        } else if (userProfile.shift_preference === 'night') {
          shiftFilter = 'shift_type.eq.night,shift_type.eq.afternoon';
        } else if (userProfile.shift_preference === 'afternoon') {
          shiftFilter = 'shift_type.eq.afternoon';
        } else {
          // Default: show all shifts if preference not set
          shiftFilter = 'shift_type.eq.day,shift_type.eq.afternoon,shift_type.eq.night';
        }

        // Get all breaks matching the filter for today's date
        const { data: allBreaks, error: allBreaksError } = await supabase
          .from('scheduled_breaks')
          .select(`
            id, 
            user_id, 
            break_start_time, 
            break_duration_minutes, 
            break_type,
            shift_type,
            profiles:user_id (
              first_name, 
              last_name
            )
          `)
          .eq('date', today)
          .or(shiftFilter)
          .order('break_start_time');

        if (allBreaksError) throw allBreaksError;

        if (allBreaks && allBreaks.length > 0) {
          // Separate my breaks from team breaks
          const myBreaks = allBreaks.filter(b => b.user_id === user.id);
          const teamBreaks = allBreaks.map(b => ({
            ...b,
            isCurrentUser: b.user_id === user.id
          }));
          
          // Group breaks by shift type
          const breaksByShift = {
            day: teamBreaks.filter(b => b.shift_type === 'day'),
            afternoon: teamBreaks.filter(b => b.shift_type === 'afternoon'),
            night: teamBreaks.filter(b => b.shift_type === 'night')
          };
          
          setBreakInfo({ 
            myBreaks, 
            teamBreaks, 
            breaksByShift
          });
        } else {
          setBreakInfo('none'); // No breaks scheduled for today
        }
      } catch (e) {
        console.error('Error in break info component:', e);
        setBreakInfo('error');
      }
    };

    fetchBreakInfo();
  }, [user, userProfile]);

  // Format time helpers
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Format a single break for display
  const formatBreakTime = (breakItem) => {
    const startTime = breakItem.break_start_time.substring(0, 5);
    const endTime = calculateEndTime(startTime, breakItem.break_duration_minutes);
    return `${startTime} - ${endTime}`;
  };
  
  // Removed unused functions: getShiftLabel, getShiftColor, getShiftAccentColor
  // These were only used in unreachable code below
  
  // Removed unused functions: isShiftNow, getShiftProgress, getTimeRemaining, getNextBreak, toggleView
  // These were only used in unreachable code below (after line 1177)

  if (loading) {
    return (
      <div className="w-full mb-4 bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="h-5 bg-gray-200 rounded w-2/5 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mb-4 bg-red-50 rounded-lg border border-red-200 p-4">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  // Show team schedule for everyone (unified view)
  if (true) {
    // Group shifts by type
    const shiftsByType = {
      day: allShifts.filter(s => s.shift_type === 'day'),
      afternoon: allShifts.filter(s => s.shift_type === 'afternoon'),
      night: allShifts.filter(s => s.shift_type === 'night')
    };

    // Group breaks by type
    const breaksByType = {
      day: allBreaks.filter(b => b.shift_type === 'day'),
      afternoon: allBreaks.filter(b => b.shift_type === 'afternoon'),
      night: allBreaks.filter(b => b.shift_type === 'night')
    };

    // Helpers for highlighting and progress for the current user
    const toMinutes = (hhmm) => {
      if (!hhmm) return null;
      const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
      return h * 60 + m;
    };
    const getNowMinutes = () => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    };
    const getShiftProgressFor = (start, end) => {
      let startM = toMinutes(start);
      let endM = toMinutes(end);
      let nowM = getNowMinutes();
      if (startM == null || endM == null) return 0;
      // Handle overnight shifts (end next day)
      if (endM <= startM) {
        endM += 24 * 60;
        if (nowM < startM) nowM += 24 * 60; // after midnight, still in same shift window
      }
      if (nowM <= startM) return 0;
      if (nowM >= endM) return 100;
      return Math.floor(((nowM - startM) / (endM - startM)) * 100);
    };
    const getMinutesLeft = (end, start) => {
      let endM = toMinutes(end);
      let startM = toMinutes(start);
      let nowM = getNowMinutes();
      if (endM == null) return null;
      if (startM != null && endM <= startM) {
        endM += 24 * 60;
        if (nowM < startM) nowM += 24 * 60;
      }
      return Math.max(0, endM - nowM);
    };
    const getMinutesElapsed = (start, end) => {
      let startM = toMinutes(start);
      let endM = toMinutes(end);
      let nowM = getNowMinutes();
      if (startM == null || endM == null) return 0;
      if (endM <= startM) {
        endM += 24 * 60;
        if (nowM < startM) nowM += 24 * 60;
      }
      if (nowM <= startM) return 0;
      if (nowM >= endM) return endM - startM;
      return nowM - startM;
    };
    const isNowWithinShift = (start, end) => {
      let startM = toMinutes(start);
      let endM = toMinutes(end);
      let nowM = getNowMinutes();
      if (startM == null || endM == null) return false;
      if (endM <= startM) {
        endM += 24 * 60;
        if (nowM < startM) nowM += 24 * 60;
      }
      return nowM >= startM && nowM < endM;
    };
    const getMinutesUntilStart = (start) => {
      const startM = toMinutes(start);
      const nowM = getNowMinutes();
      if (startM == null) return null;
      if (nowM < startM) return startM - nowM;
      return null;
    };
    const formatDuration = (mins) => {
      if (mins == null) return '';
      const h = Math.floor(mins / 60);
      const m = Math.floor(mins % 60);
      if (h <= 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    };
    const getBreakProgressFor = (start, duration) => {
      const startM = toMinutes(start);
      const endM = startM != null ? startM + (duration || 0) : null;
      const nowM = getNowMinutes();
      if (startM == null || endM == null || endM <= startM) return { active: false, pct: 0, left: 0 };
      if (nowM < startM) return { active: false, pct: 0, left: startM - nowM };
      if (nowM >= endM) return { active: false, pct: 100, left: 0 };
      const pct = Math.floor(((nowM - startM) / (endM - startM)) * 100);
      const left = Math.max(0, endM - nowM);
      return { active: true, pct, left };
    };
    // Compute next/active break info for current user
    const getNextBreakForUser = () => {
      if (!breakInfo || !breakInfo.myBreaks || breakInfo.myBreaks.length === 0) return null;
      const nowM = getNowMinutes();
      const sorted = [...breakInfo.myBreaks].sort((a, b) => toMinutes(a.break_start_time) - toMinutes(b.break_start_time));
      // Check if currently on any break
      for (const b of sorted) {
        const start = toMinutes(b.break_start_time);
        const end = start + (b.break_duration_minutes || 0);
        if (nowM >= start && nowM < end) {
          return {
            type: 'active',
            minutesLeft: end - nowM,
            start,
            end
          };
        }
      }
      // Find next upcoming break
      const upcoming = sorted.find(b => toMinutes(b.break_start_time) > nowM);
      if (!upcoming) return null;
      const start = toMinutes(upcoming.break_start_time);
      return {
        type: 'upcoming',
        minutesToStart: start - nowM,
        start,
        duration: upcoming.break_duration_minutes || 0
      };
    };

    // Locations list (prefer Rugby, NRC, Nuneaton order)
    const allLocations = [...new Set(allShifts.map(s => s.location))];
    const preferredOrder = ['Rugby', 'NRC', 'Nuneaton'];
    const sortedLocations = allLocations.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return (a || '').localeCompare(b || '');
    });
    // Ensure current tab is valid
    if (sortedLocations.length > 0 && !sortedLocations.includes(teamLocation)) {
      // Default to Rugby if present, else first available
      setTeamLocation(sortedLocations.includes('Rugby') ? 'Rugby' : sortedLocations[0]);
    }

    // Map user -> location for breaks filtering
    const userLocationMap = new Map(allShifts.map(s => [s.user_id, s.location]));

    // Map user -> shift times for tug badge visibility (only show during active shift)
    const userShiftMap = new Map(allShifts.map(s => [s.user_id, { start_time: s.start_time, end_time: s.end_time }]));

    // Helper function to check if break is currently active
    const isBreakActive = (breakStartTime, breakDurationMinutes) => {
      const now = getNowMinutes();
      const start = toMinutes(breakStartTime);
      const end = start + (breakDurationMinutes || 0);
      return now >= start && now < end;
    };

    // Determine current shift type based on time
    const getCurrentShiftType = () => {
      const now = getNowMinutes();
      const hour = Math.floor(now / 60);
      
      // Night shift: before 06:00 (from previous day 18:00) or after 18:00 (today's night)
      if (now < 6 * 60 || now >= 18 * 60) {
        return 'night';
      }
      // Day shift: 06:00-17:00
      if (now >= 6 * 60 && now < 17 * 60) {
        return 'day';
      }
      // Afternoon shift: 17:00-21:00
      if (now >= 17 * 60 && now < 21 * 60) {
        return 'afternoon';
      }
      // After 21:00, it's night shift
      return 'night';
    };

    // Check if break belongs to current shift
    const isBreakFromCurrentShift = (breakShiftType) => {
      const currentShift = getCurrentShiftType();
      return breakShiftType === currentShift;
    };

    // Sort breaks: active first, then by time (considering night shift)
    const sortBreaks = (breaks, shiftType) => {
      return [...breaks].sort((a, b) => {
        const aActive = isBreakActive(a.break_start_time, a.break_duration_minutes);
        const bActive = isBreakActive(b.break_start_time, b.break_duration_minutes);
        
        // 1. Active breaks first
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        
        // 2. Sort by time - handle night shift properly
        const aTime = toMinutes(a.break_start_time);
        const bTime = toMinutes(b.break_start_time);
        
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        
        // For night shift, times after 18:00 (1080 minutes) should come before times before 06:00 (360 minutes)
        if (shiftType === 'night') {
          // Night shift spans from 18:00 to 06:00 next day
          // Times 18:00-23:59 (1080-1439) are "early" in the shift
          // Times 00:00-05:59 (0-359) are "late" in the shift
          const aAdjusted = aTime >= 18 * 60 ? aTime : aTime + 24 * 60; // Add 24h to early morning times
          const bAdjusted = bTime >= 18 * 60 ? bTime : bTime + 24 * 60;
          return aAdjusted - bAdjusted;
        }
        
        // For day and afternoon shifts, normal time sorting
        return aTime - bTime;
      });
    };

    return (
      <>
        {/* Location Button - Only for Breaks view AND if not hidden */}
        {teamView === 'breaks' && !hideLocationButton && (
          <div className="mb-4 px-4">
            <button
              onClick={() => setShowLocationModal(true)}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {teamLocation || 'Select Location'}
            </button>
          </div>
        )}

        {/* Toggle between Shifts and Breaks */}
        {!hideTabSwitcher && (
          <div className="mb-4 px-4">
            <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button 
                onClick={() => setTeamView('shifts')}
                className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
                  teamView === 'shifts' 
                    ? 'text-emerald-800 bg-emerald-50 border-b-2 border-black' 
                    : 'text-gray-600 hover:text-charcoal hover:bg-gray-50'
                }`}
              >
                Today's Shifts
              </button>
              <button 
                onClick={() => setTeamView('breaks')}
                className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
                  teamView === 'breaks' 
                    ? 'text-sky-800 bg-sky-50 border-b-2 border-black' 
                    : 'text-gray-600 hover:text-charcoal hover:bg-gray-50'
                }`}
              >
                Today's Breaks
              </button>
            </div>
          </div>
        )}

        {/* Location Tabs - Only for Shifts view */}
        {teamView === 'shifts' && (
          <div className="mb-4 px-4">
            <div className="flex flex-wrap gap-2">
              {sortedLocations.map(loc => (
                <button
                  key={loc}
                  onClick={() => setTeamLocation(loc)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    teamLocation === loc ? 'bg-black text-white' : 'text-charcoal hover:bg-gray-100'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className={hideLocationButton ? '' : 'px-4 pb-4'}>
          {teamView === 'shifts' ? (
            allShifts.length === 0 ? (
              <p className="text-gray-600 text-center py-4">No shifts scheduled for today</p>
            ) : (
              <div className="space-y-6">
                {/* Single location selected via tabs */}
                {(() => {
                  const location = teamLocation;
                  const locationShifts = allShifts.filter(s => s.location === location);
                  return (
                    <div className="space-y-3">
                      {['day', 'afternoon', 'night'].map(shiftType => {
                        const shifts = locationShifts.filter(s => s.shift_type === shiftType);
                        if (shifts.length === 0) return null;
                        
                        const shiftColors = {
                          day: 'bg-amber-100 text-amber-800 border-amber-300',
                          afternoon: 'bg-orange-100 text-orange-800 border-orange-300',
                          night: 'bg-blue-100 text-blue-800 border-blue-300'
                        };

                        return (
                          <div key={shiftType} className="ml-2">
                            <h3 className={`text-xs font-bold uppercase mb-2 px-2 py-1 rounded inline-block border ${shiftColors[shiftType]}`}>
                              {shiftType} Shift ({shifts.length})
                            </h3>
                            <ul className="space-y-1 mt-2">
                              {shifts.map(s => {
                                const isMe = s.user_id === user?.id;
                                const progress = getShiftProgressFor(s.start_time, s.end_time);
                                const minutesLeft = getMinutesLeft(s.end_time, s.start_time);
                                const minutesElapsed = getMinutesElapsed(s.start_time, s.end_time);
                                return (
                                  <li 
                                    key={s.id} 
                                    className={`p-2 rounded border flex flex-col gap-1 ${isMe ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'}`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className={`font-medium ${isMe ? 'text-black' : 'text-charcoal'}`}>
                                        {s.profiles?.first_name || 'Unknown'} {s.profiles?.last_name || 'User'}{isMe ? ' (You)' : ''}
                                      </span>
                                      <span className="text-sm text-gray-600">
                                        {s.start_time?.substring(0,5) || '??:??'} - {s.end_time?.substring(0,5) || '??:??'}
                                      </span>
                                    </div>
                                    {isMe && isNowWithinShift(s.start_time, s.end_time) && (
                                      <div className="mt-0.5">
                                        <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
                                          <span>Shift progress</span>
                                          <span>{Math.max(0, Math.min(100, progress))}%{minutesLeft != null ? ` • ${formatDuration(minutesLeft)} left` : ''}</span>
                                        </div>
                                        <div className="h-2 w-full bg-gray-200 border border-gray-300 rounded-full overflow-hidden">
                                          <div className="h-full bg-black rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}></div>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                                          <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                                            Elapsed: {formatDuration(minutesElapsed)}
                                          </span>
                                          {minutesLeft != null && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                                              Left: {formatDuration(minutesLeft)} (ends {formatTime(s.end_time)})
                                            </span>
                                          )}
                                        </div>
                                        {/* Until next break */}
                                        {(() => {
                                          const nb = getNextBreakForUser();
                                          if (!nb) return null;
                                          if (nb.type === 'active') {
                                            return (
                                              <div className="mt-1">
                                                <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
                                                  <span>On break</span>
                                                  <span>{formatDuration(nb.minutesLeft)} left</span>
                                                </div>
                                                <div className="h-2 w-full bg-gray-200 border border-gray-300 rounded-full overflow-hidden">
                                                  {(() => {
                                                    const total = nb.end - nb.start;
                                                    const elapsed = Math.max(0, Math.min(total, getNowMinutes() - nb.start));
                                                    const pctActive = total > 0 ? Math.floor((elapsed / total) * 100) : 0;
                                                    return (
                                                      <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${pctActive}%` }}></div>
                                                    );
                                                  })()}
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                                                  <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                                                    Remaining: {formatDuration(nb.minutesLeft)}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          }
                                          // Upcoming break
                                          const totalWindow = nb.start - toMinutes(s.start_time);
                                          const elapsedToBreak = getNowMinutes() - toMinutes(s.start_time);
                                          const pctToBreak = totalWindow > 0 ? Math.max(0, Math.min(100, Math.floor((elapsedToBreak / totalWindow) * 100))) : 0;
                                          return (
                                            <div className="mt-1">
                                              <div className="flex justify-between text-[10px] text-gray-600 mb-0.5">
                                                <span>Until break</span>
                                                <span>{formatDuration(nb.minutesToStart)}</span>
                                              </div>
                                              <div className="h-2 w-full bg-gray-200 border border-gray-300 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pctToBreak}%` }}></div>
                                              </div>
                                              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                                                  Starts in: {formatDuration(nb.minutesToStart)}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                    {isMe && !isNowWithinShift(s.start_time, s.end_time) && getMinutesUntilStart(s.start_time) != null && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700">
                                          Starts in: {formatDuration(getMinutesUntilStart(s.start_time))}
                                        </span>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )
          ) : (
            allBreaks.length === 0 ? (
              <p className="text-gray-600 text-center py-4">No breaks scheduled for today</p>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const currentShift = getCurrentShiftType();
                  const shiftOrder = [currentShift, 'day', 'afternoon', 'night'].filter((v, i, a) => a.indexOf(v) === i);

                  return shiftOrder.map(shiftType => {
                    if (!selectedShifts.includes(shiftType)) return null;

                    const breaks = breaksByType[shiftType].filter(b => userLocationMap.get(b.user_id) === teamLocation);
                    if (breaks.length === 0) return null;

                    const sortedBreaks = sortBreaks(breaks, shiftType);
                    let orderedBreaks = [...sortedBreaks];

                    if (user?.id) {
                      const myIndex = orderedBreaks.findIndex(b => b.user_id === user.id);
                      if (myIndex !== -1) {
                        const myBreak = orderedBreaks[myIndex];
                        const myProgress = getBreakProgressFor(myBreak.break_start_time, myBreak.break_duration_minutes);
                        // Only reposition when the user's break is not currently active
                        if (!myProgress.active) {
                          orderedBreaks.splice(myIndex, 1);
                          const activeCount = orderedBreaks.reduce((count, b) => {
                            const progress = getBreakProgressFor(b.break_start_time, b.break_duration_minutes);
                            return progress.active ? count + 1 : count;
                          }, 0);
                          orderedBreaks.splice(activeCount, 0, myBreak);
                        }
                      }
                    }
                    const shiftColors = {
                      day: 'bg-amber-100 text-amber-800 border-amber-300',
                      afternoon: 'bg-orange-100 text-orange-800 border-orange-300',
                      night: 'bg-blue-100 text-blue-800 border-blue-300'
                    };

                    return (
                      <div 
                        key={shiftType}
                      >
                        {!renderShiftBadges && (
                          <h3 className={`text-xs font-bold uppercase mb-3 px-2 py-1 rounded inline-block border ${shiftColors[shiftType]}`}>
                            {shiftType} Shift ({sortedBreaks.length})
                          </h3>
                        )}
                        <div className="space-y-3 mb-4">
                          {orderedBreaks.map((b, index) => {
                            const endTime = calculateEndTime(b.break_start_time, b.break_duration_minutes);
                            const isMe = b.user_id === user?.id;
                            const br = getBreakProgressFor(b.break_start_time, b.break_duration_minutes);
                            const isActive = br.active;
                            let cardColors = isActive
                              ? 'bg-green-50 border-green-300 shadow-green-100'
                              : 'bg-orange-50 border-orange-200 shadow-orange-100';
                            let cardExtras = '';

                            if (isMe) {
                              if (isActive) {
                                cardExtras = 'ring-2 ring-green-400 ring-offset-2 ring-offset-green-50';
                              } else {
                                cardColors = 'bg-amber-50 border-amber-300 shadow-amber-100';
                                cardExtras = 'ring-2 ring-amber-300';
                              }
                            }

                            return (
                              <div
                                key={b.id}
                                className={`rounded-2xl border p-4 shadow-sm transition-colors ${cardColors} ${cardExtras}`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-bold text-charcoal">
                                      {b.profiles?.first_name || 'Unknown'} {b.profiles?.last_name || 'User'}
                                      {isMe && <span className="text-gray-500"> (You)</span>}
                                    </p>
                                    {b.tug_name && (() => {
                                      const shift = userShiftMap.get(b.user_id);
                                      return shift && isNowWithinShift(shift.start_time, shift.end_time);
                                    })() && (
                                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {b.tug_name}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                    {b.break_start_time?.substring(0,5) || '??:??'} - {endTime}
                                  </span>
                                </div>

                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                                  <span className="inline-flex items-center gap-1 font-semibold">
                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                                    {isActive ? 'On break now' : 'Scheduled break'}
                                  </span>
                                  {isActive && <span className="text-green-700 font-semibold">{br.left}m left</span>}
                                </div>

                                {isActive && (
                                  <div className="mt-3">
                                    <div className="flex justify-between text-[11px] text-gray-600 mb-1">
                                      <span>Break progress</span>
                                      <span>{br.pct}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden border border-green-200">
                                      <div
                                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                                        style={{ width: `${br.pct}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )
          )}
        </div>

        {/* Location Selection Modal */}
        {showLocationModal && createPortal(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-charcoal">Select Location</h3>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 overflow-y-auto">
                {sortedLocations.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => {
                      setTeamLocation(loc);
                      setShowLocationModal(false);
                    }}
                    className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                      teamLocation === loc
                        ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                        : 'text-charcoal hover:bg-gray-100 border-gray-300'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Note: Previous code after this point (lines 1179-1467 in original file) was unreachable
  // due to the if (true) condition above always returning. That dead code has been removed.
} 