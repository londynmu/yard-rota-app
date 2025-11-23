import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { useToast } from '../ui/ToastContext';
import {
  createOrUpdateMonthlyAward,
  getCurrentMonthAwards,
  getMonthlyAwards,
  getUsersLastAwards,
  deleteAwardById,
} from '../../utils/shunterAwardsApi';

const getCurrentMonthKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const getMonthLabel = (monthKey) => {
  if (!monthKey) return '—';
  try {
    const [year, month] = monthKey.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    // Always English short month, e.g. "Nov 2025"
    return format(d, 'MMM yyyy');
  } catch {
    return monthKey;
  }
};

export default function ShunterOfTheMonthManager({ users }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentMonthKey] = useState(getCurrentMonthKey);
  const [currentMonthWinners, setCurrentMonthWinners] = useState({
    day: null,
    night: null,
  });
  const [lastAwardsMap, setLastAwardsMap] = useState(new Map());
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // 1) Last awards per user (for admin list helpers)
        const lastMap = await getUsersLastAwards();
        setLastAwardsMap(lastMap);

        // 2) Current month winners (for selectors at top)
        const current = await getCurrentMonthAwards();
        const currentState = { day: null, night: null };
        current.forEach((row) => {
          if (row.period === 'day') currentState.day = row.userId || null;
          if (row.period === 'night') currentState.night = row.userId || null;
        });
        setCurrentMonthWinners(currentState);

        // 3) Simple history – last 6 months of awards
        const now = new Date();
        const endY = now.getFullYear();
        const endM = now.getMonth() + 1;
        const start = new Date(endY, endM - 6, 1);
        const startKey = `${start.getFullYear()}-${String(
          start.getMonth() + 1
        ).padStart(2, '0')}`;
        const endKey = currentMonthKey;

        const historyRows = await getMonthlyAwards({
          fromMonth: startKey,
          toMonth: endKey,
        });

        // Group by month with ids + names for edit/delete
        const grouped = {};
        historyRows.forEach((row) => {
          const mk = row.awardMonth;
          if (!mk) return;
          if (!grouped[mk]) {
            grouped[mk] = {
              monthKey: mk,
              dayName: null,
              nightName: null,
              dayId: null,
              nightId: null,
            };
          }
          const entry = grouped[mk];
          const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unknown';
          if (row.period === 'day') {
            entry.dayName = fullName;
            entry.dayId = row.id;
          }
          if (row.period === 'night') {
            entry.nightName = fullName;
            entry.nightId = row.id;
          }
        });

        const sorted = Object.values(grouped).sort((a, b) =>
          a.monthKey < b.monthKey ? 1 : -1
        );
        setHistory(sorted);
      } catch (err) {
        console.error('[ShunterOfTheMonthManager] loadData error:', err);
        toast.error('Failed to load Shunter of the Month data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentMonthKey, toast]);

  const handleSave = async (period) => {
    const userId = currentMonthWinners[period];
    if (!userId) {
      toast.error('Select a user before saving.');
      return;
    }

    try {
      setSaving(true);
      await createOrUpdateMonthlyAward({
        awardMonthKey: currentMonthKey,
        period,
        userId,
      });
      toast.success('Award saved successfully.');

      // Refresh small part of data (current month + lastAwards map)
      const lastMap = await getUsersLastAwards();
      setLastAwardsMap(lastMap);

      const current = await getCurrentMonthAwards();
      const currentState = { day: null, night: null };
      current.forEach((row) => {
        if (row.period === 'day') currentState.day = row.userId || null;
        if (row.period === 'night') currentState.night = row.userId || null;
      });
      setCurrentMonthWinners(currentState);
    } catch (err) {
      console.error('[ShunterOfTheMonthManager] handleSave error:', err);
      toast.error('Could not save award.');
    } finally {
      setSaving(false);
    }
  };

  const renderUserOptionLabel = (user) => {
    const last = lastAwardsMap.get(user.id) || { day: null, night: null };
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';

    // Take the latest month when user got any award (day or night)
    let latestKey = null;
    if (last.day && (!latestKey || last.day > latestKey)) {
      latestKey = last.day;
    }
    if (last.night && (!latestKey || last.night > latestKey)) {
      latestKey = last.night;
    }

    if (!latestKey) {
      return fullName;
    }

    const latestLabel = getMonthLabel(latestKey);
    return `${fullName} • ${latestLabel}`;
  };

  const sortedUsers = useMemo(() => {
    return [...(users || [])].sort((a, b) => {
      const aName = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
      const bName = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [users]);

  const refreshCurrentAndLast = async () => {
    const lastMap = await getUsersLastAwards();
    setLastAwardsMap(lastMap);

    const current = await getCurrentMonthAwards();
    const currentState = { day: null, night: null };
    current.forEach((row) => {
      if (row.period === 'day') currentState.day = row.userId || null;
      if (row.period === 'night') currentState.night = row.userId || null;
    });
    setCurrentMonthWinners(currentState);
  };

  const handleDeleteHistoryAward = async (monthKey, period) => {
    const entry = history.find((h) => h.monthKey === monthKey);
    if (!entry) return;
    const awardId = period === 'day' ? entry.dayId : entry.nightId;
    if (!awardId) return;

    // Prosty confirm, żeby nie kliknąć przypadkiem
    const confirmed = window.confirm('Remove this award from history?');
    if (!confirmed) return;

    try {
      setSaving(true);
      await deleteAwardById(awardId);
      toast.success('Award removed.');

      // Local update of history
      setHistory((prev) =>
        prev.map((row) => {
          if (row.monthKey !== monthKey) return row;
          if (period === 'day') {
            return { ...row, dayName: null, dayId: null };
          }
          return { ...row, nightName: null, nightId: null };
        })
      );

      // Refresh last awards + current month winners
      await refreshCurrentAndLast();
    } catch (err) {
      console.error('[ShunterOfTheMonthManager] handleDeleteHistoryAward error:', err);
      toast.error('Could not remove award.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="h-4 w-40 bg-gray-100 rounded mb-3 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-5/6 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Shunter of the Month history – dropdown card at top */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="w-full px-4 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white text-xs font-bold border border-gray-900">
              H
            </span>
            <div className="text-left">
              <p className="text-sm font-semibold text-charcoal">Shunter of the Month history</p>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${
              historyOpen ? 'rotate-180' : 'rotate-0'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div
          className={`border-t border-gray-100 overflow-hidden transition-all duration-200 ease-out ${
            historyOpen ? 'max-h-64 md:max-h-80 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-4 pt-3">
            {history.length === 0 ? (
              <p className="text-sm text-gray-600">No awards recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((row) => (
                  <div
                    key={row.monthKey}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-sm border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-charcoal">
                      {getMonthLabel(row.monthKey)}
                    </span>
                    <div className="flex flex-col md:flex-row md:items-center md:gap-4 text-xs md:text-sm w-full">
                      {/* Day line */}
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-semibold text-charcoal text-sm md:text-base truncate">
                          {row.dayName || '—'}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] md:text-xs font-semibold">
                            Day
                          </span>
                          {row.dayId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHistoryAward(row.monthKey, 'day')}
                              disabled={saving}
                              className="text-gray-400 hover:text-red-600 text-xs"
                              title="Remove Day award"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Night line */}
                      <div className="flex items-center justify-between gap-2 w-full mt-1 md:mt-0">
                        <span className="font-semibold text-charcoal text-sm md:text-base truncate">
                          {row.nightName || '—'}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-[11px] md:text-xs font-semibold">
                            Night
                          </span>
                          {row.nightId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteHistoryAward(row.monthKey, 'night')}
                              disabled={saving}
                              className="text-gray-400 hover:text-red-600 text-xs"
                              title="Remove Night award"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Current month selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-charcoal">
              Shunter of the Month – {getMonthLabel(currentMonthKey)}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Day award */}
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-charcoal flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-300">
                  D
                </span>
                Day Shunter
              </span>
            </div>
            <select
              value={currentMonthWinners.day || ''}
              onChange={(e) =>
                setCurrentMonthWinners((prev) => ({
                  ...prev,
                  day: e.target.value || null,
                }))
              }
              className="w-full mt-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            >
              <option value="">Select user…</option>
              {sortedUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {renderUserOptionLabel(user)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleSave('day')}
              disabled={!currentMonthWinners.day || saving}
              className={`mt-3 w-full px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                !currentMonthWinners.day || saving
                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-900'
              }`}
            >
              Save Day Award
            </button>
          </div>

          {/* Night award */}
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-charcoal flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-300">
                  N
                </span>
                Night Shunter
              </span>
            </div>
            <select
              value={currentMonthWinners.night || ''}
              onChange={(e) =>
                setCurrentMonthWinners((prev) => ({
                  ...prev,
                  night: e.target.value || null,
                }))
              }
              className="w-full mt-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
            >
              <option value="">Select user…</option>
              {sortedUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {renderUserOptionLabel(user)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleSave('night')}
              disabled={!currentMonthWinners.night || saving}
              className={`mt-3 w-full px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                !currentMonthWinners.night || saving
                  ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-900'
              }`}
            >
              Save Night Award
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

ShunterOfTheMonthManager.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
};


