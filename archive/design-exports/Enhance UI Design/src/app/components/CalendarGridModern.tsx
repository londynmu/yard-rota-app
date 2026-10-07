import React from 'react';
import { motion } from 'motion/react';
import { MessageSquare } from 'lucide-react';

interface DayInfo {
  status?: 'available' | 'unavailable' | 'holiday';
  comment?: string;
}

interface CalendarGridModernProps {
  currentDate: Date;
  dayData?: Record<string, DayInfo>;
  onDayClick: (day: Date, dayInfo?: DayInfo) => void;
  isLoading?: boolean;
}

/**
 * Modern Calendar Grid Component
 * Features:
 * - Subtle gradients instead of flat colors
 * - Smooth Motion animations
 * - Better spacing and typography
 * - Improved accessibility
 */
export default function CalendarGridModern({
  currentDate,
  dayData = {},
  onDayClick,
  isLoading = false,
}: CalendarGridModernProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate calendar days (simplified for demo)
  const generateDays = () => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Add days from previous month
    const firstDayOfWeek = firstDay.getDay();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = new Date(year, month, -i);
      days.push(day);
    }
    
    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    // Add days from next month to complete the grid
    const remainingDays = 35 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  const getColorByStatus = (status?: string) => {
    switch (status) {
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

  const formatDate = (date: Date) => date.getDate();
  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isSameMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth() &&
           date.getFullYear() === currentDate.getFullYear();
  };

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const isPast = (date: Date) => {
    return date < today;
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
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Weekday Headers */}
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

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          const dateString = formatDateString(day);
          const dayInfo = dayData[dateString];
          const isCurrentMonth = isSameMonth(day);
          const isCurrentDay = isToday(day);
          const isPastDate = isPast(day);
          const colorClass = getColorByStatus(dayInfo?.status);
          const hasComment = !!dayInfo?.comment;

          return (
            <motion.button
              key={dateString}
              type="button"
              onClick={() => !isPastDate && onDayClick(day, dayInfo)}
              disabled={isPastDate}
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
                aspect-square flex flex-col items-center justify-center
                relative transition-all duration-200 rounded-xl
                ${isCurrentMonth ? 'text-slate-700 font-medium' : 'text-slate-400'}
                ${isCurrentDay ? 'ring-2 ring-blue-500 ring-offset-2 shadow-lg scale-105 z-10' : ''}
                ${isPastDate && !colorClass ? 'bg-slate-100/50 cursor-not-allowed text-slate-400' : ''}
                ${isPastDate && colorClass ? `${colorClass} opacity-50 cursor-not-allowed` : ''}
                ${!isPastDate && !colorClass ? 'hover:bg-slate-50 border border-slate-200/60 hover:shadow-sm' : ''}
                ${!isPastDate && colorClass ? colorClass : ''}
              `}
              title={hasComment ? dayInfo.comment : ''}
            >
              <span
                className={`text-sm ${
                  isCurrentDay ? 'font-bold text-blue-600' : 'font-medium'
                }`}
              >
                {formatDate(day)}
              </span>

              {/* Comment Indicator */}
              {hasComment && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500 }}
                  className="absolute top-1 right-1"
                >
                  <MessageSquare className="w-3 h-3 text-amber-500 fill-amber-100" />
                </motion.div>
              )}

              {/* Today Pulse Indicator */}
              {isCurrentDay && (
                <motion.div
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
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
