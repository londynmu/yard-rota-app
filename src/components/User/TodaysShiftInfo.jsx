import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

// Component to show breaks when user has no shift today
function NoShiftWithBreaksView() {
  const { user } = useAuth();
  const [breakInfo, setBreakInfo] = useState(null); // null = loading, 'none' = no breaks, 'error' = error, object = breaks data
  const [userProfile, setUserProfile] = useState(null);

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

  // Fetch team break info
  useEffect(() => {
    if (!user || !userProfile) {
      setBreakInfo(null);
      return;
    }

    const fetchBreakInfo = async () => {
      const today = new Date().toISOString().split('T')[0];
      console.log('[NoShiftWithBreaksView] Fetching breaks for date:', today);

      try {
        // Get all breaks for today
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
          .not('user_id', 'is', null)
          .order('break_start_time');

        if (allBreaksError) {
          console.error('[NoShiftWithBreaksView] Error fetching breaks:', allBreaksError);
          throw allBreaksError;
        }

        console.log('[NoShiftWithBreaksView] Fetched breaks:', allBreaks);

        if (allBreaks && allBreaks.length > 0) {
          // Group breaks by shift type
          const breaksByShift = {
            day: allBreaks.filter(b => b.shift_type === 'day'),
            afternoon: allBreaks.filter(b => b.shift_type === 'afternoon'),
            night: allBreaks.filter(b => b.shift_type === 'night')
          };
          
          console.log('[NoShiftWithBreaksView] Grouped breaks by shift:', breaksByShift);
          setBreakInfo({ breaksByShift });
        } else {
          console.log('[NoShiftWithBreaksView] No breaks found for today');
          setBreakInfo('none');
        }
      } catch (e) {
        console.error('[NoShiftWithBreaksView] Error fetching break info:', e);
        setBreakInfo('error');
      }
    };

    fetchBreakInfo();
  }, [user, userProfile]);

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const calculateEndTime = (startTime, durationMinutes) => {
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
      return format(endDate, 'HH:mm');
    } catch (e) {
      console.error("Error calculating end time:", e);
      return '??:??';
    }
  };

  const formatBreakTime = (breakItem) => {
    const startTime = breakItem.break_start_time.substring(0, 5);
    const endTime = calculateEndTime(startTime, breakItem.break_duration_minutes);
    return `${startTime} - ${endTime}`;
  };

  return (
    <div className="w-full mb-4 bg-white rounded-lg border border-gray-200 p-4 shadow-md transition-all duration-300">
      <div className="flex items-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-gray-600">No shift scheduled for today.</p>
      </div>

      {/* Show team breaks */}
      {breakInfo === null && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-gray-600">Loading team breaks...</p>
          </div>
        </div>
      )}

      {breakInfo === 'none' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-600">No team breaks scheduled for today.</p>
          </div>
        </div>
      )}

      {breakInfo === 'error' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-600">Error loading team breaks.</p>
          </div>
        </div>
      )}

      {breakInfo && breakInfo !== 'none' && breakInfo !== 'error' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-white font-semibold">Team Breaks Today</h3>
          </div>
          
          <div className="space-y-3">
            {Object.entries(breakInfo.breaksByShift).map(([shiftType, breaks]) => {
              if (breaks.length === 0) return null;
              
              const shiftConfig = {
                day: { name: 'Day Shift', color: 'text-yellow-300', bgColor: 'bg-yellow-900/20' },
                afternoon: { name: 'Afternoon Shift', color: 'text-orange-300', bgColor: 'bg-orange-900/20' },
                night: { name: 'Night Shift', color: 'text-blue-500', bgColor: 'bg-blue-900/20' }
              };
              
              const config = shiftConfig[shiftType];
              
              return (
                <div key={shiftType} className={`${config.bgColor} rounded-lg p-3`}>
                  <h4 className={`${config.color} font-medium mb-2`}>{config.name}</h4>
                  <div className="space-y-1">
                    {breaks.map((breakItem, index) => (
                      <div key={`${shiftType}-${index}`} className="flex justify-between items-center text-sm">
                        <span className="text-white">
                          {breakItem.profiles ? 
                            `${breakItem.profiles.first_name} ${breakItem.profiles.last_name}` : 
                            'Unknown User'}
                        </span>
                        <span className="text-gray-600">
                          {formatBreakTime(breakItem)} ({breakItem.break_duration_minutes}m)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <Link to="/my-rota" className="text-blue-500 text-sm inline-flex items-center hover:text-blue-500 transition-colors">
          View your full schedule
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Link>
        <Link to="/breaks" className="text-green-500 text-sm inline-flex items-center hover:text-green-300 transition-colors">
          View Breaks
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export default function TodaysShiftInfo() {
  const { user } = useAuth();
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

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

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let currentTimeValue = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    let startTimeValue = startHour * 60 + startMinute;
    let endTimeValue = endHour * 60 + endMinute;
    
    // Handle night shift crossing midnight
    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60; // Add 24 hours
      // If current time is less than start time, we're on the next day
      if (currentTimeValue < startTimeValue) {
        currentTimeValue += 24 * 60;
      }
    }
    
    return currentTimeValue >= startTimeValue && currentTimeValue <= endTimeValue;
  };
  
  const getShiftProgress = () => {
    if (!shift) return 0;
    
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let currentTimeValue = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    let startTimeValue = startHour * 60 + startMinute;
    let endTimeValue = endHour * 60 + endMinute;
    
    // Handle night shift crossing midnight
    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60; // Add 24 hours
      // If current time is less than start time, we're on the next day
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
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let currentTimeValue = currentHour * 60 + currentMinute;
    
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    
    let endTimeValue = endHour * 60 + endMinute;
    let startTimeValue = startHour * 60 + startMinute;
    
    // Handle night shift crossing midnight
    if (endTimeValue <= startTimeValue) {
      endTimeValue += 24 * 60; // Add 24 hours
      // If current time is less than start time, we're on the next day
      if (currentTimeValue < startTimeValue) {
        currentTimeValue += 24 * 60;
      }
    }
    
    if (currentTimeValue > endTimeValue) return 'Shift completed';
    
    const minutesRemaining = endTimeValue - currentTimeValue;
    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;
    
    if (hoursRemaining > 0) {
      return `${hoursRemaining}h ${mins}m remaining`;
    } else {
      return `${mins}m remaining`;
    }
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

  if (!shift) {
    return <NoShiftWithBreaksView />;
  }

  const shiftActive = isShiftNow();
  const shiftProgress = getShiftProgress();
  const nextBreak = getNextBreak();

  return (
    <div className="w-full mb-4 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-md">
      {/* Top accent bar */}
      <div className={`h-1 ${getShiftAccentColor(shift.shift_type)}`}></div>
      
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-charcoal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-lg font-bold text-charcoal">Today&apos;s Shift</h2>
              {shiftActive && (
                <span className="ml-2 bg-green-500 text-xs font-semibold text-white px-2 py-0.5 rounded-full shadow-sm">
                  ACTIVE
                </span>
              )}
            </div>
            
            <div className="mt-3">
              <p className="text-charcoal text-xl font-semibold">
                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
              </p>
              <p className="text-gray-600 flex items-center mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {shift.location || 'Unknown location'}
              </p>
              <p className="text-gray-600 text-sm mt-1">
                {getShiftLabel(shift.shift_type || 'standard')}
              </p>
            </div>
          </div>
          
          {shiftActive && (
            <div className="bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
              <span className="text-gray-600 text-xs block">Status</span>
              <span className="text-charcoal font-medium block">{getTimeRemaining()}</span>
            </div>
          )}
        </div>
        
        {/* Progress bar for active shift */}
        {shiftActive && (
          <div className="mt-4 mb-2">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Progress</span>
              <span>{shiftProgress}%</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getShiftAccentColor(shift.shift_type)} rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${shiftProgress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {shiftActive && nextBreak && (
          <div className={`mt-4 p-3 rounded-lg ${
            nextBreak.isActive 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-blue-50 border border-blue-200'
          } transition-all duration-300`}>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-600 text-sm font-medium flex items-center">
                  {nextBreak.isActive ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Current Break
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Next Break
                    </>
                  )}
                </span>
                <p className="text-white font-bold">
                  {formatTime(nextBreak.break_start_time)} ({nextBreak.break_duration_minutes} min)
                </p>
              </div>
              {!nextBreak.isActive && (
                <div className="text-right">
                  <span className="text-gray-600 text-xs block">Starting in</span>
                  <span className="text-white font-medium">
                    {nextBreak.timeToStart > 60 
                      ? `${Math.floor(nextBreak.timeToStart / 60)}h ${nextBreak.timeToStart % 60}m` 
                      : `${nextBreak.timeToStart}m`}
                  </span>
                </div>
              )}
            </div>
            
            {/* Break progress bar for active breaks */}
            {nextBreak.isActive && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Break time</span>
                  <span>{nextBreak.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
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
      
      <div className="border-t border-gray-200 px-4 py-2 bg-gray-100 flex justify-between items-center">
        <span className="text-gray-600 text-sm">{format(new Date(), 'EEEE, MMMM d')}</span>
        <Link to="/my-rota" className="text-blue-500 text-sm hover:text-blue-600 inline-flex items-center transition-colors">
          Full Schedule
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
} 