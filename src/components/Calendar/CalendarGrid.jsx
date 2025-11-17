import React from 'react';
import PropTypes from 'prop-types';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isBefore, startOfDay, isToday } from 'date-fns';

export default function CalendarGrid({ currentDate, dayData, onDayClick, isLoading }) {
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
        return 'bg-green-100 hover:bg-green-200 border-2 border-green-400 text-green-900 font-semibold';
      case 'unavailable':
        return 'bg-red-100 hover:bg-red-200 border-2 border-red-400 text-red-900 font-semibold';
      case 'holiday':
        return 'bg-blue-100 hover:bg-blue-200 border-2 border-blue-400 text-blue-900 font-semibold';
      default:
        return '';
    }
  };

  const weeks = generateCalendarWeeks();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="w-full h-80 sm:h-48 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
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
                <button
                  type="button"
                  key={dateString}
                  onClick={() => !isPastDate && onDayClick(day, dayInfo)}
                  disabled={isPastDate}
                  title={isPastDate ? "Cannot set availability for past dates" : (hasComment ? dayInfo.comment : "")}
                  className={`
                    aspect-square sm:aspect-auto sm:h-10 md:h-10 flex flex-col items-center justify-center transition-all text-center rounded-lg relative
                    ${isCurrentMonth ? 'text-charcoal font-semibold' : 'text-gray-400'} 
                    ${isCurrentDay ? 'ring-2 ring-black shadow-md scale-105 z-10' : ''}
                    ${isPastDate && !colorClass ? 'bg-gray-200/50 cursor-not-allowed text-gray-400' : ''}
                    ${isPastDate && colorClass ? `${colorClass} opacity-50 cursor-not-allowed` : ''}
                    ${!isPastDate && (colorClass || 'hover:bg-white/50 border border-gray-300')}
                  `}
                >
                  <span className={`text-sm font-medium ${isCurrentDay ? 'font-bold' : ''}`}>{format(day, 'd')}</span>
                  {hasComment && (
                    <div className="absolute top-1 right-1 text-yellow-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-3 sm:w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 22V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v18l-6-2-6 2z"/>
                      </svg>
                    </div>
                  )}
                </button>
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