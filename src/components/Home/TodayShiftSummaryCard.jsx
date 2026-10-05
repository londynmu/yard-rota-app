import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';

const SHIFT_ROWS = [
  {
    id: 'day',
    label: 'Day shift',
    row: 'bg-gradient-to-r from-amber-50 via-amber-50/70 to-slate-50 border-amber-200',
    tile: 'border-amber-200/70',
    value: 'text-amber-800',
    text: 'text-amber-700',
  },
  {
    id: 'afternoon',
    label: 'Afternoon shift',
    row: 'bg-gradient-to-r from-orange-50 via-orange-50/70 to-slate-50 border-orange-200',
    tile: 'border-orange-200/70',
    value: 'text-orange-800',
    text: 'text-orange-700',
  },
  {
    id: 'night',
    label: 'Night shift',
    row: 'bg-gradient-to-r from-blue-50 via-blue-50/70 to-slate-50 border-blue-200',
    tile: 'border-blue-200/70',
    value: 'text-blue-800',
    text: 'text-blue-700',
  },
];

const TOTAL_ROW = 'bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-slate-200/60';

/**
 * Today's rostered shunters at the selected location.
 * `embedded` = compact rows for the desktop side column; default = full card for the mobile Info tab.
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

          {SHIFT_ROWS.map((row) => (
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-3 px-4 mt-2 md:px-0 md:mt-0"
    >
      <div className="max-w-4xl md:max-w-none mx-auto card-modern overflow-hidden">
        <div className="min-h-[74px] flex items-center gap-4 px-4 py-3.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-b border-slate-200/60">
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 shrink-0">
            <Users className="w-6 h-6" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="flex-1 min-w-0 text-left text-sm font-semibold text-charcoal">Today on yard</p>
          <button
            type="button"
            onClick={onLocationToggle}
            disabled={locationToggleDisabled}
            aria-label="Change location"
            className={`flex min-w-0 max-w-[45%] items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all ${
              locationToggleDisabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-700 hover:text-charcoal bg-white/90 border border-slate-200/60 hover:border-slate-300/70 hover:shadow-sm'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${locationToggleDisabled ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm'}`} />
            <span className="min-w-0 truncate">{location || 'No locations'}</span>
          </button>
        </div>

        <div className="p-2 space-y-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className={`px-4 py-3 rounded-xl border flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow duration-200 ${TOTAL_ROW}`}
          >
            <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm shrink-0">
              <span className="text-sm font-bold text-charcoal tabular-nums">{summary.total}</span>
            </div>
            <p className="flex-1 min-w-0 text-sm font-semibold text-charcoal">Total shunters</p>
          </motion.div>

          {SHIFT_ROWS.map((row, index) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (index + 1) * 0.08, duration: 0.25 }}
              className={`px-4 py-3 rounded-xl border flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow duration-200 ${row.row}`}
            >
              <div className={`w-9 h-9 flex items-center justify-center rounded-lg bg-white/90 border shadow-sm shrink-0 ${row.tile}`}>
                <span className={`text-sm font-bold tabular-nums ${row.value}`}>{summary[row.id]}</span>
              </div>
              <p className={`flex-1 min-w-0 text-sm font-medium ${row.text}`}>{row.label}</p>
            </motion.div>
          ))}
        </div>
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
