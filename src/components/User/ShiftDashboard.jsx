import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { getAbsentUserIdsForDates } from '../../utils/attendanceHelpers';

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

// Local calendar date as YYYY-MM-DD (toISOString would give the UTC date, which is wrong around midnight in BST)
const toLocalYmd = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const normalized = timeStr.slice(0, 5);
  const [hours, minutes] = normalized.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const normalizeTimelineMinutes = (minutes, nowMinutes) => {
  if (minutes == null) return null;
  // Before 06:00: treat evening times (18:00+) as "yesterday" (negative)
  if (nowMinutes < 6 * 60 && minutes >= 18 * 60) {
    return minutes - 24 * 60;
  }
  // After 18:00: treat early-morning times (00:00-06:00) as "upcoming" (next day)
  if (nowMinutes >= 18 * 60 && minutes < 6 * 60) {
    return minutes + 24 * 60;
  }
  return minutes;
};

/**
 * Position a break on a continuous timeline measured in minutes from local midnight
 * today, so a break carried by a neighbouring calendar date lands before or after
 * the current day instead of being guessed from the clock.
 */
const breakStartOnTimeline = (breakItem, todayYmd) => {
  const minutes = parseTimeToMinutes(breakItem.break_start_time);
  if (minutes == null) return null;
  if (!breakItem.date) return minutes;
  const dayOffset = Math.round(
    (Date.parse(`${breakItem.date}T00:00:00`) - Date.parse(`${todayYmd}T00:00:00`)) / 86400000
  );
  return minutes + dayOffset * 24 * 60;
};

/** Resolve break location: prefer scheduled_breaks.location, fallback to today's shift map */
const getBreakLocation = (breakItem, userLocationMap) =>
  breakItem.location || userLocationMap.get(breakItem.user_id) || null;

/** Post-midnight window on next calendar day (operational day rules) */
const isPostMidnightBreakTime = (timeStr) => {
  const minutes = parseTimeToMinutes(timeStr);
  return minutes != null && minutes < 6 * 60;
};

export default function ShiftDashboard({ 
  initialView = 'shift', 
  hideTabSwitcher = false, 
  hideLocationButton = false,
  selectedLocation = null,
  renderShiftBadges = false,
  selectedShifts = ['day', 'afternoon', 'night'],
  onShiftCountsChange = null,
  onUserBreakLabelChange = null,
  breakHeaderControls = null
}) {
  const { user, sessionProfile } = useAuth();
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
  const [teamLocation, setTeamLocation] = useState(selectedLocation || ''); // location tab
  const [showLocationModal, setShowLocationModal] = useState(false);
  
  // Parent CalendarPage owns location when selectedLocation is set — always sync, never override from shifts
  useEffect(() => {
    if (selectedLocation) {
      setTeamLocation(selectedLocation);
    }
  }, [selectedLocation]);

  // Fallback only when parent does not control location: keep teamLocation among known locations
  useEffect(() => {
    if (selectedLocation) return;

    const fromShifts = allShifts.map((s) => s.location).filter(Boolean);
    const fromBreaks = allBreaks.map((b) => b.location).filter(Boolean);
    const known = [...new Set([...fromShifts, ...fromBreaks])].sort((a, b) =>
      (a || '').localeCompare(b || '')
    );
    if (known.length === 0) return;
    if (!teamLocation || !known.includes(teamLocation)) {
      setTeamLocation(known[0]);
    }
  }, [selectedLocation, allShifts, allBreaks, teamLocation]);
  
  // Update shift counts when data changes. Counts mirror the list, which only
  // shows breaks that are running or still ahead.
  useEffect(() => {
    if (onShiftCountsChange && allBreaks.length > 0) {
      const userLocationMap = new Map(allShifts.map(s => [s.user_id, s.location]));
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const todayYmd = toLocalYmd(now);
      const stillRelevant = allBreaks.filter((b) => {
        if (getBreakLocation(b, userLocationMap) !== teamLocation) return false;
        const start = breakStartOnTimeline(b, todayYmd);
        if (start == null) return false;
        return nowMinutes < start + (b.break_duration_minutes || 0);
      });
      const counts = {
        day: stillRelevant.filter(b => b.shift_type === 'day').length,
        afternoon: stillRelevant.filter(b => b.shift_type === 'afternoon').length,
        night: stillRelevant.filter(b => b.shift_type === 'night').length
      };
      onShiftCountsChange(counts);
    }
  }, [allBreaks, allShifts, teamLocation, onShiftCountsChange, currentTime]);

  // Expose current user's break status for parent header (Calendar page)
  useEffect(() => {
    if (!onUserBreakLabelChange) return;
    if (!user) {
      onUserBreakLabelChange('');
      return;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayYmd = toLocalYmd(now);
    const userBreaks = allBreaks.filter(
      (b) => b.user_id === user.id && selectedShifts.includes(b.shift_type)
    );

    if (userBreaks.length === 0) {
      onUserBreakLabelChange('You: no breaks today');
      return;
    }

    const normalizedBreaks = userBreaks
      .map((b) => {
        const start = breakStartOnTimeline(b, todayYmd);
        if (start == null) return null;
        const duration = b.break_duration_minutes || 0;
        return { breakItem: b, start, end: start + duration };
      })
      .filter(Boolean);

    const activeBreak = normalizedBreaks.find((b) => nowMinutes >= b.start && nowMinutes < b.end);
    if (activeBreak) {
      const minutesLeft = Math.max(0, activeBreak.end - nowMinutes);
      onUserBreakLabelChange(`You on break now (${minutesLeft}m left)`);
      return;
    }

    const nextBreak = normalizedBreaks
      .filter((b) => b.start > nowMinutes)
      .sort((a, b) => a.start - b.start)[0];

    if (nextBreak) {
      const nextTime = nextBreak.breakItem.break_start_time?.substring(0, 5) || '??:??';
      onUserBreakLabelChange(`You at ${nextTime}`);
      return;
    }

    onUserBreakLabelChange('You: break finished');
  }, [allBreaks, selectedShifts, user, onUserBreakLabelChange, currentTime]);
  
  // Shift preference / name: prefer sessionProfile from App gate; else fetch (same select as before)
  useEffect(() => {
    if (!user) return;

    if (
      sessionProfile &&
      (sessionProfile.shift_preference !== undefined ||
        sessionProfile.first_name !== undefined ||
        sessionProfile.last_name !== undefined)
    ) {
      setUserProfile({
        first_name: sessionProfile.first_name,
        last_name: sessionProfile.last_name,
        shift_preference: sessionProfile.shift_preference,
      });
      return;
    }

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
  }, [user, sessionProfile]);

  // Fetch today's shift
  const fetchTodaysShift = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // Get today's date in local YYYY-MM-DD format
      const today = toLocalYmd(new Date());

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
  }, [user]);

  useEffect(() => {
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
  }, [fetchTodaysShift]);

  // Fetch ALL today's shifts and breaks for team view
  // Retry state: transient failures (expired token right after iOS resume, flaky yard network)
  // must not leave the break list empty until the next 15-minute interval tick.
  const teamRetryRef = useRef({ timeoutId: null, attempts: 0 });

  const fetchTeamSchedule = useCallback(async () => {
      if (!user) return;

      try {
        // Dates: keep shifts on calendar 'today', but for breaks, anchor to previous day until 06:00
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

        let selectedShiftsRaw = [];
        if (shiftsData && shiftsData.length > 0) {
          selectedShiftsRaw = shiftsData.filter(s => {
            if (s.shift_type === 'night') {
              return beforeSix ? s.date === yesterday : s.date === today;
            }
            return s.date === today;
          });
        }

        // Operational day: anchor date + next calendar day (only 00:00-05:59 from next day)
        const nextDate = toLocalYmd(new Date(
          new Date(`${effectiveForBreaks}T12:00:00`).getTime() + 86400000
        ));

        const { data: breaksRaw, error: breaksError } = await supabase
          .from('scheduled_breaks')
          .select('id, user_id, break_start_time, break_duration_minutes, break_type, shift_type, date, location')
          .in('date', [effectiveForBreaks, nextDate])
          .order('break_start_time');
          
        if (breaksError) throw breaksError;

        const breaksData = (breaksRaw || []).filter((b) => {
          if (b.date === effectiveForBreaks) return true;
          if (b.date === nextDate) return isPostMidnightBreakTime(b.break_start_time);
          return false;
        });

        const shiftUserIds = [...new Set(selectedShiftsRaw.map(s => s.user_id).filter(id => id != null))];
        const breakUserIds =
          breaksData && breaksData.length > 0
            ? [...new Set(breaksData.map(b => b.user_id).filter(id => id != null))]
            : [];
        const unionIds = [...new Set([...shiftUserIds, ...breakUserIds])];

        const profilesMap = {};
        if (unionIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', unionIds);
          if (profilesError) throw profilesError;
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });
        }

        if (selectedShiftsRaw.length > 0) {
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

        // Attach profiles to breaks
        if (breaksData && breaksData.length > 0) {

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

          // Exclude users marked absent (no show / sick / late) on effective date(s)
          const absentUserIds = await getAbsentUserIdsForDates(supabase, [effectiveForBreaks, yesterday]);
          const breaksFilteredAbsent = breaksWithProfiles.filter(b => !absentUserIds.has(b.user_id));
          
          // DEDUPLICATE: Remove duplicate entries - same user can have multiple breaks
          const uniqueBreaks = [];
          const seenBreakKeys = new Set();
          
          breaksFilteredAbsent.forEach(breakItem => {
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
        teamRetryRef.current.attempts = 0;
      } catch (err) {
        console.error('Error fetching team schedule:', err);
        if (teamRetryRef.current.attempts < 3) {
          teamRetryRef.current.attempts += 1;
          clearTimeout(teamRetryRef.current.timeoutId);
          teamRetryRef.current.timeoutId = setTimeout(() => {
            fetchTeamSchedule();
          }, 30 * 1000);
        }
      }
  }, [user]);

  useEffect(() => {
    fetchTeamSchedule();
    
    // Refresh team data every 15 minutes
    const teamDataInterval = setInterval(fetchTeamSchedule, 15 * 60 * 1000);
    const retryState = teamRetryRef.current;
    return () => {
      clearInterval(teamDataInterval);
      clearTimeout(retryState.timeoutId);
    };
  }, [fetchTeamSchedule]);

  // Fetch team break info
  const fetchBreakInfo = useCallback(async () => {
      if (!user || !userProfile) return;

      // Use local-date logic with a 06:00 boundary for night shift continuity
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
          // Carry the anchor date so break times can be placed on a timeline
          const myBreaks = allBreaks
            .filter(b => b.user_id === user.id)
            .map(b => ({ ...b, date: today }));
          const teamBreaks = allBreaks.map(b => ({
            ...b,
            date: today,
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
  }, [user, userProfile]);

  useEffect(() => {
    if (!user || !userProfile) {
      setBreakInfo(null);
      return;
    }
    fetchBreakInfo();
  }, [user, userProfile, fetchBreakInfo]);

  // Refetch when the app comes back from background. iOS Safari / home-screen PWAs freeze JS
  // timers while suspended and restore the page from memory instead of reloading it, so the
  // 15-minute intervals alone can leave the break list stale or empty for a long time.
  const lastResumeRefetchRef = useRef(0);
  useEffect(() => {
    const refetchAll = () => {
      const nowTs = Date.now();
      if (nowTs - lastResumeRefetchRef.current < 30 * 1000) return;
      lastResumeRefetchRef.current = nowTs;
      setCurrentTime(new Date());
      fetchTodaysShift();
      fetchTeamSchedule();
      fetchBreakInfo();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetchAll();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refetchAll);
    window.addEventListener('online', refetchAll);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refetchAll);
      window.removeEventListener('online', refetchAll);
    };
  }, [fetchTodaysShift, fetchTeamSchedule, fetchBreakInfo]);

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
      <div
        className="w-full mb-4 min-h-[min(22rem,55vh)] rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-50/95 to-white/90 p-3 shadow-sm sm:p-4"
        aria-busy="true"
        aria-label="Loading breaks"
      >
        {/* Match filter-bar-segmented + list height to reduce CLS when data arrives */}
        <div className="mb-4 grid grid-cols-4 gap-1.5 sm:gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 rounded-xl bg-slate-200/80 animate-pulse sm:h-10"
            />
          ))}
        </div>
        <div className="mb-3 h-20 rounded-2xl border border-dashed border-slate-200/70 bg-white/40 animate-pulse" />
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-4 animate-pulse">
            <div className="mb-3 h-4 w-2/3 rounded bg-slate-200/80" />
            <div className="h-3 w-1/2 rounded bg-slate-200/60" />
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-4 animate-pulse">
            <div className="mb-3 h-4 w-1/2 rounded bg-slate-200/80" />
            <div className="h-3 w-2/3 rounded bg-slate-200/60" />
          </div>
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
      const startRaw = toMinutes(start);
      const nowM = getNowMinutes();
      const startM = normalizeTimelineMinutes(startRaw, nowM);
      const endM = startM != null ? startM + (duration || 0) : null;
      if (startM == null || endM == null) return { active: false, pct: 0, left: 0 };
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
      const todayYmd = toLocalYmd(new Date());
      const withNorm = breakInfo.myBreaks.map((b) => {
        const start = breakStartOnTimeline(b, todayYmd);
        return { ...b, start, end: start != null ? start + (b.break_duration_minutes || 0) : null };
      }).filter((b) => b.start != null);
      const sorted = withNorm.sort((a, b) => a.start - b.start);
      // Check if currently on any break
      for (const b of sorted) {
        if (nowM >= b.start && nowM < b.end) {
          return {
            type: 'active',
            minutesLeft: b.end - nowM,
            start: b.start,
            end: b.end
          };
        }
      }
      // Find next upcoming break
      const upcoming = sorted.find((b) => b.start > nowM);
      if (!upcoming) return null;
      return {
        type: 'upcoming',
        minutesToStart: upcoming.start - nowM,
        start: upcoming.start,
        duration: upcoming.break_duration_minutes || 0
      };
    };

    // Locations list sorted alphabetically from live shift data (+ break locations for modal)
    const allLocations = [...new Set([
      ...allShifts.map(s => s.location),
      ...allBreaks.map(b => b.location),
    ].filter(Boolean))];
    const sortedLocations = allLocations.sort((a, b) => (a || '').localeCompare(b || ''));

    // Map user -> location for breaks filtering fallback
    const userLocationMap = new Map(allShifts.map(s => [s.user_id, s.location]));

    // Map user -> shift times for tug badge visibility (only show during active shift)
    const userShiftMap = new Map(allShifts.map(s => [s.user_id, { start_time: s.start_time, end_time: s.end_time }]));

    // Helper function to check if break is currently active (handles overnight breaks)
    const isBreakActive = (breakStartTime, breakDurationMinutes) => {
      const now = getNowMinutes();
      const startRaw = toMinutes(breakStartTime);
      const start = normalizeTimelineMinutes(startRaw, now);
      if (start == null) return false;
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
                  const nowMinutes = getNowMinutes();
                  const todayYmd = toLocalYmd(new Date());
                  const getBreakWindow = (breakItem) => {
                    const start = breakStartOnTimeline(breakItem, todayYmd);
                    if (start == null) return null;
                    const duration = breakItem.break_duration_minutes || 0;
                    const end = start + duration;
                    return { start, end, duration };
                  };

                  const filteredBreaks = allBreaks.filter((b) => (
                    selectedShifts.includes(b.shift_type) &&
                    getBreakLocation(b, userLocationMap) === teamLocation
                  ));

                  const entries = filteredBreaks
                    .map((breakItem) => {
                      const window = getBreakWindow(breakItem);
                      if (!window) return null;
                      return { breakItem, window };
                    })
                    .filter(Boolean);

                  const shiftPriority = ['day', 'afternoon', 'night'];
                  const selectedShiftFlow = shiftPriority.filter((shiftType) => selectedShifts.includes(shiftType));
                  const shiftWeight = (shiftType) => {
                    const idx = selectedShiftFlow.indexOf(shiftType);
                    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
                  };
                  const byShiftThenTime = (a, b) =>
                    shiftWeight(a.breakItem.shift_type) - shiftWeight(b.breakItem.shift_type) ||
                    a.window.start - b.window.start;

                  const activeEntries = entries
                    .filter((entry) => nowMinutes >= entry.window.start && nowMinutes < entry.window.end)
                    .sort(byShiftThenTime);

                  // Breaks already finished are dropped: the list only looks forward.
                  const upcomingEntries = entries
                    .filter((entry) => entry.window.start > nowMinutes)
                    .sort(byShiftThenTime);
                  const displayBreaks = [...activeEntries, ...upcomingEntries];
                  const filterEmpty = filteredBreaks.length === 0;

                  const renderBreakCard = ({ breakItem, window }, options = {}) => {
                    const { isActiveList = false, index = 0 } = options;
                    const endTime = calculateEndTime(breakItem.break_start_time, breakItem.break_duration_minutes);
                    const isMe = breakItem.user_id === user?.id;
                    const isActive = nowMinutes >= window.start && nowMinutes < window.end;
                    const total = Math.max(1, window.duration);
                    const elapsed = Math.max(0, Math.min(total, nowMinutes - window.start));
                    const pct = Math.floor((elapsed / total) * 100);
                    const left = Math.max(0, window.end - nowMinutes);

                    let cardClasses = 'rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-200 backdrop-blur-sm ';
                    if (isActive) {
                      cardClasses += isMe
                        ? 'bg-gradient-to-br from-emerald-50/95 to-teal-50/90 border-emerald-300/50 ring-2 ring-emerald-400/40 ring-offset-2 ring-offset-white'
                        : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300/50';
                    } else {
                      cardClasses += isMe
                        ? 'bg-gradient-to-br from-amber-50/95 to-yellow-50/90 border-amber-200/60 ring-2 ring-amber-300/40 ring-offset-2 ring-offset-white'
                        : 'bg-gradient-to-br from-slate-50 to-orange-50/50 border-slate-200/60';
                    }
                    if (isActiveList && isActive) {
                      cardClasses += ' shadow-md';
                    }

                    return (
                      <motion.div
                        key={breakItem.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25, delay: index * 0.04 }}
                        className={cardClasses}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-medium text-charcoal">
                            {breakItem.profiles?.first_name || 'Unknown'} {breakItem.profiles?.last_name || 'User'}
                            {isMe && <span className="text-slate-500 font-medium"> (You)</span>}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {breakItem.tug_name && (() => {
                              const shift = userShiftMap.get(breakItem.user_id);
                              return shift && isNowWithinShift(shift.start_time, shift.end_time);
                            })() && (
                              <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gradient-to-br from-blue-50 to-cyan-50/80 text-blue-800 border border-blue-200/60 shadow-sm">
                                {breakItem.tug_name}
                              </span>
                            )}
                            <span className="text-sm text-slate-600 whitespace-nowrap">
                              {breakItem.break_start_time?.substring(0, 5) || '??:??'} - {endTime}
                            </span>
                          </div>
                        </div>

                        {isActive && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium bg-emerald-50/80 text-emerald-800 border border-emerald-200/60">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                              On break now
                            </span>
                            <span className="text-emerald-700 font-medium">{left}m left</span>
                          </div>
                        )}

                        {isActive && (
                          <div className="mt-3">
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>Break progress</span>
                              <span className="font-medium">{pct}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/70 rounded-full overflow-hidden border border-emerald-200/50">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 shadow-sm transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  };

                  return (
                    <div className="mb-4 flex flex-col gap-3 pt-3">
                      {breakHeaderControls && (
                        <div className="w-full">
                          {breakHeaderControls}
                        </div>
                      )}
                      {filterEmpty ? (
                        <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/60 backdrop-blur-sm px-4 py-6 text-center text-sm font-medium text-slate-600 shadow-sm">
                          No breaks for this location/shift filter
                        </div>
                      ) : activeEntries.length === 0 && displayBreaks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/60 backdrop-blur-sm px-4 py-6 text-center text-sm font-medium text-slate-600 shadow-sm">
                          No active or upcoming breaks at the moment
                        </div>
                      ) : activeEntries.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/60 backdrop-blur-sm px-4 py-6 text-center text-sm font-medium text-slate-600 shadow-sm">
                          No active breaks at the moment
                        </div>
                      ) : null}
                      <div className="space-y-3">
                        {displayBreaks.map((entry, idx) => renderBreakCard(entry, { isActiveList: true, index: idx }))}
                      </div>
                    </div>
                  );
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