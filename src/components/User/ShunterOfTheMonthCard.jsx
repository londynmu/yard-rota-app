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
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2 min-h-[60px] flex items-center">
          <div className="flex items-center gap-2 flex-1">
            <div className="h-7 w-7 bg-gray-100 rounded-full animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-100 rounded mb-1 animate-pulse" />
              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
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
      <div className="max-w-4xl mx-auto">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="w-full bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-2 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300 text-sm font-bold">
              🏆
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold text-charcoal">Shunter of the Month</p>
              <p className="text-xs text-gray-600">
                    
              </p>
            </div>
          </div>
          <span className="text-xs text-gray-500">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>

        {open && (
          <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-sm max-h-52 overflow-y-auto">
            <div className="divide-y divide-gray-100">
              {rows.map((row) => (
                <div
                  key={row.monthKey}
                  className="px-3 py-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
                >
                  <p className="text-xs font-semibold text-charcoal">
                    {getMonthLabel(row.monthKey)}
                  </p>
                  <div className="flex flex-col md:items-end md:text-right">
                    <p className="text-[13px] text-gray-600">
                      {row.day ? `${row.day} +50£` : '—'}
                    </p>
                    <p className="text-[13px] text-gray-600">
                      {row.night ? `${row.night} +50£` : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders when parent re-renders
// Component has no props, so it will only re-render when its own state changes
export default React.memo(ShunterOfTheMonthCard);
