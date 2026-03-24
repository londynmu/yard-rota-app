import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { getMonthlyAwards } from '../../utils/shunterAwardsApi';

const getMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  try {
    const [year, month] = monthKey.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch {
    return monthKey;
  }
};

function ShunterOfTheMonthCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const currentKey = `${year}-${String(month).padStart(2, '0')}`;

        const previousStart = new Date(year, month - 3, 1);
        const fromKey = `${previousStart.getFullYear()}-${String(
          previousStart.getMonth() + 1
        ).padStart(2, '0')}`;
        const history = await getMonthlyAwards({
          fromMonth: fromKey,
          toMonth: currentKey,
        });

        const grouped = {};
        [...history].forEach((row) => {
          const mk = row.awardMonth;
          if (!mk) return;
          if (!grouped[mk]) {
            grouped[mk] = { monthKey: mk, day: null, night: null };
          }
          const entry = grouped[mk];
          const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unknown';
          if (row.period === 'day') entry.day = fullName;
          if (row.period === 'night') entry.night = fullName;
        });

        if (!grouped[currentKey]) {
          grouped[currentKey] = { monthKey: currentKey, day: null, night: null };
        }

        const sorted = Object.values(grouped).sort((a, b) =>
          a.monthKey < b.monthKey ? 1 : -1
        );

        setRows(sorted.slice(0, 4));
      } catch (err) {
        console.error('[ShunterOfTheMonthCard] load error:', err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="mb-3 px-4 mt-2 md:px-0 md:mt-0">
        <div className="max-w-4xl md:max-w-none mx-auto card-modern px-4 py-3 min-h-[48px] flex items-center">
          <div className="flex-1">
            <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return null;
  }

  const bgGradients = [
    'bg-gradient-to-br from-slate-50 to-blue-50/50 border-slate-200/60',
    'bg-gradient-to-br from-blue-50/50 to-slate-50 border-blue-200/50',
    'bg-gradient-to-br from-slate-50 to-purple-50/50 border-slate-200/60',
    'bg-gradient-to-br from-purple-50/50 to-slate-50 border-purple-200/50',
  ];
  const textColors = [
    'text-slate-700',
    'text-blue-700',
    'text-slate-700',
    'text-purple-700',
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mb-3 px-4 mt-2 md:px-0 md:mt-0"
    >
      <div className="max-w-4xl md:max-w-none mx-auto card-modern">
        <motion.button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full min-h-[74px] px-4 py-3.5 flex items-center justify-between gap-4 bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 border-b border-slate-200/60"
        >
          <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/90 border border-slate-200/60 shadow-sm text-blue-600">
            <Trophy className="w-6 h-6" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-800">Shunter of the Month</p>
          <motion.svg
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-5 h-5 text-slate-600 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </motion.button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="shunter-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="border-t border-slate-100 overflow-hidden"
            >
              <div className="p-2 space-y-2">
                {rows.map((row, index) => {
                  const hasWinners = row.day || row.night;
                  const bgGradient = bgGradients[index % bgGradients.length];
                  const textColor = textColors[index % textColors.length];

                  return (
                    <motion.div
                      key={row.monthKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.08, duration: 0.25 }}
                      className={`px-4 py-3 rounded-xl border flex flex-col gap-2 md:flex-row md:items-center md:justify-between shadow-sm hover:shadow-md transition-shadow duration-200 ${bgGradient}`}
                    >
                      <p className={`text-xs font-bold uppercase tracking-wide ${textColor}`}>
                        {getMonthLabel(row.monthKey)}
                      </p>
                      {hasWinners ? (
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-6">
                          {row.day && (
                            <span className="text-sm font-semibold text-charcoal">{row.day}</span>
                          )}
                          {row.night && (
                            <span className="text-sm font-semibold text-charcoal">{row.night}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
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

export default React.memo(ShunterOfTheMonthCard);
