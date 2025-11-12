import { useState, useEffect } from 'react';
import React from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { format } from 'date-fns';

// Helper to calculate end time
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

export default function MyBreakInfo() {
  const { user } = useAuth();
  const [breakInfo, setBreakInfo] = useState(null); // null | 'loading' | 'none' | { myBreaks: [], teamBreaks: [] } | 'error'
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

  useEffect(() => {
    if (!user || !userProfile) {
      setBreakInfo(null); // No user or profile, no info
      return;
    }

    const fetchBreakInfo = async () => {
      setBreakInfo('loading');
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
  }, [user, userProfile]); // Re-fetch if user or profile changes

  // Format a single break for display
  const formatBreakTime = (breakItem) => {
    const startTime = breakItem.break_start_time.substring(0, 5);
    const endTime = calculateEndTime(startTime, breakItem.break_duration_minutes);
    return `${startTime} - ${endTime}`;
  };

  // Render logic based on breakInfo state
  const renderContent = () => {
    switch (breakInfo) {
      case 'loading':
        return (
          <div className="text-center py-3">
            <span className="italic text-white/80">Loading break info...</span>
          </div>
        );
      case 'none':
        return (
          <div className="text-center py-3">
            <span className="text-yellow-100">No breaks scheduled for today.</span>
          </div>
        );
      case 'error':
        return (
          <div className="text-center py-3">
            <span className="text-red-300">Could not load break information.</span>
          </div>
        );
      case null:
        return null; // Don't render anything if no user or initial state
      default:
        // Check if it's an object with break info (expected case for success)
        if (typeof breakInfo === 'object') {
          return (
            <div className="space-y-4">
              {/* My break summary at the top */}
              {breakInfo.myBreaks.length > 0 ? (
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-white mb-2">Your Breaks Today</h3>
                  <div className="inline-block bg-blue-900/50 px-4 py-2 rounded-md border border-blue-400/30 font-bold text-white">
                    {breakInfo.myBreaks.map((breakItem, index) => (
                      <div key={`my-break-${index}`}>
                        {formatBreakTime(breakItem)} ({breakItem.break_duration_minutes}m)
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              
              {/* Team breaks section */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 text-center">Team Break Schedule</h3>
                <div className="space-y-4">
                  {/* Function to group breaks by user */}
                  {(() => {
                    const shiftsToRender = [];
                    if (userProfile?.shift_preference === 'day' && breakInfo.breaksByShift.day.length > 0) {
                      shiftsToRender.push({ name: 'Day Shift', breaks: breakInfo.breaksByShift.day, className: 'text-yellow-200 border-yellow-500/30' });
                    }
                    if (userProfile?.shift_preference === 'night' && breakInfo.breaksByShift.night.length > 0) {
                      shiftsToRender.push({ name: 'Night Shift', breaks: breakInfo.breaksByShift.night, className: 'text-blue-200 border-blue-500/30' });
                    }
                    // Always show afternoon shift breaks if they exist
                    if (breakInfo.breaksByShift.afternoon.length > 0) {
                      shiftsToRender.push({ name: 'Afternoon Shift', breaks: breakInfo.breaksByShift.afternoon, className: 'text-purple-200 border-purple-500/30' });
                    }

                    return shiftsToRender.map((shift, shiftIndex) => {
                      // Filter out breaks without profile info and group by user
                      const groupedByUser = shift.breaks
                        .filter(b => b.profiles) // Filter out breaks without user profile
                        .reduce((acc, breakItem) => {
                          const userId = breakItem.user_id;
                          if (!acc[userId]) {
                            acc[userId] = { 
                              profile: breakItem.profiles, 
                              breaks: [],
                              isCurrentUser: breakItem.isCurrentUser
                            };
                          }
                          acc[userId].breaks.push({
                            start: breakItem.break_start_time.substring(0, 5),
                            duration: breakItem.break_duration_minutes
                          });
                          // Sort breaks by start time for each user
                          acc[userId].breaks.sort((a, b) => a.start.localeCompare(b.start));
                          return acc;
                        }, {});

                      return (
                        <div key={`${shift.name}-${shiftIndex}`} className="space-y-2">
                          <h4 className={`text-md font-medium ${shift.className} border-b pb-1`}>{shift.name}</h4>
                          <div className="space-y-1">
                            {Object.values(groupedByUser).map((userData, userIndex) => (
                              <div
                                key={userData.profile?.id ? `user-${userData.profile.id}` : `user-index-${shiftIndex}-${userIndex}`}
                                className={`py-1.5 px-2.5 rounded-md flex justify-between items-center flex-wrap ${
                                  userData.isCurrentUser ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800 font-bold' : 'bg-gray-100 dark:bg-gray-700'
                                }`}
                              >
                                <span className="mr-3 font-medium">
                                  {userData.profile ? 
                                    `${userData.profile.first_name || 'Unknown'} ${userData.profile.last_name || 'User'}` : 
                                    'Unknown User'}
                                </span>
                                <span className="text-sm text-white/90 flex-grow text-right">
                                  {userData.breaks.map((b, index) => (
                                    <span key={`break-${shiftIndex}-${userIndex}-${index}`}>
                                      {index > 0 ? ' / ' : ''}
                                      {`${b.start} (${b.duration}m)`}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          );
        }
        return null; // Fallback
    }
  };
  
  const content = renderContent();

  // Only render the container if there is content to display
  if (!content) {
      return null;
  }

  return (
    <div className="w-full mb-4 px-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md transition-all overflow-auto max-h-[40vh]">
      <div className="flex items-center justify-center mb-3">
        {/* Break time icon */}
        <div className="flex-shrink-0 mr-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        {/* Break title */}
        <div className="font-bold text-lg text-charcoal dark:text-white">
          Breaks Schedule - {new Date().toLocaleDateString()}
        </div>
      </div>
      
      {/* Break content */}
      <div>
        {content}
      </div>
    </div>
  );
} 