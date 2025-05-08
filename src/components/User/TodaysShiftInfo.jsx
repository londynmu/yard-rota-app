import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

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
    // Convert 24h to 12h format with am/pm
    if (!timeStr) return '';
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
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
    const currentTimeValue = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    const startTimeValue = startHour * 60 + startMinute;
    const endTimeValue = endHour * 60 + endMinute;
    
    return currentTimeValue >= startTimeValue && currentTimeValue <= endTimeValue;
  };
  
  const getShiftProgress = () => {
    if (!shift) return 0;
    
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeValue = currentHour * 60 + currentMinute;
    
    const [startHour, startMinute] = shift.start_time.split(':').map(Number);
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    
    const startTimeValue = startHour * 60 + startMinute;
    const endTimeValue = endHour * 60 + endMinute;
    
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
    const currentTimeValue = currentHour * 60 + currentMinute;
    
    const [endHour, endMinute] = shift.end_time.split(':').map(Number);
    const endTimeValue = endHour * 60 + endMinute;
    
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
      <div className="w-full mb-4 bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 animate-pulse shadow-lg">
        <div className="h-5 bg-slate-700/50 rounded w-2/5 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-slate-700/50 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700/50 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mb-4 bg-red-900/20 backdrop-blur-sm rounded-lg border border-red-500/30 p-4">
        <p className="text-red-200 text-sm">{error}</p>
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="w-full mb-4 bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50 p-4 shadow-lg hover:shadow-xl transition-all duration-300">
        <div className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-white/80">No shift scheduled for today.</p>
        </div>
        <Link to="/my-rota" className="mt-2 text-blue-400 text-sm inline-flex items-center hover:text-blue-300 transition-colors">
          View your full schedule
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    );
  }

  const shiftActive = isShiftNow();
  const shiftProgress = getShiftProgress();
  const nextBreak = getNextBreak();

  return (
    <div className={`w-full mb-4 bg-gradient-to-r ${getShiftColor(shift.shift_type)} backdrop-blur-xl rounded-lg border overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300`}>
      {/* Top accent bar */}
      <div className={`h-1 ${getShiftAccentColor(shift.shift_type)}`}></div>
      
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-lg font-bold text-white">Today&apos;s Shift</h2>
              {shiftActive && (
                <span className="ml-2 bg-green-500 text-xs font-semibold text-white px-2 py-0.5 rounded-full animate-pulse-green shadow-sm shadow-green-600/50">
                  ACTIVE
                </span>
              )}
            </div>
            
            <div className="mt-3">
              <p className="text-white text-xl font-semibold">
                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
              </p>
              <p className="text-white/90 flex items-center mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {shift.location || 'Unknown location'}
              </p>
              <p className="text-white/80 text-sm mt-1">
                {getShiftLabel(shift.shift_type || 'standard')}
              </p>
            </div>
          </div>
          
          {shiftActive && (
            <div className="bg-black/30 backdrop-blur-sm px-3 py-2 rounded-md border border-white/20 shadow-inner">
              <span className="text-white/80 text-xs block">Status</span>
              <span className="text-white font-medium block">{getTimeRemaining()}</span>
            </div>
          )}
        </div>
        
        {/* Progress bar for active shift */}
        {shiftActive && (
          <div className="mt-4 mb-2">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>Progress</span>
              <span>{shiftProgress}%</span>
            </div>
            <div className="h-2 w-full bg-black/30 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getShiftAccentColor(shift.shift_type)} rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${shiftProgress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {shiftActive && nextBreak && (
          <div className={`mt-4 p-3 rounded-md ${
            nextBreak.isActive 
              ? 'bg-green-800/40 border border-green-500/50 shadow-inner' 
              : 'bg-blue-900/40 border border-blue-500/50'
          } transition-all duration-300`}>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-white/90 text-sm font-medium flex items-center">
                  {nextBreak.isActive ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Current Break
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <span className="text-white/70 text-xs block">Starting in</span>
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
                <div className="flex justify-between text-xs text-white/70 mb-1">
                  <span>Break time</span>
                  <span>{nextBreak.progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-black/30 rounded-full overflow-hidden">
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
      
      <div className="border-t border-white/20 px-4 py-2 bg-black/40 flex justify-between items-center">
        <span className="text-white/80 text-sm">{format(new Date(), 'EEEE, MMMM d')}</span>
        <Link to="/my-rota" className="text-blue-300 text-sm hover:text-blue-200 inline-flex items-center transition-colors">
          Full Schedule
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
} 