import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isBefore, startOfDay, isToday } from 'date-fns';

function CalendarGrid({ currentDate, dayData, onDayClick, isLoading }) {
  // Get today's date for comparing with past dates
  const today = startOfDay(new Date());

  // Generate days for the calendar
  const generateDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return days;
  };

  // Generate weeks as arrays of days
  const generateCalendarWeeks = () => {
    const days = generateDays();
    const weeks = [];
    let week = [];

    days.forEach((day, i) => {
      if (i % 7 === 0 && week.length) {
        weeks.push(week);
        week = [];
      }
      week.push(day);
    });
    
    if (week.length) weeks.push(week);
    return weeks;
  };

  // Get color based on availability status
  const getColorByStatus = (day) => {
    // Find if we have data for this day
    const dateString = format(day, 'yyyy-MM-dd');
    const dayInfo = dayData?.[dateString];

    if (!dayInfo) return '';

    switch (dayInfo.status) {
      case 'available':
        return 'bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-300/50 text-emerald-800 shadow-sm hover:shadow-md font-semibold';
      case 'unavailable':
        return 'bg-gradient-to-br from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 border border-rose-300/50 text-rose-800 shadow-sm hover:shadow-md font-semibold';
      case 'holiday':
        return 'bg-gradient-to-br from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 border border-blue-300/50 text-blue-800 shadow-sm hover:shadow-md font-semibold';
      default:
        return '';
    }
  };

  const weeks = generateCalendarWeeks();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="w-full animate-pulse">
        {/* Weekday headers skeleton */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekdays.map((day) => (
            <div key={day} className="p-1 sm:p-1 text-center">
              <div className="h-4 bg-slate-200/90 rounded w-12 mx-auto" />
            </div>
          ))}
        </div>

        {/* Calendar grid skeleton */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {Array.from({ length: 35 }).map((_, index) => (
            <div
              key={index}
              className="relative aspect-square bg-white/90 border border-slate-200/70 rounded-xl p-1 sm:p-2"
            >
              <div className="h-5 w-5 bg-slate-200/90 rounded mb-1" />
              <div className="space-y-1">
                <div className="h-2 bg-slate-100 rounded w-3/4" />
                <div className="h-2 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdays.map((day) => (
          <div key={day} className="p-1 sm:p-1 text-center font-bold text-xs sm:text-sm text-charcoal">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1 py-0.5 px-1 sm:py-0.5">
            {week.map((day) => {
              const dateString = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isPastDate = isBefore(day, today);
              const isCurrentDay = isToday(day);
              const colorClass = getColorByStatus(day);
              const dayInfo = dayData?.[dateString];

              // Check if there's a comment
              const hasComment = dayInfo?.comment;

              return (
                <motion.button
                  type="button"
                  key={dateString}
                  onClick={() => !isPastDate && onDayClick(day, dayInfo)}
                  disabled={isPastDate}
                  title={isPastDate ? "Cannot set availability for past dates" : (hasComment ? dayInfo.comment : "")}
                  whileHover={!isPastDate ? { scale: 1.05, y: -2 } : false}
                  whileTap={!isPastDate ? { scale: 0.95 } : false}
                  className={`
                    aspect-square sm:aspect-auto sm:h-10 md:h-10 flex flex-col items-center justify-center transition-all text-center rounded-xl relative
                    ${isCurrentMonth ? 'text-charcoal font-semibold' : 'text-gray-400'} 
                    ${isCurrentDay ? 'ring-2 ring-blue-500 shadow-lg scale-105 z-10 animate-pulse-slow' : ''}
                    ${isPastDate && !colorClass ? 'bg-slate-100/50 cursor-not-allowed text-slate-400' : ''}
                    ${isPastDate && colorClass ? `${colorClass} opacity-50 cursor-not-allowed` : ''}
                    ${!isPastDate && (colorClass || 'hover:bg-slate-50 border border-slate-200/60 hover:shadow-sm')}
                  `}
                >
                  <span className={`text-sm ${isCurrentDay ? 'font-bold text-blue-600' : 'font-medium'}`}>{format(day, 'd')}</span>
                  {hasComment && (
                    <div className="absolute top-1 right-1 text-amber-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 22V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v18l-6-2-6 2z"/>
                      </svg>
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

CalendarGrid.propTypes = {
  currentDate: PropTypes.instanceOf(Date).isRequired,
  dayData: PropTypes.object,
  onDayClick: PropTypes.func.isRequired,
  isLoading: PropTypes.bool
};

CalendarGrid.defaultProps = {
  dayData: {},
  isLoading: false
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(CalendarGrid); 