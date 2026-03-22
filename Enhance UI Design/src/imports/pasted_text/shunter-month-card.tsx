import React, { useEffect, useState } from 'react';
import { getMonthlyAwards } from '../../utils/shunterAwardsApi';

const getMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  try {
    const [year, month] = monthKey.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    // Always English short month, e.g. "Nov 2025"
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

        // Few previous months (3 total including current)
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

        // Ensure current month is present (in case no award yet)
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
      <div className="mb-3 px-4 mt-2">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 min-h-[48px] flex items-center">
          <div className="flex-1">
            <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return null;
  }

  return (
    <div className="mb-3 px-4 mt-2">
      <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Header button */}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-b border-amber-100"
        >
          <p className="text-sm font-semibold text-amber-800">Shunter of the Month</p>
          <svg
            className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${
              open ? 'rotate-180' : 'rotate-0'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Animated content */}
        <div
          className={`border-t border-gray-100 overflow-hidden transition-all duration-200 ease-out ${
            open ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-2 space-y-2">
            {rows.map((row, index) => {
              const hasWinners = row.day || row.night;
              // Alternate colors for each month
              const bgColors = [
                'bg-amber-50 border-amber-200',
                'bg-blue-50 border-blue-200',
                'bg-emerald-50 border-emerald-200',
                'bg-purple-50 border-purple-200',
              ];
              const textColors = [
                'text-amber-700',
                'text-blue-700',
                'text-emerald-700',
                'text-purple-700',
              ];
              const bgColor = bgColors[index % bgColors.length];
              const textColor = textColors[index % textColors.length];

              return (
                <div
                  key={row.monthKey}
                  className={`px-3 py-2.5 rounded-lg border ${bgColor} flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between`}
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders when parent re-renders
// Component has no props, so it will only re-render when its own state changes
export default React.memo(ShunterOfTheMonthCard);
