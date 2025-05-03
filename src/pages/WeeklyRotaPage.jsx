import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, addDays, subDays, isSameDay, getWeek } from 'date-fns';
import PropTypes from 'prop-types';

// Utility to get week start on Saturday
const getWeekStart = (date) => {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : (day + 1); // number of days since last Saturday
  return subDays(date, diff);
};

const WeeklyRotaPage = () => {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [dailyRotaData, setDailyRotaData] = useState({}); // Stores ALL rota entries for each day
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDayMobile, setExpandedDayMobile] = useState(null); // Track expanded day on mobile

  useEffect(() => {
    const fetchFullRota = async () => {
      if (!user) return;
      setLoading(true);
      setError(null); // Reset error on new fetch
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

        // 3) Attach profile data to each rota entry under the same key used previously (profiles)
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
        // Display the actual error message from Supabase
        setError(`Failed to load rota: ${e.message || 'Unknown error. Check permissions or connection.'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFullRota();
  }, [weekStart, user]); // Re-fetch when weekStart changes

  const goPrevWeek = () => {
    setWeekStart((d) => subDays(d, 7));
  };
  const goNextWeek = () => {
    setWeekStart((d) => addDays(d, 7));
  };

  // Helper: show only HH:MM from a time string like "HH:MM:SS"
  const fmtTime = (t) => (t ? t.slice(0, 5) : '');

  // Component to render the details for an expanded day
  const DayDetails = ({ dateStr }) => {
    // Filtrujemy od razu sloty bez profili - dla spójności z liczbą wyświetlaną w nagłówku
    const daySlots = (dailyRotaData[dateStr] || []).filter(slot => slot.profiles);
    
    const slotsByShiftType = {
      day: daySlots.filter(s => s.shift_type === 'day'),
      afternoon: daySlots.filter(s => s.shift_type === 'afternoon'),
      night: daySlots.filter(s => s.shift_type === 'night')
    };

    return (
      <div className="p-2 space-y-2 bg-black/30 rounded-b-lg border-t border-white/10 overflow-y-auto">
        {Object.entries(slotsByShiftType).map(([shiftType, slots]) => (
          <div key={shiftType} className="mb-1">
            <h4 className={`
              text-sm font-semibold uppercase pb-1 mb-2 
              ${shiftType === 'day' ? 'text-yellow-300 border-b-2 border-yellow-500/70 bg-yellow-900/30' : 
                shiftType === 'afternoon' ? 'text-orange-300 border-b-2 border-orange-500/70 bg-orange-900/30' : 
                'text-blue-300 border-b-2 border-blue-500/70 bg-blue-900/30'}
              px-2 py-1 rounded-t-md
            `}>
              {shiftType.toUpperCase()} SHIFT
            </h4>
            {slots.length === 0 ? (
              <p className="text-xs text-white/50 italic">No staff scheduled</p>
            ) : (
              <ul className="space-y-1">
                {slots
                  .map((slot) => (
                  <li 
                    key={slot.id}
                    className={`flex items-center gap-1 text-sm rounded-md py-0.5 px-1 transition-colors ${slot.user_id === user?.id ? 'bg-yellow-400/20 border border-yellow-300/40' : ''}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-purple-500/40 border border-purple-300/30 flex-shrink-0 flex items-center justify-center text-xs">
                       {/* Display initials or placeholder */}
                      {(slot.profiles?.first_name?.[0] || '') + (slot.profiles?.last_name?.[0] || '?')}
                    </div>
                    <div className="flex-grow overflow-hidden">
                      <span className={`font-bold truncate block text-xs ${slot.user_id === user?.id ? 'text-yellow-300' : 'text-blue-300'}`}>
                        {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                        {slot.user_id === user?.id && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 bg-yellow-500/20 text-yellow-300 rounded uppercase align-super">You</span>
                        )}
                      </span>
                      <span className="text-[10px] text-white/70 block">
                        {slot.location}: {fmtTime(slot.start_time)} - {fmtTime(slot.end_time)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  };

  DayDetails.propTypes = {
    dateStr: PropTypes.string.isRequired,
  };

  const renderDayCard = (dateObj) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const daySlots = dailyRotaData[dateStr] || [];
    // Filtruj sloty tak samo jak w komponencie DayDetails, aby liczba była spójna z wyświetlanymi slotami
    const visibleSlots = daySlots.filter(slot => slot.profiles);
    // Sprawdź czy zalogowany użytkownik ma zmianę w tym dniu
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

    return (
      <div
        key={dateStr}
        className={`
          flex flex-col
          bg-black/60 
          border border-white/20 
          rounded-md 
          backdrop-blur-md 
          shadow-lg 
          overflow-hidden // Keep this to prevent internal scrollbar bleed
          ${isToday ? 'ring-1 ring-blue-400' : ''} 
          ${isWeekend ? 'bg-gradient-to-br from-purple-900/40 to-black/60' : ''}
          ${userHasShift ? 'border-l-4 border-l-yellow-400' : ''}
        `}
      >
        {/* Header - ADDED onClick handler and expand icon for mobile */}
        <div 
          className={`p-1 border-b border-white/10 bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-transparent cursor-pointer md:cursor-default ${userHasShift ? 'from-yellow-700/30 via-blue-900/40' : ''}`}
          onClick={handleHeaderClick} // Attach click handler
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <h3 className="text-base font-semibold text-white flex items-center gap-1">
                <span>{format(dateObj, 'EEE')}</span>
                <span className="text-white/70 ml-1">{format(dateObj, 'dd/MM')}</span>
                {isToday && (
                  <span className="text-[10px] bg-blue-500 text-white px-1 py-0.5 rounded-full ml-1 uppercase font-bold">Today</span>
                )}
              </h3>
            </div>
            
            {/* Przeniesione na prawą stronę */}
            <div className="flex items-center space-x-2">
              {visibleSlots.length > 0 && (
                <div className={`flex items-center text-xs ${userHasShift ? 'bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded-full' : 'text-white/70'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" 
                    className={`h-4 w-4 mr-1 ${userHasShift ? 'text-black' : 'text-green-300'}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    {visibleSlots.length}
                  </span>
                </div>
              )}
              
              {/* Expand/Collapse Icon - Mobile only */}
              <div className="md:hidden">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 text-white/60 transition-transform duration-200 ${isMobileExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile: Conditionally visible Details Area */}
        <div className={`${isMobileExpanded ? 'block' : 'hidden'} md:hidden`}>
           <DayDetails dateStr={dateStr} />
        </div>

        {/* Desktop: Always visible Details Area */}
        <div className="hidden md:block">
           <DayDetails dateStr={dateStr} />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-blue-900 to-green-500">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-blue-900 to-green-500 text-white">
        <div className="bg-red-900/40 backdrop-blur-xl p-4 rounded-lg border border-red-500/30 max-w-md">
          <h3 className="text-lg font-semibold mb-2 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Error Loading Rota
          </h3>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-700/40 hover:bg-red-700/60 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-4 px-1 sm:px-2 text-white flex flex-col">
      {/* Header - adjusted instruction text */}
      <div className="w-full">
        <div className="flex justify-center items-center mb-4">
          <div className="flex items-center bg-black/70 border-2 border-white/20 rounded-full shadow-lg overflow-hidden">
            <button
              onClick={goPrevWeek}
              className="h-12 w-12 flex items-center justify-center bg-black/30 hover:bg-white/10 transition-colors border-r border-white/10 rounded-l-full focus:outline-none"
              aria-label="Previous week"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-8 py-2 text-xl font-bold text-white select-none">
              Week {getWeek(weekStart)}
            </span>
            <button
              onClick={goNextWeek}
              className="h-12 w-12 flex items-center justify-center bg-black/30 hover:bg-white/10 transition-colors border-l border-white/10 rounded-r-full focus:outline-none"
              aria-label="Next week"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Week days grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 xl:grid-cols-7 gap-1 sm:gap-2 lg:gap-3 w-full">
        {Array.from({ length: 7 }).map((_, idx) => renderDayCard(addDays(weekStart, idx)))}
      </div>
    </div>
  );
};

export default WeeklyRotaPage; 