import React from 'react';
import PropTypes from 'prop-types';

/**
 * Horizontal location pills for TM Home / Rota.
 * Only pass locations that already have shunters today.
 */
export default function TmLocationPills({ locations, selected, onSelect }) {
  if (!locations?.length) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      role="tablist"
      aria-label="Location"
    >
      {locations.map((loc) => {
        const active = loc.name === selected;
        return (
          <button
            key={loc.name}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(loc.name)}
            className={[
              'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-all whitespace-nowrap',
              active
                ? 'bg-charcoal text-white border-charcoal shadow-sm'
                : 'bg-white/90 text-charcoal border-slate-200/60 hover:border-slate-300 hover:bg-white',
            ].join(' ')}
          >
            {loc.name}
          </button>
        );
      })}
    </div>
  );
}

TmLocationPills.propTypes = {
  locations: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      count: PropTypes.number,
    })
  ),
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};
