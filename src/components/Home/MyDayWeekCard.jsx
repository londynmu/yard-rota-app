import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Timer } from 'lucide-react';
import { useMyDayWeek } from '../../hooks/useMyDayWeek';
import { SHIFT_TONE_BY_ID } from './shiftTones';

const PILL_CLASS = 'block w-full truncate rounded-md border px-0.5 py-1 text-center text-[10px] font-bold leading-none';

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function shiftShort(shiftType) {
  return SHIFT_TONE_BY_ID[shiftType]?.short || 'Shift';
}

function TodayRow({ currentShift, breakStatus, nextShift }) {
  let title;
  let subtitle;
  let subtitleClass = 'text-slate-500';
  let chip = null;

  if (currentShift) {
    title = `Today · ${shiftShort(currentShift.shiftType)} ${currentShift.start}–${currentShift.end}`;

    let detail;
    if (currentShift.absence) {
      detail = currentShift.absence;
      subtitleClass = 'font-semibold text-rose-700';
    } else if (breakStatus.kind === 'upcoming' || breakStatus.kind === 'active') {
      const more = breakStatus.moreCount ? ` +${breakStatus.moreCount}` : '';
      subtitleClass = 'font-medium text-slate-700';
      if (breakStatus.kind === 'active') {
        detail = `On break until ${breakStatus.end}${more}`;
        chip = <span className="badge-success shrink-0 whitespace-nowrap">{formatDuration(breakStatus.minutesLeft)} left</span>;
      } else {
        detail = `Break ${breakStatus.start}–${breakStatus.end}${more}`;
        chip = <span className="badge-info shrink-0 whitespace-nowrap">in {formatDuration(breakStatus.minutesUntil)}</span>;
      }
    } else if (breakStatus.kind === 'done') {
      detail = 'Breaks done';
    } else {
      detail = 'No break scheduled yet';
    }

    subtitle = currentShift.location ? (
      <>
        <span className="font-normal text-slate-500">{currentShift.location} · </span>
        {detail}
      </>
    ) : detail;
  } else {
    title = 'Day off today';
    subtitle = nextShift
      ? `Next: ${nextShift.dayLabel} ${shiftShort(nextShift.shiftType)} ${nextShift.start}`
      : 'No more shifts this week';
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm text-amber-600 shrink-0">
        <Timer className="w-4 h-4" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-charcoal truncate">{title}</p>
        <p className={`text-xs truncate ${subtitleClass}`}>{subtitle}</p>
      </div>
      {chip}
    </div>
  );
}

TodayRow.propTypes = {
  currentShift: PropTypes.object,
  breakStatus: PropTypes.object,
  nextShift: PropTypes.object,
};

function DayCell({ day }) {
  const tone = day.shift ? SHIFT_TONE_BY_ID[day.shift.shiftType] : null;

  let pill;
  if (day.shift?.absence) {
    pill = <span className={`${PILL_CLASS} border-rose-200 bg-rose-50 text-rose-700`}>{day.shift.absence}</span>;
  } else if (day.shift) {
    pill = <span className={`${PILL_CLASS} ${tone?.pill || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{tone?.short || 'Shift'}</span>;
  } else {
    pill = <span className={`${PILL_CLASS} border-transparent text-slate-300`}>–</span>;
  }

  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-1.5 ${
        day.isToday ? 'bg-white/90 border-slate-200/60 shadow-sm' : 'border-transparent'
      } ${day.isPast ? 'opacity-60' : ''}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{format(day.date, 'EEE')}</span>
      <span className="text-sm font-semibold leading-none text-charcoal tabular-nums">{format(day.date, 'd')}</span>
      {pill}
    </div>
  );
}

DayCell.propTypes = {
  day: PropTypes.shape({
    date: PropTypes.instanceOf(Date).isRequired,
    isToday: PropTypes.bool,
    isPast: PropTypes.bool,
    shift: PropTypes.object,
  }).isRequired,
};

function MyDayWeekSkeleton() {
  return (
    <div className="card-modern divide-y divide-slate-200/60" aria-hidden>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-8 w-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-44 bg-slate-100 rounded animate-pulse" />
          <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 p-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[62px] rounded-xl bg-slate-100/70 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/** Mobile Calendar tab: today's break and the user's shifts for the current rota week (Sat-Fri). */
export default function MyDayWeekCard() {
  const { loading, days, currentShift, breakStatus, nextShift } = useMyDayWeek();

  if (loading) return <MyDayWeekSkeleton />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card-modern divide-y divide-slate-200/60"
    >
      <TodayRow currentShift={currentShift} breakStatus={breakStatus} nextShift={nextShift} />
      <Link
        to="/my-rota"
        aria-label="My shifts this week, open My Rota"
        className="grid grid-cols-7 gap-1 p-2 transition-colors hover:bg-slate-50/70"
      >
        {days.map((day) => (
          <DayCell key={day.ymd} day={day} />
        ))}
      </Link>
    </motion.div>
  );
}
