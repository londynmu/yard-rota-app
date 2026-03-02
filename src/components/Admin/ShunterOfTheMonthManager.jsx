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
  const [activePeriod, setActivePeriod] = useState('day');
  const [userSearch, setUserSearch] = useState('');

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

  // Users filtered by period: Day = day shift only; Night = night + afternoon
  const usersForPeriod = useMemo(() => {
    const period = activePeriod;
    return sortedUsers.filter((u) => {
      const pref = (u.shift_preference || '').toLowerCase();
      if (period === 'day') {
        return pref === 'day' || !pref;
      }
      return pref === 'night' || pref === 'afternoon' || !pref;
    });
  }, [sortedUsers, activePeriod]);

  const filteredUserList = useMemo(() => {
    const q = (userSearch || '').trim().toLowerCase();
    if (!q) return usersForPeriod;
    return usersForPeriod.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [usersForPeriod, userSearch]);

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
      <div className="space-y-4 animate-pulse">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="h-5 w-40 bg-slate-200 rounded mb-2" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/20 p-3">
          <div className="h-5 w-48 bg-slate-200 rounded mb-3" />
          <div className="h-8 bg-slate-200 rounded mb-2" />
          <div className="h-6 w-full bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* History – collapsible, red header, yellow container */}
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="w-full px-3 py-2 flex items-center justify-between bg-red-50 hover:bg-red-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white text-[10px] font-bold">
              H
            </span>
            <p className="text-xs font-semibold text-charcoal">Shunter of the Month history</p>
            {history.length > 0 && (
              <span className="text-[10px] text-gray-500">({history.length} months)</span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 text-gray-500 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {historyOpen && (
          <div className="border-t border-red-100 max-h-[min(60vh,360px)] overflow-y-auto p-2 bg-yellow-50/50">
            {history.length === 0 ? (
              <p className="text-xs text-gray-500 py-2 px-1">No awards recorded yet.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((row) => {
                  const complete = row.dayId && row.nightId;
                  const cardStyle = complete
                    ? 'border border-green-200 bg-white'
                    : 'border border-amber-200 bg-white';
                  return (
                    <div
                      key={row.monthKey}
                      className={`rounded-lg px-2.5 py-1.5 flex flex-col md:flex-row md:items-center gap-1 md:gap-3 shadow-sm ${cardStyle}`}
                    >
                      <span className="text-xs font-semibold text-charcoal md:w-24 flex-shrink-0">
                        {getMonthLabel(row.monthKey)}
                      </span>
                      <div className="flex items-center gap-1 md:flex-1 min-w-0">
                        <span className="text-xs text-charcoal truncate">{row.dayName || '—'}</span>
                        {row.dayId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryAward(row.monthKey, 'day')}
                            disabled={saving}
                            className="text-gray-400 hover:text-red-600 text-xs p-0.5 flex-shrink-0"
                            title="Remove Day award"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:flex-1 min-w-0">
                        <span className="text-xs text-charcoal truncate">{row.nightName || '—'}</span>
                        {row.nightId && (
                          <button
                            type="button"
                            onClick={() => handleDeleteHistoryAward(row.monthKey, 'night')}
                            disabled={saving}
                            className="text-gray-400 hover:text-red-600 text-xs p-0.5 flex-shrink-0"
                            title="Remove Night award"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current month – red header, yellow container, Save in footer on desktop */}
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-red-200/60 bg-red-50">
          <h2 className="text-sm font-semibold text-charcoal">
            Shunter of the Month – {getMonthLabel(currentMonthKey)}
          </h2>
        </div>
        <div className="p-3 bg-yellow-50/50 flex-1">
          {/* Tabs */}
          <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-100 mb-2">
            <button
              type="button"
              onClick={() => { setActivePeriod('day'); setUserSearch(''); }}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded transition-colors ${
                activePeriod === 'day' ? 'bg-white text-charcoal shadow-sm' : 'text-gray-600 hover:text-charcoal'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => { setActivePeriod('night'); setUserSearch(''); }}
              className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded transition-colors ${
                activePeriod === 'night' ? 'bg-white text-charcoal shadow-sm' : 'text-gray-600 hover:text-charcoal'
              }`}
            >
              Night / Afternoon
            </button>
          </div>

          {/* Winner + search row */}
          <div className="flex flex-col gap-1.5 mb-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-600">{activePeriod === 'day' ? 'Day' : 'Night'} winner:</span>
              <span className="font-semibold text-charcoal">
                {(() => {
                  const uid = currentMonthWinners[activePeriod];
                  if (!uid) return 'Not set';
                  const u = sortedUsers.find((x) => x.id === uid);
                  return u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown' : 'Unknown';
                })()}
              </span>
            </div>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full bg-white border border-gray-300 rounded-md px-2 py-1.5 text-xs text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            />
          </div>

          {/* User list */}
          <div className="max-h-[200px] overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100 bg-white">
            {filteredUserList.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-500">No users match.</div>
            ) : (
              filteredUserList.map((user) => {
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
                const isSelected = currentMonthWinners[activePeriod] === user.id;
                const last = lastAwardsMap.get(user.id) || { day: null, night: null };
                const latestKey = last.day && last.night
                  ? (last.day >= last.night ? last.day : last.night)
                  : (last.day || last.night);
                const lastLabel = latestKey ? getMonthLabel(latestKey) : null;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() =>
                      setCurrentMonthWinners((prev) => ({ ...prev, [activePeriod]: user.id }))
                    }
                    className={`w-full px-2 py-1.5 text-left flex items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-amber-100 border-l-2 border-amber-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs font-medium text-charcoal truncate">{fullName}</span>
                    {lastLabel && (
                      <span className="text-[10px] text-gray-500 flex-shrink-0">Last: {lastLabel}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer: Save on desktop (small, right); on mobile full width below */}
          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col md:flex-row md:justify-end">
            <button
              type="button"
              onClick={() => handleSave(activePeriod)}
              disabled={!currentMonthWinners[activePeriod] || saving}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors w-full md:w-auto md:min-w-[7rem] ${
                !currentMonthWinners[activePeriod] || saving
                  ? 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-charcoal border-gray-300 hover:bg-gray-50'
              }`}
            >
              Save {activePeriod === 'day' ? 'Day' : 'Night'} Award
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


