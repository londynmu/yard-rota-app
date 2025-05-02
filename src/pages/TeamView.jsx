import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  startOfWeek, 
  endOfWeek, 
  addWeeks, 
  subWeeks, 
  format, 
  eachDayOfInterval
} from 'date-fns';

export default function TeamView() {
  // Separate loading states for different operations
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchingAvailability, setFetchingAvailability] = useState(false);
  
  const [teamData, setTeamData] = useState([]);
  const [users, setUsers] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Try to get from localStorage first
    const savedDate = localStorage.getItem('teamview_current_date');
    if (savedDate) {
      return new Date(savedDate);
    }
    
    // Default to current week, starting on Saturday
    const now = new Date();
    // Find previous Saturday (day 6)
    const saturday = startOfWeek(now, { weekStartsOn: 6 });
    return saturday;
  });
  
  // Comment tooltip state
  const [commentTooltip, setCommentTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  
  // Track which row is expanded
  const [expandedRow, setExpandedRow] = useState(null);
  
  // Shift preference filters - get from localStorage if available
  const [showDay, setShowDay] = useState(() => {
    const saved = localStorage.getItem('teamview_filter_day');
    return saved !== null ? saved === 'true' : true;
  });
  
  const [showNight, setShowNight] = useState(() => {
    const saved = localStorage.getItem('teamview_filter_night');
    return saved !== null ? saved === 'true' : true;
  });
  
  const [showAny, setShowAny] = useState(() => {
    const saved = localStorage.getItem('teamview_filter_any');
    return saved !== null ? saved === 'true' : true;
  });
  
  // Save current date to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('teamview_current_date', currentWeekStart.toISOString());
  }, [currentWeekStart]);
  
  // Save filter settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('teamview_filter_day', showDay);
    localStorage.setItem('teamview_filter_night', showNight);
    localStorage.setItem('teamview_filter_any', showAny);
  }, [showDay, showNight, showAny]);
  
  // Toggle row expansion to show full name
  const toggleRowExpansion = (memberId, event) => {
    // Prevent triggering parent handlers
    if (event) {
      event.stopPropagation();
    }
    
    if (expandedRow === memberId) {
      setExpandedRow(null);
    } else {
      setExpandedRow(memberId);
      
      // Auto-collapse after 4 seconds
      setTimeout(() => {
        setExpandedRow(prev => prev === memberId ? null : prev);
      }, 4000);
    }
  };
  
  // Show comment tooltip
  const handleCommentTouch = (event, comment) => {
    event.stopPropagation();
    const touch = event.touches[0];
    
    setCommentTooltip({
      visible: true,
      text: comment,
      x: touch.clientX,
      y: touch.clientY - 80 // Position above finger
    });
    
    // Auto hide after 3 seconds
    setTimeout(() => {
      setCommentTooltip(prev => ({ ...prev, visible: false }));
    }, 3000);
  };
  
  // Hide comment tooltip
  const handleTouchEnd = () => {
    setCommentTooltip(prev => ({ ...prev, visible: false }));
  };
  
  // Computed days for the week - memoized to prevent unnecessary recalculations
  const weekDays = useMemo(() => {
    return eachDayOfInterval({
      start: currentWeekStart,
      end: endOfWeek(currentWeekStart, { weekStartsOn: 6 })
    });
  }, [currentWeekStart]);
  
  // Memoize weekLabel to prevent unnecessary recalculations
  const weekLabel = useMemo(() => {
    return `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`;
  }, [weekDays]);
  
  // Filter team data based on shift preference selections
  const filteredTeamData = useMemo(() => {
    return teamData.filter(member => {
      const shift = member.shift?.toLowerCase() || 'day';
      if (shift === 'day' && showDay) return true;
      if (shift === 'night' && showNight) return true;
      if ((shift === 'any' || shift === 'both' || shift === 'afternoon') && showAny) return true;
      return false;
    });
  }, [teamData, showDay, showNight, showAny]);
  
  // Fetch all users from Supabase
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        // Fetch all users from the profiles table
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .limit(100);
        
        if (error) {
          console.error('Error fetching profiles:', error);
          setErrorMsg(`Fetch error: ${error.message}`);
          throw error;
        }
        
        if (data && data.length > 0) {
          // For users with no name, use their email as name
          const formattedUsers = data.map(user => ({
            id: user.id,
            firstName: user.first_name || (user.email ? user.email.split('@')[0] : 'User'),
            lastName: user.last_name || '',
            shift: user.shift_preference || 'day',
            avatar: user.avatar_url,
            email: user.email
          }));
          
          setUsers(formattedUsers);
        } else {
          // No users found in database
          setUsers([]);
          setErrorMsg('No users found in the database. Please add users to your Supabase profiles table.');
        }
      } catch (error) {
        console.error('Error in fetchAllUsers:', error);
        setErrorMsg(`Error: ${error.message}`);
        setUsers([]);
      } finally {
        setInitialLoading(false);
      }
    };
    
    fetchAllUsers();
  }, []);
  
  // Format name to show full name on desktop and shortened on mobile
  const formatName = (firstName, lastName, isMobile = false) => {
    if (!lastName) return firstName;
    
    if (isMobile) {
      // Handle multiple first names for mobile view
      const firstNames = firstName.split(' ');
      const initials = firstNames.map(name => `${name.charAt(0)}.`).join('');
      return `${initials} ${lastName}`;
    }
    
    // Desktop view shows full name
    return `${firstName} ${lastName}`;
  };
  
  // Fetch availability data for the current week
  useEffect(() => {
    const fetchTeamAvailability = async () => {
      if (!users.length) {
        return;
      }
      
      setFetchingAvailability(true);
      
      try {
        const startDate = format(currentWeekStart, 'yyyy-MM-dd');
        const endDate = format(weekDays[6], 'yyyy-MM-dd');
        
        const { data, error } = await supabase
          .from('availability')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate);
        
        if (error) {
          console.error('Error fetching availability:', error);
          throw error;
        }
        
        // Transform data for display
        const availabilityMap = {};
        
        if (data) {
          data.forEach(item => {
            if (!availabilityMap[item.user_id]) {
              availabilityMap[item.user_id] = {};
            }
            availabilityMap[item.user_id][item.date] = {
              status: item.status,
              comment: item.comment
            };
          });
        }
        
        // Combine user data with availability - this should include ALL users
        const combinedData = users.map(user => {
          return {
            ...user,
            availability: weekDays.map(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              return {
                date: day,
                dateString: dateKey,
                status: availabilityMap[user.id]?.[dateKey]?.status || 'unknown',
                comment: availabilityMap[user.id]?.[dateKey]?.comment || ''
              };
            })
          };
        });
        
        setTeamData(combinedData);
      } catch (error) {
        console.error('Error in fetchTeamAvailability:', error);
      } finally {
        setFetchingAvailability(false);
      }
    };
    
    fetchTeamAvailability();
  }, [currentWeekStart, users, weekDays]);
  
  // Handle week navigation
  const handlePreviousWeek = () => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
  };
  
  const handleNextWeek = () => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  };
  
  // Render availability cell
  const renderAvailabilityCell = (availabilityData) => {
    if (!availabilityData || availabilityData.status === 'unknown') {
      return (
        <div className="h-8 sm:h-12 w-full flex items-center justify-center bg-black/30 backdrop-blur-lg rounded-md border border-white/10">
          <span className="text-gray-400 text-base sm:text-xl font-bold">?</span>
        </div>
      );
    }
    
    let bgColor = 'bg-black/30';
    let icon = '';
    let statusLabel = '';
    
    switch (availabilityData.status) {
      case 'available':
        bgColor = 'bg-green-500/30 hover:bg-green-500/40';
        icon = '✓';
        statusLabel = 'Available';
        break;
      case 'unavailable':
        bgColor = 'bg-red-500/30 hover:bg-red-500/40';
        icon = '✗';
        statusLabel = 'Unavailable';
        break;
      case 'holiday':
        bgColor = 'bg-blue-500/30 hover:bg-blue-500/40';
        icon = 'H';
        statusLabel = 'Holiday';
        break;
      default:
        bgColor = 'bg-black/30';
        icon = '?';
        statusLabel = 'Unknown';
    }
    
    const hasComment = availabilityData.comment && availabilityData.comment.trim().length > 0;
    
    return (
      <div 
        className={`h-8 sm:h-12 w-full flex items-center justify-center ${bgColor} backdrop-blur-md rounded-md relative border border-white/10 shadow-md`} 
        title={hasComment ? `${statusLabel}: ${availabilityData.comment}` : statusLabel}
      >
        <span className={`text-lg sm:text-2xl font-bold ${availabilityData.status === 'available' ? 'text-green-500' : availabilityData.status === 'unavailable' ? 'text-red-500' : availabilityData.status === 'holiday' ? 'text-blue-500' : 'text-gray-400'}`}>
          {icon}
        </span>
        {hasComment && (
          <span 
            className="absolute bottom-0.5 right-0.5 text-yellow-300 text-2xs sm:text-xs z-10"
            onTouchStart={(e) => handleCommentTouch(e, availabilityData.comment)}
            onTouchEnd={handleTouchEnd}
          >
            📝
          </span>
        )}
      </div>
    );
  };
  
  // Add CSS class for fade-in transition
  const fadeIn = !initialLoading ? "opacity-100 transition-opacity duration-300" : "opacity-0";
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-4 sm:py-8 px-0 sm:px-6 md:px-8 lg:px-12 overflow-hidden relative text-white flex justify-center">
      <div className="w-full sm:max-w-6xl relative">
        {/* Comment tooltip popup */}
        {commentTooltip.visible && (
          <div 
            className="fixed bg-black/90 backdrop-blur-xl px-3 py-2 rounded-lg border border-white/30 shadow-lg text-white text-xs z-50 max-w-[280px]"
            style={{
              left: `${commentTooltip.x}px`,
              top: `${commentTooltip.y}px`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            {commentTooltip.text}
          </div>
        )}
        
        {/* Main content with fade-in effect */}
        <div className={`${fadeIn} bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-xl p-2 sm:p-6`}>
          {/* Header with date display and navigation arrows */}
          <div className="mb-4 sm:mb-6 p-2 sm:p-4 bg-black/50 backdrop-blur-xl rounded-xl border border-white/20 shadow-lg">
            {/* Week navigation with arrows similar to CalendarPage */}
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <button
                onClick={handlePreviousWeek}
                className="p-1 sm:p-2 rounded-full hover:bg-white/20 transition-all text-white hover:scale-105 active:scale-95"
                aria-label="Previous week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h2 className="text-lg sm:text-xl font-bold text-white drop-shadow-md px-2 sm:px-4 py-1 sm:py-2 bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur-sm rounded-lg border border-white/20">
                {weekLabel}
              </h2>
              
              <button
                onClick={handleNextWeek}
                className="p-1 sm:p-2 rounded-full hover:bg-white/20 transition-all text-white hover:scale-105 active:scale-95"
                aria-label="Next week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          
            {/* Shift preference filters */}
            <div className="flex flex-wrap gap-1 sm:gap-2 justify-center">
              <label className="px-2 sm:px-3 py-1 sm:py-2 rounded-xl border border-white/20 cursor-pointer transition-all bg-gradient-to-r from-blue-900/60 to-purple-900/60 backdrop-blur-xl shadow-lg flex items-center gap-1 sm:gap-2">
                <input 
                  type="checkbox" 
                  checked={showDay}
                  onChange={() => setShowDay(!showDay)}
                  className="sr-only"
                />
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-md flex items-center justify-center text-xs ${showDay ? 'bg-white/30 text-white' : 'bg-black/30'}`}>
                  {showDay && '✓'}
              </div>
                <span className="text-sm sm:text-base text-white font-medium">Day</span>
              </label>
              
              <label className="px-2 sm:px-3 py-1 sm:py-2 rounded-xl border border-white/20 cursor-pointer transition-all bg-gradient-to-r from-blue-900/60 to-purple-900/60 backdrop-blur-xl shadow-lg flex items-center gap-1 sm:gap-2">
                <input 
                  type="checkbox" 
                  checked={showNight}
                  onChange={() => setShowNight(!showNight)}
                  className="sr-only"
                />
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-md flex items-center justify-center text-xs ${showNight ? 'bg-white/30 text-white' : 'bg-black/30'}`}>
                  {showNight && '✓'}
              </div>
                <span className="text-sm sm:text-base text-white font-medium">Night</span>
              </label>
              
              <label className="px-2 sm:px-3 py-1 sm:py-2 rounded-xl border border-white/20 cursor-pointer transition-all bg-gradient-to-r from-blue-900/60 to-purple-900/60 backdrop-blur-xl shadow-lg flex items-center gap-1 sm:gap-2">
                <input 
                  type="checkbox" 
                  checked={showAny}
                  onChange={() => setShowAny(!showAny)}
                  className="sr-only"
                />
                <div className={`w-3 h-3 sm:w-4 sm:h-4 rounded-md flex items-center justify-center text-xs ${showAny ? 'bg-white/30 text-white' : 'bg-black/30'}`}>
                  {showAny && '✓'}
                </div>
                <span className="text-sm sm:text-base text-white font-medium">Afternoon</span>
              </label>
          </div>
        </div>

        {/* Display error messages if any */}
        {errorMsg && (
          <div className="mb-4 sm:mb-6 text-red-100 text-xs sm:text-sm bg-red-500/30 backdrop-blur-xl p-3 sm:p-4 rounded-md border border-red-400/40 shadow-md">
            {errorMsg}
          </div>
        )}
        
        {/* Loading state - only show during initial loading */}
        {initialLoading && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex justify-center items-center z-30">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-14 sm:w-14 border-t-2 border-b-2 border-white/90"></div>
          </div>
        )}
        
        {/* Availability loading state overlay - only during week changes */}
        {!initialLoading && fetchingAvailability && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex justify-center items-center z-30 transition-opacity duration-200">
            <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-t-2 border-b-2 border-white/90"></div>
          </div>
        )}
        
        {/* No data state */}
        {!initialLoading && filteredTeamData.length === 0 && users.length > 0 && (
          <div className="text-center py-6 sm:py-10 bg-black/50 backdrop-blur-xl rounded-xl border border-white/20 text-white shadow-xl">
              <p className="text-base sm:text-lg font-medium">No team members found with selected shift preferences</p>
          </div>
        )}
        
        {/* Empty database state */}
        {!initialLoading && users.length === 0 && (
          <div className="text-center py-6 sm:py-10 bg-yellow-500/20 backdrop-blur-xl p-4 sm:p-6 rounded-xl border border-yellow-400/30 shadow-xl">
            <h3 className="text-base sm:text-lg font-bold text-yellow-50 mb-2 drop-shadow-md">No Users Found</h3>
            <p className="text-sm sm:text-base text-yellow-50/90">
              There are no users in the database. Please add users to your Supabase profiles table.
            </p>
          </div>
        )}
        
        {/* Team availability table */}
        {!initialLoading && filteredTeamData.length > 0 && (
          <div className="overflow-x-auto bg-black/50 backdrop-blur-xl rounded-xl border border-white/20 shadow-2xl">
            <table className="min-w-full rounded-xl overflow-hidden">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-blue-900/70 to-purple-900/70 backdrop-blur-xl">
                    <th className="py-1 sm:py-4 px-0.5 sm:px-4 border-b border-white/20 text-center w-18 sm:w-40 text-white font-bold text-xs sm:text-base">User</th>
                  {weekDays.map(day => (
                    <th 
                      key={format(day, 'yyyy-MM-dd')} 
                        className="py-1 sm:py-4 px-0.5 sm:px-2 border-b border-white/20 text-center text-white"
                    >
                      <div className="font-bold text-2xs sm:text-base">{format(day, 'EEE')}</div>
                        <div className="text-3xs sm:text-sm text-white/90">{format(day, 'MMM d')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredTeamData.map(member => (
                  <tr 
                    key={member.id} 
                    className={`hover:bg-white/10 transition-colors ${expandedRow === member.id ? 'bg-white/10' : ''}`}
                  >
                      <td className="py-0.5 sm:py-3 px-1 sm:px-4 border-b border-white/10 text-white text-center">
                      <div className="flex flex-col sm:flex-row items-center justify-center">
                        {member.avatar ? (
                          <img 
                            src={member.avatar} 
                            alt={formatName(member.firstName, member.lastName)} 
                              className="hidden sm:block w-6 h-6 sm:w-9 sm:h-9 rounded-full mb-0.5 sm:mb-0 sm:mr-2 flex-shrink-0 border border-white/30 sm:border-2 shadow-md"
                          />
                        ) : (
                            <div className="hidden sm:block w-6 h-6 sm:w-9 sm:h-9 rounded-full bg-white/20 mb-0.5 sm:mb-0 sm:mr-2 flex items-center justify-center flex-shrink-0 backdrop-blur-xl text-white border border-white/30 sm:border-2 shadow-md">
                            {member.firstName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 w-full text-center">
                            {/* Mobile view: First name + first letter of last name, expands on touch */}
                            <div 
                              className="sm:hidden flex flex-col items-center justify-center" 
                              onTouchStart={(e) => toggleRowExpansion(member.id, e)}
                            >
                              <span className="font-medium text-2xs truncate">
                                {member.firstName} {member.lastName.charAt(0)}.
                              </span>
                              {expandedRow === member.id && (
                                <span className="font-medium text-2xs text-white/80 mt-0.5">
                                  {member.lastName}
                                </span>
                              )}
                            </div>
                            {/* Desktop view remains unchanged */}
                            <div className="hidden sm:block font-medium truncate hover:whitespace-normal hover:text-clip text-base" title={`${member.firstName} ${member.lastName}`}>
                              {formatName(member.firstName, member.lastName)}
                            </div>
                          <div className="hidden sm:block text-xs text-white/80 capitalize">{member.shift}</div>
                        </div>
                      </div>
                    </td>
                    {member.availability.map(day => (
                      <td 
                        key={day.dateString} 
                          className="py-0.5 px-0.5 border-b border-white/10"
                      >
                        {renderAvailabilityCell(day)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Legend */}
        {!initialLoading && filteredTeamData.length > 0 && (
            <div className="mt-4 sm:mt-6 p-3 sm:p-5 bg-black/40 backdrop-blur-xl rounded-xl border border-white/20 shadow-xl">
              <h3 className="font-bold mb-2 sm:mb-4 text-sm sm:text-base text-white drop-shadow-sm">Legend:</h3>
              <div className="flex flex-wrap gap-2 sm:gap-5">
              <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-green-500/30 border border-white/20 mr-1 sm:mr-2 flex items-center justify-center">
                    <span className="text-green-500 text-lg sm:text-xl font-bold">✓</span>
                  </div>
                  <span className="text-xs sm:text-base text-white">Available</span>
              </div>
              <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-red-500/30 border border-white/20 mr-1 sm:mr-2 flex items-center justify-center">
                    <span className="text-red-500 text-lg sm:text-xl font-bold">✗</span>
                  </div>
                  <span className="text-xs sm:text-base text-white">Unavailable</span>
              </div>
              <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-blue-500/30 border border-white/20 mr-1 sm:mr-2 flex items-center justify-center">
                    <span className="text-blue-500 text-lg sm:text-xl font-bold">H</span>
                  </div>
                  <span className="text-xs sm:text-base text-white">Holiday</span>
              </div>
              <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-black/30 border border-white/20 mr-1 sm:mr-2 flex items-center justify-center">
                    <span className="text-gray-400 text-lg sm:text-xl font-bold">?</span>
                  </div>
                  <span className="text-xs sm:text-base text-white">No data</span>
              </div>
              <div className="flex items-center">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-green-500/30 border border-white/20 mr-1 sm:mr-2 flex items-center justify-center relative">
                    <span className="text-green-500 text-lg sm:text-xl font-bold">✓</span>
                    <span className="absolute bottom-0 right-0 text-yellow-300 text-xs">📝</span>
                  </div>
                  <span className="text-xs sm:text-base text-white">Has comment</span>
                </div>
              </div>
            </div>
          )}
          </div>
      </div>
    </div>
  );
} 