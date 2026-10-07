import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Award, Calendar } from 'lucide-react';

interface MonthData {
  monthKey: string;
  day: string | null;
  night: string | null;
}

/**
 * Modern Shunter of the Month Card
 * Features:
 * - Subtle gradients (no more rainbow colors)
 * - Smooth expand/collapse animation
 * - Glassmorphism design
 * - Better visual hierarchy
 */
export default function ShunterMonthCardModern() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MonthData[]>([]);

  useEffect(() => {
    // Simulate loading - replace with your actual API call
    setTimeout(() => {
      setRows([
        { monthKey: '2026-03', day: 'John Smith', night: 'Sarah Johnson' },
        { monthKey: '2026-02', day: 'Mike Brown', night: 'Emma Davis' },
        { monthKey: '2026-01', day: null, night: 'Robert Wilson' },
        { monthKey: '2025-12', day: 'Alice Cooper', night: null },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const getMonthLabel = (monthKey: string) => {
    if (!monthKey) return '';
    try {
      const [year, month] = monthKey.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    } catch {
      return monthKey;
    }
  };

  if (loading) {
    return (
      <div className="mb-3 px-4 mt-2">
        <div className="max-w-4xl mx-auto">
          <div className="h-14 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="mb-3 px-4 mt-2"
    >
      <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-sm border border-slate-200/60 rounded-2xl shadow-lg overflow-hidden">
        {/* Header Button */}
        <motion.button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 border-b border-slate-200/60 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-yellow-100 rounded-xl flex items-center justify-center shadow-sm">
              <Award className="w-5 h-5 text-amber-600" strokeWidth={2} />
            </div>
            <p className="text-sm font-semibold text-slate-800">Shunter of the Month</p>
          </div>

          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <ChevronDown className="w-5 h-5 text-slate-600 group-hover:text-slate-800 transition-colors" />
          </motion.div>
        </motion.button>

        {/* Animated Content */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="p-4 space-y-3 bg-gradient-to-b from-slate-50/50 to-white">
                {rows.map((row, index) => {
                  const hasWinners = row.day || row.night;

                  // Subtle gradient variations
                  const bgGradients = [
                    'bg-gradient-to-br from-blue-50/80 to-slate-50 border-blue-200/40',
                    'bg-gradient-to-br from-slate-50 to-blue-50/80 border-slate-200/40',
                    'bg-gradient-to-br from-purple-50/60 to-slate-50 border-purple-200/40',
                    'bg-gradient-to-br from-slate-50 to-purple-50/60 border-slate-200/40',
                  ];

                  const bgGradient = bgGradients[index % bgGradients.length];

                  return (
                    <motion.div
                      key={row.monthKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: index * 0.1,
                        type: 'spring',
                        stiffness: 300,
                        damping: 25,
                      }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      className={`px-4 py-3.5 rounded-xl border ${bgGradient} shadow-sm hover:shadow-md transition-all duration-200 cursor-default`}
                    >
                      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                        {/* Month Label */}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-500" strokeWidth={2} />
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                            {getMonthLabel(row.monthKey)}
                          </p>
                        </div>

                        {/* Winners */}
                        {hasWinners ? (
                          <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-6">
                            {row.day && (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-100 rounded-full">
                                  <span className="text-xs font-bold text-amber-700">D</span>
                                </span>
                                <span className="text-sm font-semibold text-slate-800">
                                  {row.day}
                                </span>
                              </div>
                            )}
                            {row.night && (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-100 rounded-full">
                                  <span className="text-xs font-bold text-indigo-700">N</span>
                                </span>
                                <span className="text-sm font-semibold text-slate-800">
                                  {row.night}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400 italic">No awards yet</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
