import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

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

export default function ShiftDashboard() {
  const { user } = useAuth();
  const [shift, setShift] = useState(null);
  const [breakInfo, setBreakInfo] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeView, setActiveView] = useState('shift'); // 'shift' or 'breaks'
  const [allShifts, setAllShifts] = useState([]);
  const [allBreaks, setAllBreaks] = useState([]);
  const [teamView, setTeamView] = useState('shifts'); // 'shifts' or 'breaks' - for team schedule
  
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
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch ALL shifts for today (without profiles join)
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('scheduled_rota')
          .select('id, user_id, date, start_time, end_time, location, shift_type')
          .eq('date', today)
          .order('start_time');
          
        if (shiftsError) throw shiftsError;

        // Fetch profiles for all unique user_ids
        if (shiftsData && shiftsData.length > 0) {
          // Filter out null user_ids before fetching
          const userIds = [...new Set(shiftsData.map(s => s.user_id).filter(id => id !== null))];
          console.log('[Team Schedule] User IDs to fetch:', userIds);
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          
          console.log('[Team Schedule] Profiles fetched:', profilesData);
          console.log('[Team Schedule] Profiles error:', profilesError);
          
          // Map profiles to shifts
          const profilesMap = {};
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });
          
          console.log('[Team Schedule] Profiles map:', profilesMap);
          
          // Only include shifts where we found a profile
          const shiftsWithProfiles = shiftsData
            .filter(s => s.user_id && profilesMap[s.user_id])
            .map(s => ({
              ...s,
              profiles: profilesMap[s.user_id]
            }));
          
          console.log('[Team Schedule] Final shifts with profiles:', shiftsWithProfiles.slice(0, 3));
          
          setAllShifts(shiftsWithProfiles);
        } else {
          setAllShifts([]);
        }

        // Fetch ALL breaks for today (without profiles join)
        const { data: breaksData, error: breaksError } = await supabase
          .from('scheduled_breaks')
          .select('id, user_id, break_start_time, break_duration_minutes, break_type, shift_type, date')
          .eq('date', today)
          .order('break_start_time');
          
        if (breaksError) throw breaksError;

        // Fetch profiles for breaks
        if (breaksData && breaksData.length > 0) {
          // Filter out null user_ids before fetching
          const userIds = [...new Set(breaksData.map(b => b.user_id).filter(id => id !== null))];
          console.log('[Team Breaks] User IDs to fetch:', userIds);
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          
          console.log('[Team Breaks] Profiles fetched:', profilesData);
          console.log('[Team Breaks] Profiles error:', profilesError);
          
          const profilesMap = {};
          profilesData?.forEach(p => {
            profilesMap[p.id] = p;
          });
          
          // Only include breaks where we found a profile
          const breaksWithProfiles = breaksData
            .filter(b => b.user_id && profilesMap[b.user_id])
            .map(b => ({
              ...b,
              profiles: profilesMap[b.user_id]
            }));
          
          setAllBreaks(breaksWithProfiles);
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
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

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
  
  const getShiftLabel = (type) => {
    switch(type) {
      case 'morning': return 'Morning Shift';
      case 'day': return 'Day Shift';
      case 'afternoon': return 'Afternoon Shift';
      case 'night': return 'Night Shift';
      default: return type ? type.charAt(0).toUpperCase() + type.slice(1) + ' Shift' : 'Shift';
    }
  };
  
  const getShiftColor = (type) => {
    switch(type) {
      case 'morning': return 'from-amber-600/50 to-orange-700/50 border-amber-500/50';
      case 'day': return 'from-blue-600/50 to-cyan-700/50 border-blue-500/50';
      case 'afternoon': return 'from-purple-600/50 to-pink-700/50 border-purple-500/50';
      case 'night': return 'from-indigo-600/50 to-blue-800/50 border-indigo-500/50';
      default: return 'from-gray-700/50 to-slate-800/50 border-gray-500/50';
    }
  };
  
  const getShiftAccentColor = (type) => {
    switch(type) {
      case 'morning': return 'bg-amber-500';
      case 'day': return 'bg-blue-500';
      case 'afternoon': return 'bg-purple-500';
      case 'night': return 'bg-indigo-500';
      default: return 'bg-gray-500';
    }
  };
  
  const isShiftNow = () => {
    if (!shift) return false;

    const now = currentTime;
    let currentTimeValue = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);

    let startTimeValue = startHour * 60 + startMinute;
    let endTimeValue = endHour * 60 + endMinute;

    // Handle shifts that span midnight
    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60; // extend to next day
      if (currentTimeValue < startTimeValue) {
        currentTimeValue += 24 * 60; // treat current time as next-day time
      }
    }

    return currentTimeValue >= startTimeValue && currentTimeValue <= endTimeValue;
  };
  
  const getShiftProgress = () => {
    if (!shift) return 0;

    const now = currentTime;
    let currentTimeValue = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);

    let startTimeValue = startHour * 60 + startMinute;
    let endTimeValue = endHour * 60 + endMinute;

    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60;
      if (currentTimeValue < startTimeValue) {
        currentTimeValue += 24 * 60;
      }
    }

    if (currentTimeValue < startTimeValue) return 0;
    if (currentTimeValue > endTimeValue) return 100;

    const totalDuration = endTimeValue - startTimeValue;
    const elapsed = currentTimeValue - startTimeValue;
    return Math.floor((elapsed / totalDuration) * 100);
  };
  
  const getTimeRemaining = () => {
    if (!shift) return '';

    const now = currentTime;
    let currentTimeValue = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);

    let startTimeValue = startHour * 60 + startMinute;
    let endTimeValue = endHour * 60 + endMinute;

    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60;
      if (currentTimeValue < startTimeValue) {
        currentTimeValue += 24 * 60;
      }
    }

    if (currentTimeValue > endTimeValue) return 'Shift completed';

    const minutesRemaining = endTimeValue - currentTimeValue;
    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;

    return hoursRemaining > 0 ? `${hoursRemaining}h ${mins}m remaining` : `${mins}m remaining`;
  };
  
  const getNextBreak = () => {
    if (!shift || !shift.breaks || shift.breaks.length === 0) return null;
    
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeValue = currentHour * 60 + currentMinute;
    
    // Find the next break that hasn't ended yet
    for (const breakItem of shift.breaks) {
      const [breakStartHour, breakStartMinute] = breakItem.break_start_time.split(':').map(Number);
      const breakStartValue = breakStartHour * 60 + breakStartMinute;
      const breakEndValue = breakStartValue + breakItem.break_duration_minutes;
      
      if (breakEndValue > currentTimeValue) {
        return {
          ...breakItem,
          isActive: currentTimeValue >= breakStartValue && currentTimeValue < breakEndValue,
          timeToStart: breakStartValue - currentTimeValue,
          progress: currentTimeValue >= breakStartValue ? 
            Math.floor(((currentTimeValue - breakStartValue) / breakItem.break_duration_minutes) * 100) : 0
        };
      }
    }
    
    return null; // No upcoming breaks
  };

  // Toggle between view modes
  const toggleView = () => {
    setActiveView(prev => prev === 'shift' ? 'breaks' : 'shift');
  };

  if (loading) {
    return (
      <div className="w-full mb-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/5 mb-4 animate-pulse"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mb-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-4">
        <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // No personal shift today - show team schedule
  if (!shift) {
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

    return (
      <div className="w-full mb-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <h2 className="text-lg font-bold text-charcoal dark:text-white">Today&apos;s Team Schedule</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">No personal shift - viewing team</p>
            </div>
          </div>
        </div>

        {/* Toggle between Shifts and Breaks */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <button 
              onClick={() => setTeamView('shifts')}
              className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
                teamView === 'shifts' 
                  ? 'text-charcoal dark:text-white bg-gray-100 dark:bg-gray-750 border-b-2 border-black dark:border-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-charcoal dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Team Shifts ({allShifts.length})
            </button>
            <button 
              onClick={() => setTeamView('breaks')}
              className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
                teamView === 'breaks' 
                  ? 'text-charcoal dark:text-white bg-gray-100 dark:bg-gray-750 border-b-2 border-black dark:border-white' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-charcoal dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Team Breaks ({allBreaks.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {teamView === 'shifts' ? (
            allShifts.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-4">No shifts scheduled for today</p>
            ) : (
              <div className="space-y-6">
                {/* Group by location first, then by shift type */}
                {[...new Set(allShifts.map(s => s.location))].sort().map(location => {
                  const locationShifts = allShifts.filter(s => s.location === location);
                  
                  return (
                    <div key={location} className="space-y-3">
                      <h2 className="text-md font-bold text-charcoal dark:text-white border-b-2 border-gray-300 dark:border-gray-600 pb-1">
                        📍 {location} ({locationShifts.length})
                      </h2>
                      
                      {['day', 'afternoon', 'night'].map(shiftType => {
                        const shifts = locationShifts.filter(s => s.shift_type === shiftType);
                        if (shifts.length === 0) return null;
                        
                        const shiftColors = {
                          day: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
                          afternoon: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800',
                          night: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-500 border-blue-300 dark:border-blue-800'
                        };

                        return (
                          <div key={shiftType} className="ml-2">
                            <h3 className={`text-xs font-bold uppercase mb-2 px-2 py-1 rounded inline-block border ${shiftColors[shiftType]}`}>
                              {shiftType} Shift ({shifts.length})
                            </h3>
                            <ul className="space-y-1 mt-2">
                              {shifts.map(s => (
                                <li key={s.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-750 rounded border border-gray-200 dark:border-gray-700">
                                  <span className="font-medium text-charcoal dark:text-white">
                                    {s.profiles?.first_name || 'Unknown'} {s.profiles?.last_name || 'User'}
                                  </span>
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {s.start_time?.substring(0,5) || '??:??'} - {s.end_time?.substring(0,5) || '??:??'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            allBreaks.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-4">No breaks scheduled for today</p>
            ) : (
              <div className="space-y-4">
                {['day', 'afternoon', 'night'].map(shiftType => {
                  const breaks = breaksByType[shiftType];
                  if (breaks.length === 0) return null;
                  
                  const shiftColors = {
                    day: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
                    afternoon: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800',
                    night: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-500 border-blue-300 dark:border-blue-800'
                  };

                  return (
                    <div key={shiftType}>
                      <h3 className={`text-xs font-bold uppercase mb-2 px-2 py-1 rounded inline-block border ${shiftColors[shiftType]}`}>
                        {shiftType} Shift ({breaks.length})
                      </h3>
                      <ul className="space-y-1 mt-2">
                        {breaks.map(b => {
                          const endTime = calculateEndTime(b.break_start_time, b.break_duration_minutes);
                          return (
                            <li key={b.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-750 rounded border border-gray-200 dark:border-gray-700">
                              <span className="font-medium text-charcoal dark:text-white">
                                {b.profiles?.first_name || 'Unknown'} {b.profiles?.last_name || 'User'}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {b.break_start_time?.substring(0,5) || '??:??'} - {endTime}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  const shiftActive = isShiftNow();
  const shiftProgress = getShiftProgress();
  const nextBreak = getNextBreak();

  // Render the main widget
  return (
    <div className={`w-full mb-4 bg-white dark:bg-gray-800 rounded-lg border overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 border-gray-200 dark:border-gray-700`}>
      {/* Top accent bar */}
      <div className={`h-1 ${getShiftAccentColor(shift.shift_type)}`}></div>
      
      {/* Header with tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <button 
            onClick={() => setActiveView('shift')}
            className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
              activeView === 'shift' 
                ? 'text-charcoal dark:text-white bg-gray-100 dark:bg-gray-750 border-b-2 border-black dark:border-white' 
                : 'text-gray-600 dark:text-gray-400 hover:text-charcoal dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Today&apos;s Shift
            </div>
          </button>
          
          <button 
            onClick={() => setActiveView('breaks')}
            className={`flex-1 py-2.5 px-4 text-center font-medium transition-all ${
              activeView === 'breaks' 
                ? 'text-charcoal dark:text-white bg-gray-100 dark:bg-gray-750 border-b-2 border-black dark:border-white' 
                : 'text-gray-600 dark:text-gray-400 hover:text-charcoal dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Breaks Schedule
            </div>
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="p-3">
        {/* Shift info view */}
        <div 
          className={`transition-all duration-500 ease-in-out ${
            activeView === 'shift' 
              ? 'opacity-100' 
              : 'opacity-0 max-h-0 overflow-hidden absolute'
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center mb-1">
                <h2 className="text-lg font-bold text-charcoal dark:text-white">
                  {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                </h2>
                {shiftActive && (
                  <span className="ml-2 bg-green-500 text-xs font-semibold text-white px-2 py-0.5 rounded-full animate-pulse-green shadow-sm shadow-green-600/50">
                    ACTIVE
                  </span>
                )}
              </div>
              
              <div className="mt-1">
                <p className="text-white/90 flex items-center text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {shift.location || 'Unknown location'}
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">
                  {getShiftLabel(shift.shift_type || 'standard')}
                </p>
              </div>
            </div>
            
            {shiftActive && (
              <div className="bg-gray-100 dark:bg-gray-750 px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 shadow-inner">
                <span className="text-gray-600 dark:text-gray-400 text-xs block">Status</span>
                <span className="text-white font-medium text-sm block">{getTimeRemaining()}</span>
              </div>
            )}
          </div>
          
          {/* Progress bar for active shift */}
          {shiftActive && (
            <div className="mt-3 mb-2">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Progress</span>
                <span>{shiftProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getShiftAccentColor(shift.shift_type)} rounded-full transition-all duration-1000 ease-out`}
                  style={{ width: `${shiftProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {shiftActive && nextBreak && (
            <div className={`mt-3 p-2 rounded-md ${
              nextBreak.isActive 
                ? 'bg-green-800/40 border border-green-500/50 shadow-inner' 
                : 'bg-blue-900/40 border border-blue-500/50'
            } transition-all duration-300`}>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-white/90 text-xs font-medium flex items-center">
                    {nextBreak.isActive ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Current Break
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Next Break
                      </>
                    )}
                  </span>
                  <p className="text-white font-medium text-sm">
                    {formatTime(nextBreak.break_start_time)} ({nextBreak.break_duration_minutes} min)
                  </p>
                </div>
                {!nextBreak.isActive && (
                  <div className="text-right">
                    <span className="text-white/70 text-xs block">Starting in</span>
                    <span className="text-white font-medium text-sm">
                      {nextBreak.timeToStart > 60 
                        ? `${Math.floor(nextBreak.timeToStart / 60)}h ${nextBreak.timeToStart % 60}m` 
                        : `${nextBreak.timeToStart}m`}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Break progress bar for active breaks */}
              {nextBreak.isActive && (
                <div className="mt-1.5">
                  <div className="flex justify-between text-xs text-white/70 mb-0.5">
                    <span>Break time</span>
                    <span>{nextBreak.progress}%</span>
                  </div>
                  <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${nextBreak.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Breaks schedule view */}
        <div 
          className={`transition-all duration-500 ease-in-out ${
            activeView === 'breaks' 
              ? 'opacity-100' 
              : 'opacity-0 max-h-0 overflow-hidden absolute'
          }`}
        >
          {!breakInfo || breakInfo === 'loading' ? (
            <div className="text-center py-3">
              <span className="italic text-gray-600 dark:text-gray-400">Loading break info...</span>
            </div>
          ) : breakInfo === 'none' ? (
            <div className="text-center py-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 text-amber-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-yellow-100 font-medium">No breaks scheduled for today.</span>
            </div>
          ) : breakInfo === 'error' ? (
            <div className="text-center py-3">
              <span className="text-red-300">Could not load break information.</span>
            </div>
          ) : (
            <div>
              {/* My break summary at the top */}
              {breakInfo.myBreaks.length > 0 && (
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-white mb-1">Your Breaks Today</h3>
                  <div className="bg-blue-900/30 p-1.5 rounded-md">
                    {breakInfo.myBreaks.map((breakItem, index) => (
                      <div key={`my-break-${index}`} className="flex justify-between text-sm mb-0.5 last:mb-0">
                        <span className="font-medium text-white">
                          {formatBreakTime(breakItem)}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {breakItem.break_duration_minutes} min
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Team breaks section - simplified list view */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Breaks Schedule - {format(new Date(), 'dd/MM/yyyy')}</h3>
                <div className="bg-blue-900/70 rounded-md overflow-hidden max-h-[200px] overflow-y-auto">
                  {/* Flattened team breaks - simple list display */}
                  {breakInfo.teamBreaks
                    .sort((a, b) => {
                      // Sort for night shift - times starting from 18:00 first, then times after midnight last
                      const timeA = a.break_start_time.substring(0, 5);
                      const timeB = b.break_start_time.substring(0, 5);
                      
                      const [hourA] = timeA.split(':').map(Number);
                      const [hourB] = timeB.split(':').map(Number);
                      
                      // Convert to night shift order: 18-23 first, then 0-6
                      const nightOrderA = hourA >= 18 ? hourA - 18 : hourA + 6;
                      const nightOrderB = hourB >= 18 ? hourB - 18 : hourB + 6;
                      
                      // Compare by night shift order
                      if (nightOrderA !== nightOrderB) {
                        return nightOrderA - nightOrderB;
                      }
                      
                      // If same hour, compare full time
                      return timeA.localeCompare(timeB);
                    })
                    .map((breakItem, index) => {
                      const isCurrentUser = breakItem.user_id === user?.id;
                      return (
                        <div 
                          key={`team-break-${index}`} 
                          className={`py-1.5 px-3 flex justify-between items-center border-b border-blue-800/50 last:border-b-0 ${
                            isCurrentUser ? 'bg-blue-800/60' : ''
                          }`}
                        >
                          <span className={`font-medium text-xs ${isCurrentUser ? 'text-white' : 'text-white/90'}`}>
                            {breakItem.profiles ? 
                              `${breakItem.profiles.first_name || ''} ${breakItem.profiles.last_name || ''}`.trim() || 'Unknown' : 
                              'Unknown'}
                          </span>
                          <span className="text-right text-white/90 text-xs whitespace-nowrap">
                            {breakItem.break_start_time.substring(0, 5)} ({breakItem.break_duration_minutes}m)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-1.5 bg-gray-100 dark:bg-gray-750 flex justify-between items-center">
        <span className="text-gray-600 dark:text-gray-400 text-xs">{format(new Date(), 'EEEE, MMMM d')}</span>
        <Link to="/my-rota" className="text-blue-500 text-xs hover:text-blue-600 inline-flex items-center transition-colors">
          Full Schedule
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
} 