/**
 * Segment classes for the mobile Home top bar (sizing from My Rota / Stats bars, states from desktop top nav).
 * py-1.5 instead of py-2 offsets the 20px icon so the bar height matches the text-only My Rota / Stats bars.
 */
export const HOME_TAB_SEGMENT_CLASS =
  'flex min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-1.5 text-xs font-semibold transition-all duration-200 sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm';

export const HOME_TAB_ACTIVE_CLASS = 'bg-white/90 text-slate-800 border-slate-200/60 shadow-sm';

export const HOME_TAB_INACTIVE_CLASS =
  'text-slate-600 border-transparent hover:bg-white/70 hover:border-slate-200/60 hover:shadow-sm hover:text-slate-800';
