import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { SHIFT_TONES } from './shiftTones';

const TOTAL_ROW = 'bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-slate-200/60';

/**
 * Today's rostered shunters at the selected location.
 * `embedded` = compact rows for the desktop side column; default = header + four tiles for the mobile Info tab.
 */
export default function TodayShiftSummaryCard({
  summary,
  location,
  onLocationToggle,
  locationToggleDisabled = false,
  embedded = false,
  children = null,
}) {
  if (embedded) {
    return (
      <div className="card-modern p-2 flex-shrink-0 overflow-y-auto">
        <div className="grid grid-cols-1 gap-1">
          <div className={`flex items-center gap-2 px-2 py-1.5 border rounded-lg shadow-sm ${TOTAL_ROW}`}>
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm shrink-0">
              <span className="text-xs font-bold text-charcoal tabular-nums">{summary.total}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs text-charcoal truncate">Total shunters</p>
              <p className="text-[11px] leading-tight text-slate-500 truncate">{location || 'Location'} today</p>
            </div>
          </div>

          {SHIFT_TONES.map((row) => (
            <div key={row.id} className={`flex items-center gap-2 px-2 py-1.5 border rounded-lg shadow-sm ${row.row}`}>
              <div className={`w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border shadow-sm shrink-0 ${row.tile}`}>
                <span className={`text-xs font-bold tabular-nums ${row.value}`}>{summary[row.id]}</span>
              </div>
              <p className={`flex-1 min-w-0 text-[11px] leading-tight ${row.text}`}>{row.label}</p>
            </div>
          ))}
          {children}
        </div>
      </div>
    );
  }

  const tiles = [
    { id: 'total', short: 'Total', label: 'Total shunters', row: TOTAL_ROW, value: 'text-charcoal', text: 'text-slate-500' },
    ...SHIFT_TONES,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="card-modern"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-b border-slate-200/60">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 shrink-0">
          <Users className="w-4 h-4" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="flex-1 min-w-0 text-left text-sm font-semibold text-charcoal">Today on yard</p>
        <button
          type="button"
          onClick={onLocationToggle}
          disabled={locationToggleDisabled}
          aria-label="Change location"
          className={`flex min-w-0 max-w-[45%] items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all ${
            locationToggleDisabled
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-slate-700 hover:text-charcoal bg-white/90 border border-slate-200/60 hover:border-slate-300/70 hover:shadow-sm'
          }`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${locationToggleDisabled ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm'}`} />
          <span className="min-w-0 truncate">{location || 'No locations'}</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 p-2">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            aria-label={`${tile.label}: ${summary[tile.id]}`}
            className={`flex flex-col items-center rounded-xl border px-1 py-2 text-center ${tile.row}`}
          >
            <span className={`text-lg font-bold leading-tight tabular-nums ${tile.value}`}>{summary[tile.id]}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${tile.text}`}>{tile.short}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

TodayShiftSummaryCard.propTypes = {
  summary: PropTypes.shape({
    day: PropTypes.number.isRequired,
    afternoon: PropTypes.number.isRequired,
    night: PropTypes.number.isRequired,
    total: PropTypes.number.isRequired,
  }).isRequired,
  location: PropTypes.string,
  onLocationToggle: PropTypes.func,
  locationToggleDisabled: PropTypes.bool,
  embedded: PropTypes.bool,
  children: PropTypes.node,
};
