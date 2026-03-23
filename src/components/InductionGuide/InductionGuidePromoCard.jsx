import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

/**
 * Link card on the main calendar flow to the yard induction guide.
 */
export default function InductionGuidePromoCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-3 px-4 mt-2"
    >
      <Link
        to="/yard-guide"
        className="block max-w-4xl mx-auto card-modern overflow-hidden group transition-shadow hover:shadow-xl"
      >
        <div className="flex items-center gap-4 px-4 py-3.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border-b border-slate-200/60">
          <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200/60 shadow-sm text-teal-600 group-hover:scale-105 transition-transform">
            <BookOpen className="w-6 h-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-charcoal group-hover:text-teal-800 transition-colors">
              Shunter Guide
            </p>
          </div>
          <span className="text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0 text-sm font-medium">
            Open
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
