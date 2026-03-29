import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Check, MessageSquare, TreePalm, X } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isBefore,
  startOfDay,
  isToday,
} from 'date-fns';

function CalendarGrid({ currentDate, dayData, onDayClick, isLoading }) {
  const today = startOfDay(new Date());

  const generateDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: startDate, end: endDate });
  };

  const getColorByStatus = (day) => {
    const dateString = format(day, 'yyyy-MM-dd');
    const dayInfo = dayData?.[dateString];
    if (!dayInfo) return '';

    switch (dayInfo.status) {
      case 'available':
        return 'bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-300/50 text-emerald-800 shadow-sm hover:shadow-md';
      case 'unavailable':
        return 'bg-gradient-to-br from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 border border-rose-300/50 text-rose-800 shadow-sm hover:shadow-md';
      case 'holiday':
        return 'bg-gradient-to-br from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 border border-blue-300/50 text-blue-800 shadow-sm hover:shadow-md';
      default:
        return '';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available':
        return {
          Icon: Check,
          className: 'text-emerald-700/70',
          label: 'Available',
        };
      case 'unavailable':
        return {
          Icon: X,
          className: 'text-rose-700/70',
          label: 'Unavailable',
        };
      case 'holiday':
        return {
          Icon: TreePalm,
          className: 'text-blue-700/70',
          label: 'Holiday',
        };
      default:
        return null;
    }
  };

  const days = generateDays();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return (
      <div className="w-full animate-pulse">
        <div className="grid grid-cols-7 gap-2 mb-3">
          {weekdays.map((day) => (
            <div key={day} className="h-4 bg-slate-200 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: days.length || 35 }).map((_, i) => (
            <div key={i} className="aspect-square bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-7 gap-2 mb-3">
        {weekdays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wide"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const dateString = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isPastDate = isBefore(day, today);
          const isCurrentDay = isToday(day);
          const colorClass = getColorByStatus(day);
          const dayInfo = dayData?.[dateString];
          const hasComment = !!dayInfo?.comment;
          const statusIcon = getStatusIcon(dayInfo?.status);
          const dayTitle = [
            isPastDate ? 'Cannot set availability for past dates' : '',
            statusIcon?.label || '',
            hasComment ? dayInfo.comment : '',
          ]
            .filter(Boolean)
            .join(' - ');

          return (
            <motion.button
              key={dateString}
              type="button"
              onClick={() => !isPastDate && onDayClick(day, dayInfo)}
              disabled={isPastDate}
              title={dayTitle}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
                delay: index * 0.01,
              }}
              whileHover={!isPastDate ? { scale: 1.05, y: -2 } : {}}
              whileTap={!isPastDate ? { scale: 0.95 } : {}}
              className={`
                relative aspect-square transition-all duration-200 rounded-xl
                ${isCurrentMonth ? 'text-slate-700 font-medium' : 'text-slate-400'}
                ${isCurrentDay ? 'ring-2 ring-blue-500 ring-offset-2 shadow-lg scale-105 z-10' : ''}
                ${isPastDate && !colorClass ? 'bg-slate-100/50 cursor-not-allowed text-slate-400' : ''}
                ${isPastDate && colorClass ? `${colorClass} opacity-50 cursor-not-allowed` : ''}
                ${!isPastDate && !colorClass ? 'hover:bg-slate-50 border border-slate-200/60 hover:shadow-sm' : ''}
                ${!isPastDate && colorClass ? colorClass : ''}
              `}
            >
              {isCurrentDay && (
                <motion.div
                  aria-hidden
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="absolute inset-0 bg-blue-400/20 rounded-xl -z-10"
                />
              )}

              <span
                className={`absolute right-1 top-1 text-sm ${isCurrentDay ? 'font-bold text-blue-600' : 'font-medium'}`}
              >
                {format(day, 'd')}
              </span>

              {statusIcon && (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="pointer-events-none absolute bottom-1 left-1 flex aspect-square w-[34%] min-h-0 min-w-0 items-center justify-center"
                >
                  <statusIcon.Icon
                    className={`h-full w-full ${statusIcon.className}`}
                    strokeWidth={2.4}
                    aria-hidden
                  />
                </motion.div>
              )}

              {hasComment && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500 }}
                  className="absolute bottom-1 right-1"
                >
                  <MessageSquare className="w-3 h-3 text-amber-500 fill-amber-100" aria-hidden />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

CalendarGrid.propTypes = {
  currentDate: PropTypes.instanceOf(Date).isRequired,
  dayData: PropTypes.object,
  onDayClick: PropTypes.func.isRequired,
  isLoading: PropTypes.bool,
};

CalendarGrid.defaultProps = {
  dayData: {},
  isLoading: false,
};

export default React.memo(CalendarGrid);
