import React from 'react';
import PropTypes from 'prop-types';

const SHIFT_SEGMENTS = [
  { id: 'day', label: 'Day', ariaLabel: 'day', activeHover: 'hover:border-amber-300/60', dot: 'bg-amber-500' },
  { id: 'afternoon', label: 'Afternoon', shortLabel: 'Aft', ariaLabel: 'afternoon', activeHover: 'hover:border-orange-300/60', dot: 'bg-orange-500' },
  { id: 'night', label: 'Night', ariaLabel: 'night', activeHover: 'hover:border-blue-300/60', dot: 'bg-blue-500' },
];

export default function BreaksFilterBar({
  availableLocations,
  selectedLocation,
  selectedShifts,
  shiftCounts,
  onLocationToggle,
  onShiftToggle,
  fullWidth = false,
}) {
  const noLocations = availableLocations.length === 0;

  return (
    <div className={`filter-bar-segmented${fullWidth ? ' filter-bar-segmented-desktop-full' : ''}`}>
      <button
        type="button"
        onClick={onLocationToggle}
        disabled={noLocations}
        className={`flex min-w-0 items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:px-2 sm:py-2.5 sm:text-sm ${
          noLocations
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-700 hover:text-charcoal bg-white/90 border border-slate-200/60 hover:border-slate-300/70 hover:shadow-sm'
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${noLocations ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm'}`} />
        <span className="min-w-0 truncate text-left text-[10px] sm:text-xs">{selectedLocation || 'No locations'}</span>
      </button>

      {SHIFT_SEGMENTS.map((segment) => {
        const isActive = selectedShifts.includes(segment.id);
        const count = shiftCounts?.[segment.id] || 0;
        const countSuffix = count > 0 ? ` (${count})` : '';

        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onShiftToggle(segment.id)}
            title={`${segment.label}${countSuffix}`}
            aria-label={`Toggle ${segment.ariaLabel} breaks${countSuffix}`}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
              isActive
                ? `text-slate-800 bg-white/90 border border-slate-200/60 shadow-sm ${segment.activeHover}`
                : 'text-slate-400 hover:text-slate-600 border border-transparent hover:bg-white/60'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${isActive ? `${segment.dot} shadow-sm` : 'bg-slate-300'}`} />
            {segment.shortLabel ? (
              <span>
                <span className="sm:hidden">{segment.shortLabel}</span>
                <span className="hidden sm:inline">{segment.label}</span>
              </span>
            ) : (
              <span>{segment.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

BreaksFilterBar.propTypes = {
  availableLocations: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedLocation: PropTypes.string,
  selectedShifts: PropTypes.arrayOf(PropTypes.string).isRequired,
  shiftCounts: PropTypes.shape({
    day: PropTypes.number,
    afternoon: PropTypes.number,
    night: PropTypes.number,
  }),
  onLocationToggle: PropTypes.func.isRequired,
  onShiftToggle: PropTypes.func.isRequired,
  fullWidth: PropTypes.bool,
};
