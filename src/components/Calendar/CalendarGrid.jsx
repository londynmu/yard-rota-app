import React, { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
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
  isSunday,
  differenceInCalendarDays,
} from 'date-fns';
import { getUkBankHolidayName } from '../../utils/ukBankHolidays';

function CalendarDayTooltip({ lines, children }) {
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;

    const place = () => {
      const anchor = wrapRef.current.getBoundingClientRect();
      const tip = tipRef.current;
      const tipWidth = tip?.offsetWidth || 192;
      const tipHeight = tip?.offsetHeight || 64;
      const margin = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceRight = viewportWidth - anchor.right - margin;
      const spaceLeft = anchor.left - margin;
      const placeOnRight = spaceRight >= tipWidth || spaceRight >= spaceLeft;

      let left = placeOnRight ? anchor.right + margin : anchor.left - tipWidth - margin;
      left = Math.min(Math.max(margin, left), viewportWidth - tipWidth - margin);

      let top = anchor.top;
      if (top + tipHeight > viewportHeight - margin) {
        top = viewportHeight - tipHeight - margin;
      }
      if (top < margin) top = margin;

      setCoords({ top, left });
    };

    place();
  }, [open, lines]);

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 w-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && lines.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-[200] w-max max-w-[12rem] rounded-lg bg-black p-2 text-left text-xs text-white shadow-lg"
          style={{ top: coords.top, left: coords.left }}
        >
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

CalendarDayTooltip.propTypes = {
  lines: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired,
};

function CalendarGrid({ currentDate, dayData, onDayClick, isLoading, density = 'default' }) {
  const isCompact = density === 'compact';
  const today = startOfDay(new Date());
  const gridGapClass = isCompact ? 'gap-1' : 'gap-2';
  const weekdayRowClass = isCompact ? 'mb-2' : 'mb-3';
  const weekdayTextClass = isCompact
    ? 'text-center text-[10px] font-semibold text-slate-600 uppercase tracking-wide'
    : 'text-center text-xs font-semibold text-slate-600 uppercase tracking-wide';
  const cellSizeClass = isCompact
    ? 'h-9 min-h-9 rounded-lg'
    : 'aspect-square rounded-xl';
  const cellRingClass = isCompact
    ? 'ring-1 ring-blue-500 ring-offset-1 shadow-md scale-105 z-10'
    : 'ring-2 ring-blue-500 ring-offset-2 shadow-lg scale-105 z-10';
  const dayNumberClass = isCompact
    ? 'absolute right-0.5 top-0.5 text-[11px] leading-none'
    : 'absolute right-1 top-1 text-sm';
  const statusIconWrapClass = isCompact
    ? 'pointer-events-none absolute bottom-0.5 left-0.5 flex aspect-square w-[30%] min-h-0 min-w-0 items-center justify-center'
    : 'pointer-events-none absolute bottom-1 left-1 flex aspect-square w-[34%] min-h-0 min-w-0 items-center justify-center';
  const commentIconClass = isCompact
    ? 'w-2.5 h-2.5 text-amber-500 fill-amber-100'
    : 'w-3 h-3 text-amber-500 fill-amber-100';
  const pulseClass = isCompact ? 'absolute inset-0 bg-blue-400/20 rounded-lg -z-10' : 'absolute inset-0 bg-blue-400/20 rounded-xl -z-10';

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
        <div className={`grid grid-cols-7 ${gridGapClass} ${weekdayRowClass}`}>
          {weekdays.map((day) => (
            <div key={day} className={`${isCompact ? 'h-3' : 'h-4'} bg-slate-200 rounded-lg`} />
          ))}
        </div>
        <div className={`grid grid-cols-7 ${gridGapClass}`}>
          {Array.from({ length: days.length || 35 }).map((_, i) => (
            <div key={i} className={`${cellSizeClass} bg-slate-100`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={`grid grid-cols-7 ${gridGapClass} ${weekdayRowClass}`}>
        {weekdays.map((day) => (
          <div
            key={day}
            className={weekdayTextClass}
          >
            {day}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 ${gridGapClass}`}>
        {days.map((day, index) => {
          const dateString = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isPastDate = isBefore(day, today);
          const isCurrentDay = isToday(day);
          const colorClass = getColorByStatus(day);
          const dayInfo = dayData?.[dateString];
          const hasComment = !!dayInfo?.comment;
          const statusIcon = getStatusIcon(dayInfo?.status);
          const isSundayColumn = isSunday(day);
          const bankHolidayName = getUkBankHolidayName(day);
          const daysFromToday = differenceInCalendarDays(day, today);
          const isInUpcomingWindow = daysFromToday >= 0 && daysFromToday <= 3;
          const isPersonalHoliday = dayInfo?.status === 'holiday';
          const showEventDot =
            !!bankHolidayName ||
            (isInUpcomingWindow && (isSundayColumn || isPersonalHoliday));
          const tooltipLines = [
            isPastDate ? 'Cannot set availability for past dates' : '',
            isSundayColumn ? 'Sunday' : '',
            bankHolidayName || '',
            isPersonalHoliday ? 'Your holiday' : (statusIcon?.label || ''),
            hasComment ? dayInfo.comment : '',
          ].filter(Boolean);

          return (
            <CalendarDayTooltip key={dateString} lines={tooltipLines}>
            <motion.button
              type="button"
              onClick={() => !isPastDate && onDayClick(day, dayInfo)}
              disabled={isPastDate}
              aria-label={tooltipLines.join(', ') || format(day, 'd MMMM')}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
                delay: index * 0.01,
              }}
              whileHover={!isPastDate ? { scale: isCompact ? 1.03 : 1.05, y: isCompact ? 0 : -2 } : {}}
              whileTap={!isPastDate ? { scale: 0.95 } : {}}
              className={`
                relative w-full min-w-0 transition-all duration-200
                ${cellSizeClass}
                ${isCurrentMonth ? 'text-slate-700 font-medium' : 'text-slate-400'}
                ${isCurrentDay ? cellRingClass : ''}
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
                  className={pulseClass}
                />
              )}

              <span
                className={`${dayNumberClass} ${isCurrentDay ? 'font-bold text-blue-600' : 'font-medium'}`}
              >
                {format(day, 'd')}
              </span>

              {statusIcon && (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className={statusIconWrapClass}
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
                  className={isCompact ? 'absolute bottom-0.5 right-0.5' : 'absolute bottom-1 right-1'}
                >
                  <MessageSquare className={commentIconClass} aria-hidden />
                </motion.div>
              )}

              {showEventDot && (
                <span
                  className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-rose-500 shadow-sm ${
                    isCompact ? 'bottom-0.5 h-1.5 w-1.5' : 'bottom-1 h-2 w-2'
                  }`}
                  aria-hidden
                />
              )}
            </motion.button>
            </CalendarDayTooltip>
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
  density: PropTypes.oneOf(['default', 'compact']),
};

CalendarGrid.defaultProps = {
  dayData: {},
  isLoading: false,
  density: 'default',
};

export default React.memo(CalendarGrid);
