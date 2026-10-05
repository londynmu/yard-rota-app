import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight } from 'lucide-react';

/**
 * Link card on the main calendar flow to the yard induction guide.
 * `variant="row"` = list row for the mobile Info tab (sits inside a shared card-modern with dividers).
 */
export default function InductionGuidePromoCard({ embedded = false, variant = 'card' }) {
  if (variant === 'row') {
    return (
      <Link
        to="/yard-guide"
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 transition-colors group"
      >
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 shrink-0">
          <BookOpen className="w-4 h-4" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-charcoal truncate group-hover:text-teal-800 transition-colors">
            Shunter Guide
          </p>
          <p className="text-xs text-slate-500 truncate">Yard induction guide</p>
        </div>
        <ChevronRight
          className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all"
          strokeWidth={2}
          aria-hidden
        />
      </Link>
    );
  }

  if (embedded) {
    return (
      <Link
        to="/yard-guide"
        className="flex items-center gap-2 px-2 py-1.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border border-slate-200/60 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-left group"
      >
        <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 group-hover:scale-105 transition-transform shrink-0">
          <BookOpen className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="flex-1 min-w-0 text-xs font-medium text-charcoal truncate group-hover:text-teal-800 transition-colors">
          Shunter Guide
        </p>
        <span className="text-[11px] font-semibold text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0">
          Open
        </span>
      </Link>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-3 px-4 mt-2 md:px-0 md:mt-0"
    >
      <Link
        to="/yard-guide"
        className="block max-w-4xl md:max-w-none mx-auto card-modern overflow-hidden group transition-shadow hover:shadow-xl"
      >
        <div className="min-h-[74px] flex items-center gap-4 px-4 py-3.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-b border-slate-200/60">
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 group-hover:scale-105 transition-transform">
            <BookOpen className="w-6 h-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-charcoal group-hover:text-teal-800 transition-colors">
              Shunter Guide
            </p>
          </div>
          <span className="text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0 text-sm font-semibold">
            Open
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

InductionGuidePromoCard.propTypes = {
  embedded: PropTypes.bool,
  variant: PropTypes.oneOf(['card', 'row']),
};
