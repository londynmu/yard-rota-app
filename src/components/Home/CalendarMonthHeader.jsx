import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

export default function CalendarMonthHeader({ currentDate, onPrevious, onNext, compact = false }) {
  const iconClass = compact ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
      <h3 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-charcoal tracking-tight`}>
        {format(currentDate, 'MMMM yyyy')}
      </h3>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onNext}
          className="p-2 rounded-xl border border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm transition-all text-charcoal"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

CalendarMonthHeader.propTypes = {
  currentDate: PropTypes.instanceOf(Date).isRequired,
  onPrevious: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  compact: PropTypes.bool,
};
