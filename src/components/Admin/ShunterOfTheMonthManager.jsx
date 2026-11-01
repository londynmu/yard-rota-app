import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { useToast } from '../ui/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  createOrUpdateMonthlyAward,
  getMonthlyAwards,
  getUsersLastAwards,
  deleteAwardById,
} from '../../utils/shunterAwardsApi';
import {
  formatEmailForClipboard,
  groupShunterAwardsByAgency,
} from '../../utils/shunterAwardEmails';

const outlineBtn =
  'px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-300 bg-white text-charcoal hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50';

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
    return format(d, 'MMM yyyy');
  } catch {
    return monthKey;
  }
};

const shiftMonthKey = (monthKey, delta) => {
  const [y, m] = String(monthKey || getCurrentMonthKey()).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const reminderStorageKey = (monthKey) => `shunterReminderDismissed-${monthKey}`;

const emptyWinners = () => ({ day: null, night: null });

const groupHistoryFromRows = (historyRows) => {
  const grouped = {};
  (historyRows || []).forEach((row) => {
    const mk = row.awardMonth;
    if (!mk) return;
    if (!grouped[mk]) {
      grouped[mk] = {
        monthKey: mk,
        dayName: null,
        nightName: null,
        dayId: null,
        nightId: null,
        dayUserId: null,
        nightUserId: null,
        dayAgency: null,
        nightAgency: null,
        dayAmount: 50,
        nightAmount: 50,
        dayEmail: null,
        nightEmail: null,
        dayAgencyId: null,
        nightAgencyId: null,
      };
    }
    const entry = grouped[mk];
    const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unknown';
    if (row.period === 'day') {
      entry.dayName = fullName;
      entry.dayId = row.id;
      entry.dayUserId = row.userId || null;
      entry.dayAgency = row.agencyName || null;
      entry.dayAgencyId = row.agencyId || null;
      entry.dayEmail = row.agencyEmail || null;
      entry.dayAmount = row.amount ?? 50;
    }
    if (row.period === 'night') {
      entry.nightName = fullName;
      entry.nightId = row.id;
      entry.nightUserId = row.userId || null;
      entry.nightAgency = row.agencyName || null;
      entry.nightAgencyId = row.agencyId || null;
      entry.nightEmail = row.agencyEmail || null;
      entry.nightAmount = row.amount ?? 50;
    }
  });

  return Object.values(grouped).sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : -1
  );
};

const winnersFromHistoryEntry = (entry) => ({
  day: entry?.dayUserId || null,
  night: entry?.nightUserId || null,
});

export default function ShunterOfTheMonthManager({ users, onAwardsChange }) {
  const toast = useToast();
  const calendarMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(calendarMonthKey);
  const [monthWinners, setMonthWinners] = useState(emptyWinners);
  const [lastAwardsMap, setLastAwardsMap] = useState(new Map());
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyYear, setHistoryYear] = useState('all');
  const [pickerPeriod, setPickerPeriod] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [reminderDismissed, setReminderDismissed] = useState(() =>
    localStorage.getItem(reminderStorageKey(calendarMonthKey)) === 'true'
  );
  const [confirmDelete, setConfirmDelete] = useState({
    open: false,
    monthKey: null,
    period: null,
  });

  const historyByMonth = useMemo(() => {
    const map = new Map();
    history.forEach((row) => map.set(row.monthKey, row));
    return map;
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        const [lastMap, historyRows] = await Promise.all([
          getUsersLastAwards(),
          getMonthlyAwards(),
        ]);
        if (cancelled) return;
        setLastAwardsMap(lastMap);
        setHistory(groupHistoryFromRows(historyRows));
      } catch (err) {
        console.error('[ShunterOfTheMonthManager] loadData error:', err);
        if (!cancelled) toast.error('Failed to load Shunter of the Month data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const prevSelectedMonthRef = useRef(null);

  useEffect(() => {
    const entry = historyByMonth.get(selectedMonthKey);
    const fromHistory = entry ? winnersFromHistoryEntry(entry) : emptyWinners();
    const monthChanged = prevSelectedMonthRef.current !== selectedMonthKey;
    prevSelectedMonthRef.current = selectedMonthKey;

    if (monthChanged) {
      setMonthWinners(fromHistory);
      setPickerPeriod(null);
      setUserSearch('');
      return;
    }

    // Same month, history refreshed (save/delete/load): keep dirty unsaved picks
    setMonthWinners((prev) => ({
      day:
        prev.day != null && prev.day !== fromHistory.day
          ? prev.day
          : fromHistory.day,
      night:
        prev.night != null && prev.night !== fromHistory.night
          ? prev.night
          : fromHistory.night,
    }));
  }, [selectedMonthKey, historyByMonth]);

  const sortedUsers = useMemo(() => {
    return [...(users || [])].sort((a, b) => {
      const aName = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
      const bName = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [users]);

  const usersForPeriod = useMemo(() => {
    if (!pickerPeriod) return [];
    return sortedUsers.filter((u) => {
      const pref = (u.shift_preference || '').toLowerCase();
      if (pickerPeriod === 'day') {
        return pref === 'day' || !pref;
      }
      return pref === 'night' || pref === 'afternoon' || !pref;
    });
  }, [sortedUsers, pickerPeriod]);

  const filteredUserList = useMemo(() => {
    const q = (userSearch || '').trim().toLowerCase();
    if (!q) return usersForPeriod;
    return usersForPeriod.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const agency = (u.agency_name || '').toLowerCase();
      return name.includes(q) || agency.includes(q);
    });
  }, [usersForPeriod, userSearch]);

  const historyYears = useMemo(() => {
    const years = new Set();
    history.forEach((row) => {
      const y = String(row.monthKey || '').slice(0, 4);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => (a < b ? 1 : -1));
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (historyYear === 'all') return history;
    return history.filter((row) => String(row.monthKey).startsWith(historyYear));
  }, [history, historyYear]);

  const resolveUser = useCallback(
    (userId) => sortedUsers.find((u) => u.id === userId) || null,
    [sortedUsers]
  );

  const slotMeta = useCallback(
    (period) => {
      const userId = monthWinners[period];
      const historyEntry = historyByMonth.get(selectedMonthKey);
      const user = userId ? resolveUser(userId) : null;
      const fromHistoryName =
        period === 'day' ? historyEntry?.dayName : historyEntry?.nightName;
      const fromHistoryAgency =
        period === 'day' ? historyEntry?.dayAgency : historyEntry?.nightAgency;
      const name = user
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown'
        : fromHistoryName || null;
      // Selected user: their agency only (null if none). Do not fall back to the
      // previous saved winner's agency when a different user is picked.
      const agency = user
        ? user.agency_name || null
        : userId
          ? fromHistoryAgency || null
          : null;
      return { userId, name, agency };
    },
    [monthWinners, historyByMonth, selectedMonthKey, resolveUser]
  );

  const calendarMonthIncomplete = useMemo(() => {
    const entry = historyByMonth.get(calendarMonthKey);
    return !(entry?.dayId && entry?.nightId);
  }, [historyByMonth, calendarMonthKey]);

  const selectedComplete = useMemo(() => {
    const entry = historyByMonth.get(selectedMonthKey);
    return Boolean(entry?.dayId && entry?.nightId);
  }, [historyByMonth, selectedMonthKey]);

  const emailGroups = useMemo(() => {
    if (!selectedComplete) return [];
    const entry = historyByMonth.get(selectedMonthKey);
    if (!entry) return [];
    const awards = [];
    if (entry.dayUserId) {
      awards.push({
        period: 'day',
        firstName: entry.dayName?.split(' ')[0],
        lastName: entry.dayName?.split(' ').slice(1).join(' '),
        fullName: entry.dayName,
        amount: entry.dayAmount,
        agencyId: entry.dayAgencyId,
        agencyName: entry.dayAgency,
        agencyEmail: entry.dayEmail,
        userId: entry.dayUserId,
      });
    }
    if (entry.nightUserId) {
      awards.push({
        period: 'night',
        firstName: entry.nightName?.split(' ')[0],
        lastName: entry.nightName?.split(' ').slice(1).join(' '),
        fullName: entry.nightName,
        amount: entry.nightAmount,
        agencyId: entry.nightAgencyId,
        agencyName: entry.nightAgency,
        agencyEmail: entry.nightEmail,
        userId: entry.nightUserId,
      });
    }
    return groupShunterAwardsByAgency(awards, selectedMonthKey);
  }, [selectedComplete, historyByMonth, selectedMonthKey]);

  const handleSave = async (period) => {
    const userId = monthWinners[period];
    if (!userId) {
      toast.error('Select a user before saving.');
      return;
    }

    try {
      setSaving(true);
      await createOrUpdateMonthlyAward({
        awardMonthKey: selectedMonthKey,
        period,
        userId,
      });
      toast.success('Award saved successfully.');

      const [lastMap, historyRows] = await Promise.all([
        getUsersLastAwards(),
        getMonthlyAwards(),
      ]);
      setLastAwardsMap(lastMap);
      setHistory(groupHistoryFromRows(historyRows));
      if (typeof onAwardsChange === 'function') {
        onAwardsChange();
      }
    } catch (err) {
      console.error('[ShunterOfTheMonthManager] handleSave error:', err);
      toast.error('Could not save award.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    const { monthKey, period } = confirmDelete;
    const entry = history.find((h) => h.monthKey === monthKey);
    if (!entry || !period) return;
    const awardId = period === 'day' ? entry.dayId : entry.nightId;
    if (!awardId) return;

    try {
      setSaving(true);
      await deleteAwardById(awardId);
      toast.success('Award removed.');

      setHistory((prev) =>
        prev.map((row) => {
          if (row.monthKey !== monthKey) return row;
          if (period === 'day') {
            return {
              ...row,
              dayName: null,
              dayId: null,
              dayUserId: null,
              dayAgency: null,
              dayAgencyId: null,
              dayEmail: null,
            };
          }
          return {
            ...row,
            nightName: null,
            nightId: null,
            nightUserId: null,
            nightAgency: null,
            nightAgencyId: null,
            nightEmail: null,
          };
        })
      );

      const lastMap = await getUsersLastAwards();
      setLastAwardsMap(lastMap);
      if (typeof onAwardsChange === 'function') {
        onAwardsChange();
      }
    } catch (err) {
      console.error('[ShunterOfTheMonthManager] handleDeleteConfirm error:', err);
      toast.error('Could not remove award.');
    } finally {
      setSaving(false);
      setConfirmDelete({ open: false, monthKey: null, period: null });
    }
  };

  const handleDismissReminder = () => {
    localStorage.setItem(reminderStorageKey(calendarMonthKey), 'true');
    setReminderDismissed(true);
  };

  const openEmailDraft = async (group) => {
    if (!group?.hasEmail || !group.mailtoHref) {
      toast.error('This agency has no email address');
      return;
    }
    if (group.mailtoTooLong) {
      try {
        await navigator.clipboard.writeText(
          formatEmailForClipboard({ subject: group.subject, body: group.body })
        );
        toast.success('Email too long for mail app — copied to clipboard');
      } catch (err) {
        console.error(err);
        toast.error('Could not copy email');
      }
      return;
    }
    window.location.href = group.mailtoHref;
  };

  const copyEmailDraft = async (group) => {
    try {
      await navigator.clipboard.writeText(
        formatEmailForClipboard({ subject: group.subject, body: group.body })
      );
      toast.success('Email copied to clipboard');
    } catch (err) {
      console.error(err);
      toast.error('Could not copy email');
    }
  };

  const renderSlot = (period) => {
    const label = period === 'day' ? 'Day' : 'Night / Afternoon';
    const meta = slotMeta(period);
    const isPickerOpen = pickerPeriod === period;

    return (
      <div
        key={period}
        className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-charcoal">{label}</p>
          <button
            type="button"
            className={outlineBtn}
            onClick={() => {
              setPickerPeriod(isPickerOpen ? null : period);
              setUserSearch('');
            }}
          >
            {meta.userId ? 'Change' : 'Choose'}
          </button>
        </div>

        {meta.name ? (
          <div>
            <p className="text-sm font-semibold text-charcoal">{meta.name}</p>
            <p className="text-[11px] text-gray-500">
              {meta.agency || 'No agency'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Not set</p>
        )}

        {isPickerOpen && (
          <div className="mt-1 rounded-lg border border-slate-200 bg-white overflow-hidden">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name or agency..."
              className="w-full bg-white border-b border-slate-200 px-2.5 py-2 text-xs text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <div className="max-h-[180px] overflow-y-auto divide-y divide-slate-100">
              {filteredUserList.length === 0 ? (
                <div className="py-3 text-center text-xs text-gray-500">No users match.</div>
              ) : (
                filteredUserList.map((user) => {
                  const fullName =
                    [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
                  const isSelected = monthWinners[period] === user.id;
                  const last = lastAwardsMap.get(user.id) || { day: null, night: null };
                  const latestKey =
                    last.day && last.night
                      ? last.day >= last.night
                        ? last.day
                        : last.night
                      : last.day || last.night;
                  const lastLabel = latestKey ? getMonthLabel(latestKey) : null;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setMonthWinners((prev) => ({ ...prev, [period]: user.id }));
                        setPickerPeriod(null);
                        setUserSearch('');
                      }}
                      className={`w-full px-2.5 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-amber-50 border-l-2 border-amber-500'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-charcoal truncate">
                          {fullName}
                        </span>
                        {user.agency_name && (
                          <span className="block text-[10px] text-gray-500 truncate">
                            {user.agency_name}
                          </span>
                        )}
                      </span>
                      {lastLabel && (
                        <span className="text-[10px] text-gray-500 flex-shrink-0">
                          Last: {lastLabel}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="mt-auto pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => handleSave(period)}
            disabled={!monthWinners[period] || saving}
            className={`${outlineBtn} w-full`}
          >
            Save {period === 'day' ? 'Day' : 'Night'}
          </button>
        </div>
      </div>
    );
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
      {calendarMonthIncomplete && !reminderDismissed && (
        <div className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-charcoal">
              Time to pick Shunter of the Month
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              {getMonthLabel(calendarMonthKey)} still needs Day and/or Night winners.
            </p>
          </div>
          <button type="button" onClick={handleDismissReminder} className={outlineBtn}>
            Dismiss for this month
          </button>
        </div>
      )}

      {/* Month workspace */}
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-red-200/60 bg-red-50 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-red-800">Month workspace</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              className={outlineBtn}
              onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))}
            >
              ‹
            </button>
            <span className="min-w-[5.5rem] text-center text-xs font-semibold text-charcoal">
              {getMonthLabel(selectedMonthKey)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              className={outlineBtn}
              onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))}
            >
              ›
            </button>
          </div>
        </div>
        <div className="p-3 bg-yellow-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderSlot('day')}
            {renderSlot('night')}
          </div>
        </div>
      </div>

      {/* Prepare agency emails */}
      {selectedComplete && (
        <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-red-200/60 bg-red-50">
            <h2 className="text-sm font-semibold text-red-800">Prepare agency emails</h2>
            <p className="text-[11px] text-red-800/80 mt-0.5">
              Opens a draft in your mail app — nothing is sent automatically.
            </p>
          </div>
          <div className="p-3 bg-yellow-50/50 space-y-2">
            {emailGroups.length === 0 ? (
              <p className="text-xs text-gray-500">No winners to email.</p>
            ) : (
              emailGroups.map((group) => (
                <div
                  key={group.key}
                  className={`rounded-xl border bg-white p-3 shadow-sm ${
                    group.hasEmail ? 'border-blue-200' : 'border-amber-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-charcoal">{group.agencyName}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {group.hasEmail
                          ? group.emails.join(', ')
                          : 'No email on file — copy the message manually'}
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {group.winners.map((w) => (
                          <li key={`${w.period}-${w.userId}`} className="text-xs text-charcoal">
                            <span className="font-medium">
                              {w.period === 'day' ? 'Day' : 'Night'}:
                            </span>{' '}
                            {w.fullName}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                      {group.hasEmail && (
                        <button
                          type="button"
                          className={outlineBtn}
                          onClick={() => openEmailDraft(group)}
                        >
                          Open email draft
                        </button>
                      )}
                      <button
                        type="button"
                        className={outlineBtn}
                        onClick={() => copyEmailDraft(group)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="w-full px-3 py-2 flex items-center justify-between bg-red-50 hover:bg-red-100/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-red-800">Full history</p>
            {history.length > 0 && (
              <span className="text-[10px] text-red-800/70">({history.length} months)</span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 text-red-700 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {historyOpen && (
          <div className="border-t border-red-100 p-2 bg-yellow-50/50 space-y-2">
            {historyYears.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                <button
                  type="button"
                  onClick={() => setHistoryYear('all')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md border ${
                    historyYear === 'all'
                      ? 'bg-white border-charcoal text-charcoal'
                      : 'bg-white/70 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  All
                </button>
                {historyYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setHistoryYear(year)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md border ${
                      historyYear === year
                        ? 'bg-white border-charcoal text-charcoal'
                        : 'bg-white/70 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[min(60vh,360px)] overflow-y-auto space-y-1.5">
              {filteredHistory.length === 0 ? (
                <p className="text-xs text-gray-500 py-2 px-1">No awards recorded yet.</p>
              ) : (
                filteredHistory.map((row) => {
                  const complete = row.dayId && row.nightId;
                  const isSelected = row.monthKey === selectedMonthKey;
                  const cardStyle = complete
                    ? 'border border-green-200 bg-white'
                    : 'border border-amber-200 bg-white';
                  return (
                    <div
                      key={row.monthKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedMonthKey(row.monthKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedMonthKey(row.monthKey);
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1.5 flex flex-col md:flex-row md:items-center gap-1 md:gap-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${cardStyle} ${
                        isSelected ? 'ring-2 ring-red-300' : ''
                      }`}
                    >
                      <span className="text-xs font-semibold text-charcoal md:w-24 flex-shrink-0">
                        {getMonthLabel(row.monthKey)}
                      </span>
                      <div className="flex items-center gap-1 md:flex-1 min-w-0">
                        <span className="text-xs text-charcoal truncate">
                          {row.dayName || '—'}
                          {row.dayAgency ? (
                            <span className="text-gray-400"> · {row.dayAgency}</span>
                          ) : null}
                        </span>
                        {row.dayId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete({
                                open: true,
                                monthKey: row.monthKey,
                                period: 'day',
                              });
                            }}
                            disabled={saving}
                            className="text-gray-400 hover:text-red-600 text-xs p-0.5 flex-shrink-0"
                            title="Remove Day award"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:flex-1 min-w-0">
                        <span className="text-xs text-charcoal truncate">
                          {row.nightName || '—'}
                          {row.nightAgency ? (
                            <span className="text-gray-400"> · {row.nightAgency}</span>
                          ) : null}
                        </span>
                        {row.nightId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete({
                                open: true,
                                monthKey: row.monthKey,
                                period: 'night',
                              });
                            }}
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
                })
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, monthKey: null, period: null })}
        onConfirm={handleDeleteConfirm}
        title="Remove award?"
        message="Remove this award from history? You can set a new winner afterwards."
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive
      />
    </div>
  );
}

ShunterOfTheMonthManager.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onAwardsChange: PropTypes.func,
};

ShunterOfTheMonthManager.defaultProps = {
  onAwardsChange: undefined,
};
