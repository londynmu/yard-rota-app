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
        return 'bg-green-100 dark:bg-green-600 hover:bg-green-200 dark:hover:bg-green-500 border-2 border-green-400 dark:border-green-400 text-green-900 dark:text-white font-semibold';
      case 'unavailable':
        return 'bg-red-100 dark:bg-red-600 hover:bg-red-200 dark:hover:bg-red-500 border-2 border-red-400 dark:border-red-400 text-red-900 dark:text-white font-semibold';
      case 'holiday':
        return 'bg-blue-100 dark:bg-blue-600 hover:bg-blue-200 dark:hover:bg-blue-500 border-2 border-blue-400 dark:border-blue-400 text-blue-900 dark:text-white font-semibold';
      default:
        return '';
    }
  };

  const weeks = generateCalendarWeeks();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="w-full h-80 sm:h-48 flex items-center justify-center bg-gray-50 dark:bg-gray-750">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black dark:border-white"></div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-b-xl overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 bg-gray-100 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
        {weekdays.map((day) => (
          <div key={day} className="p-1 sm:p-1 text-center font-bold text-xs sm:text-sm text-charcoal dark:text-white">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-gray-800">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1 py-0.5 px-1 sm:py-0.5 border-t border-gray-200 dark:border-gray-700">
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
                    ${isCurrentMonth ? 'text-charcoal dark:text-white font-semibold' : 'text-gray-500 dark:text-gray-500'} 
                    ${isCurrentDay ? 'ring-2 ring-black dark:ring-yellow-400 shadow-md scale-105 z-10' : ''}
                    ${isPastDate && !colorClass ? 'bg-gray-100 dark:bg-gray-750 cursor-not-allowed text-gray-400 dark:text-gray-600' : ''}
                    ${isPastDate && colorClass ? `${colorClass} opacity-50 cursor-not-allowed` : ''}
                    ${!isPastDate && (colorClass || 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700')}
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