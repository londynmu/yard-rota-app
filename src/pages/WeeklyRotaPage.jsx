import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, addDays, subDays, isSameDay, getWeek } from 'date-fns';
import PropTypes from 'prop-types';
import ExportRotaButton from '../components/Admin/ExportRotaButton';

// Utility to get week start on Saturday
const getWeekStart = (date) => {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : (day + 1); // number of days since last Saturday
  return subDays(date, diff);
};

const WeeklyRotaPage = () => {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [dailyRotaData, setDailyRotaData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDayMobile, setExpandedDayMobile] = useState(null);

  useEffect(() => {
    const fetchFullRota = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const start = format(weekStart, 'yyyy-MM-dd');
        const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');

        // 1) Fetch ALL rota entries for the week (without join)
        const { data: rotaData, error: rotaError } = await supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            user_id
          `)
          .gte('date', start)
          .lte('date', end);

        if (rotaError) throw rotaError;

        // 2) Fetch profiles for all unique user_ids in the rota
        const userIds = [...new Set(rotaData.map(r => r.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
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

        // 4) Group all fetched slots by date
        const grouped = {};
        rotaWithProfiles.forEach((slot) => {
          if (!grouped[slot.date]) grouped[slot.date] = [];
          grouped[slot.date].push(slot);
        });
        
        // Sort slots within each day by start_time
        for (const date in grouped) {
          grouped[date].sort((a, b) => a.start_time.localeCompare(b.start_time));
        }
        
        setDailyRotaData(grouped);
      } catch (e) {
        console.error('Error fetching full rota:', e);
        setError(`Failed to load rota: ${e.message || 'Unknown error. Check permissions or connection.'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFullRota();
  }, [weekStart, user]);

  const goPrevWeek = () => {
    setWeekStart((d) => subDays(d, 7));
  };
  
  const goNextWeek = () => {
    setWeekStart((d) => addDays(d, 7));
  };

  // Format time from HH:MM:SS to HH:MM
  const fmtTime = (t) => (t ? t.slice(0, 5) : '');

  // Component to render the details for an expanded day
  const DayDetails = ({ dateStr }) => {
    const daySlots = (dailyRotaData[dateStr] || []).filter(slot => slot.profiles);
    
    const slotsByShiftType = {
      day: daySlots.filter(s => s.shift_type === 'day'),
      afternoon: daySlots.filter(s => s.shift_type === 'afternoon'),
      night: daySlots.filter(s => s.shift_type === 'night')
    };

    if (daySlots.length === 0) {
      return (
        <div className="p-4 text-center bg-white/5 rounded-lg">
          <p className="text-white/70 text-sm">No shifts scheduled for this day</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {Object.entries(slotsByShiftType).map(([shiftType, slots]) => {
          if (slots.length === 0) return null;
          
          // Different styling based on shift type
          const shiftConfig = {
            day: {
              title: "DAY SHIFT",
              bgColor: "bg-amber-100",
              textColor: "text-amber-800",
              borderColor: "border-amber-200",
              gradientFrom: "from-amber-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              )
            },
            afternoon: {
              title: "AFTERNOON SHIFT",
              bgColor: "bg-orange-100",
              textColor: "text-orange-800",
              borderColor: "border-orange-200",
              gradientFrom: "from-orange-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )
            },
            night: {
              title: "NIGHT SHIFT",
              bgColor: "bg-blue-100",
              textColor: "text-blue-800",
              borderColor: "border-blue-200",
              gradientFrom: "from-blue-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )
            }
          };

          const config = shiftConfig[shiftType];
          
          return (
            <div key={shiftType} className="rounded-lg overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10">
              <div className={`${config.bgColor} ${config.textColor} px-3 py-2 flex items-center justify-between`}>
                <div className="flex items-center space-x-2">
                  {config.icon}
                  <h4 className="text-sm font-bold uppercase">{config.title}</h4>
                </div>
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{slots.length}</span>
              </div>
              
              <ul className="divide-y divide-white/10">
                {slots.map((slot) => (
                  <li 
                    key={slot.id}
                    className={`p-3 transition-colors ${slot.user_id === user?.id ? 'bg-amber-500/10' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <h5 className={`font-semibold md:text-sm truncate md:normal-case md:overflow-visible ${slot.user_id === user?.id ? 'text-amber-300' : 'text-white'}`}>
                            {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                            {slot.user_id === user?.id && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full uppercase align-middle">You</span>
                            )}
                          </h5>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="inline-flex items-center text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {fmtTime(slot.start_time)} - {fmtTime(slot.end_time)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  DayDetails.propTypes = {
    dateStr: PropTypes.string.isRequired,
  };

  const renderDayCard = (dateObj) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const daySlots = dailyRotaData[dateStr] || [];
    const visibleSlots = daySlots.filter(slot => slot.profiles);
    const userHasShift = visibleSlots.some(slot => slot.user_id === user?.id);
    const isToday = isSameDay(dateObj, new Date());
    const dayName = format(dateObj, 'EEEE');
    const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
    const isMobileExpanded = expandedDayMobile === dateStr;

    // Toggle expansion only on mobile
    const handleHeaderClick = () => {
       if (window.innerWidth < 768) { // md breakpoint
         setExpandedDayMobile(isMobileExpanded ? null : dateStr);
       }
    };

    const shiftCounts = {
      day: visibleSlots.filter(s => s.shift_type === 'day').length,
      afternoon: visibleSlots.filter(s => s.shift_type === 'afternoon').length,
      night: visibleSlots.filter(s => s.shift_type === 'night').length
    };

    return (
      <div
        key={dateStr}
        className={`
          bg-white/5 
          backdrop-blur-sm 
          rounded-xl 
          shadow-xl
          overflow-hidden
          border border-white/10
          transition-all duration-200
          ${isToday ? 'ring-2 ring-blue-400' : ''} 
          ${isWeekend ? 'bg-gradient-to-br from-purple-900/20 to-black/40' : ''}
          ${userHasShift ? 'border-l-2 border-l-amber-400' : ''}
          relative
        `}
      >
        {/* Day Header - Sticky on mobile */}
        <div 
          className={`
            relative
            p-3
            border-b border-white/10 
            bg-gradient-to-r from-gray-800/80 to-gray-900/80
            cursor-pointer
            flex items-center justify-between
            backdrop-blur-md
            sticky top-0 z-10
            ${userHasShift ? 'bg-gradient-to-r from-amber-900/40 to-gray-900/80' : ''}
            ${isToday ? 'from-blue-900/40' : ''}
          `}
          onClick={handleHeaderClick}
        >
          <div className="flex items-center space-x-3">
            <div className={`
              w-11 h-11 
              rounded-full 
              flex-shrink-0 
              flex flex-col items-center justify-center
              bg-gradient-to-br from-white/10 to-white/5
              border border-white/20
              ${isToday ? 'bg-blue-500 border-blue-400 text-white' : 'text-white/90'}
            `}>
              <span className="text-xl font-bold leading-none">{format(dateObj, 'dd')}</span>
              <span className="text-[10px] opacity-70 mt-0.5">{format(dateObj, 'MMM')}</span>
            </div>
            
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {format(dateObj, 'EEEE')}
                {isToday && (
                  <span className="ml-2 text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full uppercase font-bold align-middle">Today</span>
                )}
              </h3>
              
              {visibleSlots.length > 0 ? (
                <div className="flex space-x-2 mt-0.5">
                  {shiftCounts.day > 0 && (
                    <span className="inline-flex items-center text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                      </svg>
                      {shiftCounts.day}
                    </span>
                  )}
                  
                  {shiftCounts.afternoon > 0 && (
                    <span className="inline-flex items-center text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                      </svg>
                      {shiftCounts.afternoon}
                    </span>
                  )}
                  
                  {shiftCounts.night > 0 && (
                    <span className="inline-flex items-center text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                      </svg>
                      {shiftCounts.night}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-white/50">No shifts scheduled</span>
              )}
            </div>
          </div>
          
          {/* Expand/Collapse button - only on mobile */}
          <div className="md:hidden">
            <div className={`
              w-8 h-8 
              flex items-center justify-center 
              rounded-full 
              bg-white/10 
              transition-colors 
              hover:bg-white/20
            `}>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`h-5 w-5 text-white/80 transition-transform duration-200 ${isMobileExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Mobile: Conditionally visible details area with transition */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden md:hidden
          ${isMobileExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-3">
            <DayDetails dateStr={dateStr} />
          </div>
        </div>

        {/* Desktop: Always visible details area */}
        <div className="hidden md:block p-3">
          <DayDetails dateStr={dateStr} />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-blue-900">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4" />
          <p className="text-white text-lg">Loading your schedule...</p>
          <div className="mt-4">
            <ExportRotaButton />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-blue-900 text-white">
        <div className="bg-red-900/40 backdrop-blur-xl p-6 rounded-xl border border-red-500/30 max-w-md">
          <h3 className="text-xl font-semibold mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Error Loading Rota
          </h3>
          <p className="mb-6 text-white/80">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 bg-red-700/40 hover:bg-red-700/60 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
            <div>
              <ExportRotaButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 pb-6">
      {/* Modern Week Navigation Bar */}
      <div className="bg-black/40 sticky top-0 z-20 backdrop-blur-lg border-b border-white/10 shadow-lg">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-3">
              <button
                onClick={goPrevWeek}
                className="h-9 w-9 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors rounded-full focus:outline-none"
                aria-label="Previous week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div className="flex items-center space-x-3">
                <div className="bg-white/5 px-4 py-1.5 rounded-full text-white font-semibold text-base">
                  Week {getWeek(weekStart)}
                </div>
                
                <span className="text-white/70 text-sm hidden sm:inline">
                  {format(weekStart, 'MMMM d')} - {format(addDays(weekStart, 6), 'MMMM d, yyyy')}
                </span>
              </div>
              
              <button
                onClick={goNextWeek}
                className="h-9 w-9 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors rounded-full focus:outline-none"
                aria-label="Next week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Pokazujemy zakres dat na małych ekranach, gdy jest ukryty w głównej nawigacji */}
          <div className="mt-2 text-center sm:hidden">
            <span className="text-white/70 text-sm">
              {format(weekStart, 'MMMM d')} - {format(addDays(weekStart, 6), 'MMMM d, yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="container mx-auto px-3 md:px-4 mt-4 flex flex-wrap gap-2">
        <button 
          onClick={() => (window.location.href = "/admin/add-slot")}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors flex items-center justify-center"
        >
          <span>Add Slot</span>
        </button>
        
        <button
          onClick={() => console.log("Copy Last Week")}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
            <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
          </svg>
          <span>Copy Last Week</span>
        </button>
        
        <ExportRotaButton />
      </div>

      {/* Modern Weekly Grid */}
      <div className="container mx-auto px-3 md:px-4 mt-4">
        <div className="flex justify-end mb-2">
          <ExportRotaButton />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3 md:gap-4">
          {Array.from({ length: 7 }).map((_, idx) => renderDayCard(addDays(weekStart, idx)))}
        </div>
      </div>
    </div>
  );
};

export default WeeklyRotaPage; 