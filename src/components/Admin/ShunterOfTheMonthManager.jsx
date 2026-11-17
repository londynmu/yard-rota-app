import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { useToast } from '../ui/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import { safeLocalStorage } from '../../utils/safeStorage';
import {
  createOrUpdateMonthlyAward,
  getMonthlyAwards,
  getUsersLastAwards,
} from '../../utils/shunterAwardsApi';
import { supabase } from '../../lib/supabaseClient';
import {
  buildCollectiveShunterAwardEmail,
  formatEmailForClipboard,
  groupShunterAwardsByAgency,
} from '../../utils/shunterAwardEmails';
import {
  findDefaultCcAgency,
  parseAgencyEmails,
} from '../../utils/rotaAdditionalBookings';

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

/** Full month name for empty card copy, e.g. "November". */
const getMonthNameOnly = (monthKey) => {
  if (!monthKey) return 'this month';
  try {
    const [year, month] = monthKey.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    return format(d, 'MMMM');
  } catch {
    return 'this month';
  }
};

const shiftMonthKey = (monthKey, delta) => {
  const [y, m] = String(monthKey || getCurrentMonthKey()).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const reminderStorageKey = (monthKey) => `shunterReminderDismissed-${monthKey}`;

const emptyWinners = () => ({ day: null, night: null });

/** Soft Rota / dashboard tones — warm, no black-and-white slabs. */
const SLOT_TONES = {
  day: {
    shell:
      'border-rota-badge-partial-border bg-gradient-to-br from-rota-badge-partial-bg via-white to-rota-card-partial-bg',
    title: 'text-rota-badge-partial-text',
  },
  night: {
    shell:
      'border-rota-input-focus-border/40 bg-gradient-to-br from-rota-btn-primary-hover-bg via-white to-rota-page-bg-via',
    title: 'text-rota-btn-primary-hover-text',
  },
};

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

export default function ShunterOfTheMonthManager({ users, onAwardsChange }) {
  const toast = useToast();
  const [toolbarHost, setToolbarHost] = useState(null);
  const calendarMonthKey = useMemo(() => getCurrentMonthKey(), []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const findHost = () => {
      const el = document.getElementById('shunter-month-desktop-toolbar');
      if (!cancelled && el) setToolbarHost(el);
    };
    findHost();
    const intervalId = window.setInterval(findHost, 100);
    const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);
  const [saving, setSaving] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(calendarMonthKey);
  const [monthWinners, setMonthWinners] = useState(emptyWinners);
  const [lastAwardsMap, setLastAwardsMap] = useState(new Map());
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyYear, setHistoryYear] = useState('all');
  const [agencyDraftsOpen, setAgencyDraftsOpen] = useState(false);
  const [pickerPeriod, setPickerPeriod] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [reminderDismissed, setReminderDismissed] = useState(() =>
    safeLocalStorage.getItem(reminderStorageKey(calendarMonthKey)) === 'true'
  );
  const [defaultCcEmails, setDefaultCcEmails] = useState([]);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  const historyByMonth = useMemo(() => {
    const map = new Map();
    history.forEach((row) => map.set(row.monthKey, row));
    return map;
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const loadDefaultCc = async () => {
      try {
        const { data, error } = await supabase
          .from('agencies')
          .select('id, name, email, is_active')
          .eq('is_active', true);
        if (error) throw error;
        if (cancelled) return;
        const own = findDefaultCcAgency(data || []);
        setDefaultCcEmails(own ? parseAgencyEmails(own.email) : []);
      } catch (err) {
        console.error('[ShunterOfTheMonthManager] default CC load failed', err);
        if (!cancelled) setDefaultCcEmails([]);
      }
    };
    loadDefaultCc();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Day/Night cards are a draft workspace only. Saved winners live in Full history —
  // never hydrate cards from history, and reset drafts when the month changes.
  useEffect(() => {
    setMonthWinners(emptyWinners());
    setPickerPeriod(null);
    setUserSearch('');
  }, [selectedMonthKey]);

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

  const emptySlotLabel = useMemo(
    () => `Pick a shunter for ${getMonthNameOnly(selectedMonthKey)}`,
    [selectedMonthKey]
  );

  const resolveUser = (userId) => sortedUsers.find((u) => u.id === userId) || null;

  const slotMeta = (period) => {
    const userId = monthWinners[period];
    const user = userId ? resolveUser(userId) : null;
    const name = user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown'
      : null;
    const agency = user ? user.agency_name || null : null;
    return { userId, name, agency };
  };

  const pendingPeriods = useMemo(
    () => ['day', 'night'].filter((period) => Boolean(monthWinners[period])),
    [monthWinners]
  );
  const canSaveShunters = pendingPeriods.length > 0 && !saving;

  const calendarMonthIncomplete = useMemo(() => {
    const entry = historyByMonth.get(calendarMonthKey);
    return !(entry?.dayId && entry?.nightId);
  }, [historyByMonth, calendarMonthKey]);

  // Prefer live card picks for announcement; fall back to saved history per period.
  const monthAwardRows = useMemo(() => {
    const entry = historyByMonth.get(selectedMonthKey);
    const awards = [];

    const fromCard = (period) => {
      const userId = monthWinners[period];
      if (!userId) return null;
      const user = sortedUsers.find((u) => u.id === userId) || null;
      if (!user) return null;
      const fullName =
        [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
      const amount =
        period === 'day' ? entry?.dayAmount ?? 50 : entry?.nightAmount ?? 50;
      return {
        period,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        fullName,
        amount,
        agencyId: user.agency_id || null,
        agencyName: user.agency_name || null,
        agencyEmail: null,
        userId: user.id,
      };
    };

    const fromHistory = (period) => {
      if (!entry) return null;
      if (period === 'day' && entry.dayUserId) {
        return {
          period: 'day',
          firstName: entry.dayName?.split(' ')[0],
          lastName: entry.dayName?.split(' ').slice(1).join(' '),
          fullName: entry.dayName,
          amount: entry.dayAmount,
          agencyId: entry.dayAgencyId,
          agencyName: entry.dayAgency,
          agencyEmail: entry.dayEmail,
          userId: entry.dayUserId,
        };
      }
      if (period === 'night' && entry.nightUserId) {
        return {
          period: 'night',
          firstName: entry.nightName?.split(' ')[0],
          lastName: entry.nightName?.split(' ').slice(1).join(' '),
          fullName: entry.nightName,
          amount: entry.nightAmount,
          agencyId: entry.nightAgencyId,
          agencyName: entry.nightAgency,
          agencyEmail: entry.nightEmail,
          userId: entry.nightUserId,
        };
      }
      return null;
    };

    const day = fromCard('day') || fromHistory('day');
    const night = fromCard('night') || fromHistory('night');
    if (day) awards.push(day);
    if (night) awards.push(night);
    return awards;
  }, [historyByMonth, selectedMonthKey, monthWinners, sortedUsers]);

  const selectedComplete = useMemo(
    () =>
      monthAwardRows.some((row) => row.period === 'day') &&
      monthAwardRows.some((row) => row.period === 'night'),
    [monthAwardRows]
  );

  const collectiveEmail = useMemo(() => {
    if (!selectedComplete) return null;
    return buildCollectiveShunterAwardEmail({
      monthKey: selectedMonthKey,
      winners: monthAwardRows,
    });
  }, [monthAwardRows, selectedComplete, selectedMonthKey]);

  const emailGroups = useMemo(
    () => groupShunterAwardsByAgency(monthAwardRows, selectedMonthKey, {
      ccEmails: defaultCcEmails,
    }),
    [monthAwardRows, selectedMonthKey, defaultCcEmails]
  );

  const closePickerModal = () => {
    setPickerPeriod(null);
    setUserSearch('');
  };

  const openPickerModal = (period) => {
    if (saving) return;
    setPickerPeriod(period);
    setUserSearch('');
  };

  const selectShunterFromModal = (period, userId) => {
    setMonthWinners((prev) => ({ ...prev, [period]: userId }));
    setPickerPeriod(null);
    setUserSearch('');
  };

  const handleSaveConfirm = async () => {
    const toSave = ['day', 'night']
      .map((period) => ({ period, userId: monthWinners[period] }))
      .filter((item) => item.userId);
    if (toSave.length === 0) {
      toast.error('Select a shunter before saving.');
      return;
    }

    try {
      setSaving(true);
      for (const item of toSave) {
        await createOrUpdateMonthlyAward({
          awardMonthKey: selectedMonthKey,
          period: item.period,
          userId: item.userId,
        });
      }
      toast.success(
        toSave.length === 1 ? 'Award saved successfully.' : 'Awards saved successfully.'
      );
      // Clear cards after save — history shows the winners.
      setMonthWinners(emptyWinners());
      setPickerPeriod(null);
      setUserSearch('');

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
      console.error('[ShunterOfTheMonthManager] handleSaveConfirm error:', err);
      toast.error('Could not save award.');
    } finally {
      setSaving(false);
      setConfirmSaveOpen(false);
    }
  };

  const handleDismissReminder = () => {
    safeLocalStorage.setItem(reminderStorageKey(calendarMonthKey), 'true');
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

  const copyCollectiveAnnouncement = async () => {
    if (!collectiveEmail) return;
    try {
      await navigator.clipboard.writeText(formatEmailForClipboard(collectiveEmail));
      toast.success('Announcement copied to clipboard');
    } catch (err) {
      console.error(err);
      toast.error('Could not copy announcement');
    }
  };

  const renderSlot = (period) => {
    const label = period === 'day' ? 'Day' : 'Night / Afternoon';
    const tone = period === 'day' ? SLOT_TONES.day : SLOT_TONES.night;
    const meta = slotMeta(period);
    const openLabel =
      period === 'day' ? 'Open day shunter picker' : 'Open night shunter picker';

    return (
      <button
        key={period}
        type="button"
        aria-label={openLabel}
        disabled={saving}
        onClick={() => openPickerModal(period)}
        className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left shadow-soft transition hover:brightness-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-rota-input-focus-border disabled:cursor-not-allowed disabled:opacity-60 ${tone.shell}`}
      >
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone.title}`}>
          {label}
        </p>
        {meta.name ? (
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold tracking-tight text-rota-text-primary sm:text-2xl">
              {meta.name}
            </p>
            <p className="mt-1 text-sm text-rota-text-muted">
              {meta.agency || 'No agency'}
            </p>
          </div>
        ) : (
          <p className="py-2 text-base text-rota-text-muted-light">{emptySlotLabel}</p>
        )}
      </button>
    );
  };

  const pickerModalLabel =
    pickerPeriod === 'night' ? 'Night / Afternoon' : 'Day';
  const pickerModalTitle = pickerPeriod
    ? `Pick ${pickerModalLabel.toLowerCase()} shunter`
    : 'Pick a shunter';

  // Same logo-bar month controls as Rota / Breaks / Availability date nav.
  const toolbarControls = (
    <div className="flex min-w-0 flex-nowrap items-center justify-center gap-x-1 md:gap-x-2">
      <button
        type="button"
        aria-label="Previous month"
        className="rounded-full p-1.5 text-charcoal transition-colors hover:bg-gray-100"
        onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="min-w-0 truncate px-0.5 text-center text-sm font-semibold text-charcoal md:min-w-[5.5rem] md:px-1">
        {getMonthLabel(selectedMonthKey)}
      </span>

      <button
        type="button"
        aria-label="Next month"
        className="rounded-full p-1.5 text-charcoal transition-colors hover:bg-gray-100"
        onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="hidden h-4 w-px bg-gray-200 md:block" aria-hidden="true" />

      <button
        type="button"
        onClick={() => setSelectedMonthKey(calendarMonthKey)}
        className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-charcoal md:inline"
      >
        Current month
      </button>
    </div>
  );

  const headerToolbarPortal = toolbarHost
    ? createPortal(
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2 overflow-visible">
        {toolbarControls}
      </div>,
      toolbarHost,
    )
    : null;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {headerToolbarPortal}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="h-40 rounded-2xl border border-rota-badge-partial-border bg-rota-badge-partial-bg/50" />
          <div className="h-40 rounded-2xl border border-rota-toolbar-border bg-rota-btn-primary-hover-bg/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {headerToolbarPortal}

      {calendarMonthIncomplete && !reminderDismissed && (
        <div className="flex flex-col gap-3 rounded-2xl border border-rota-badge-partial-border bg-gradient-to-r from-rota-badge-partial-bg via-white to-rota-card-partial-bg p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-rota-badge-partial-text">
              Time to pick Shunter of the Month
            </p>
            <p className="mt-0.5 text-xs text-rota-text-muted">
              {getMonthLabel(calendarMonthKey)} still needs Day and/or Night winners.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissReminder}
            className="rounded-lg border border-rota-toolbar-border bg-white px-3 py-1.5 text-xs font-medium text-rota-text-primary transition hover:bg-rota-day-other-bg-from"
          >
            Dismiss for this month
          </button>
        </div>
      )}

      {/* Copy announcement + optional agency drafts */}
      {selectedComplete && collectiveEmail && (
        <section className="overflow-hidden rounded-2xl border border-rota-toolbar-border bg-rota-modal-bg shadow-soft">
          <div className="border-b border-rota-toolbar-border bg-gradient-to-r from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to px-4 py-3">
            <h2 className="text-sm font-semibold text-rota-text-primary">Copy announcement</h2>
            <p className="mt-0.5 text-xs text-rota-text-muted">
              Copy and paste into your group mailbox — nothing is sent automatically.
            </p>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
            <div className="space-y-2 rounded-xl border border-rota-toolbar-border bg-gradient-to-br from-white to-rota-page-bg-via/40 p-3 shadow-sm">
              <p className="text-xs font-semibold text-rota-text-primary">
                Subject: {collectiveEmail.subject}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-rota-text-primary">
                {collectiveEmail.body}
              </pre>
              <button
                type="button"
                className="rounded-lg border border-rota-toolbar-border bg-white px-3 py-1.5 text-xs font-semibold text-rota-text-primary transition hover:bg-rota-day-other-bg-from"
                onClick={copyCollectiveAnnouncement}
              >
                Copy
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-rota-toolbar-border bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAgencyDraftsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-rota-btn-primary-hover-bg/50"
              >
                <span className="text-xs font-semibold text-rota-text-primary">
                  Agency drafts (optional)
                </span>
                <svg
                  className={`h-3.5 w-3.5 text-rota-text-muted transition-transform ${agencyDraftsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {agencyDraftsOpen && (
                <div className="space-y-2 border-t border-rota-toolbar-border p-3">
                  {emailGroups.length === 0 ? (
                    <p className="text-xs text-rota-text-muted">No agency drafts.</p>
                  ) : (
                    emailGroups.map((group) => (
                      <div
                        key={group.key}
                        className={`rounded-xl border p-3 shadow-sm ${
                          group.hasEmail
                            ? 'border-rota-toolbar-border bg-gradient-to-br from-white to-rota-page-bg-via/30'
                            : 'border-rota-badge-partial-border bg-rota-badge-partial-bg/40'
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-rota-text-primary">{group.agencyName}</p>
                            <p className="mt-0.5 text-[11px] text-rota-text-muted">
                              {group.hasEmail
                                ? `To: ${group.emails.join(', ')}`
                                : 'No email on file — copy the message manually'}
                            </p>
                            {group.hasEmail && defaultCcEmails.length > 0 && (
                              <p className="text-[11px] text-rota-text-muted">
                                CC: Evri4you ({defaultCcEmails.join(', ')})
                              </p>
                            )}
                            <ul className="mt-1.5 space-y-0.5">
                              {group.winners.map((w) => (
                                <li key={`${w.period}-${w.userId}`} className="text-xs text-rota-text-primary">
                                  <span className="font-medium">
                                    {w.period === 'day' ? 'Day' : 'Night'}:
                                  </span>{' '}
                                  {w.fullName}
                                  {w.agencyName ? ` (${w.agencyName})` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="flex flex-shrink-0 flex-col gap-1.5 sm:flex-row">
                            {group.hasEmail && (
                              <button
                                type="button"
                                className="rounded-lg border border-rota-toolbar-border bg-white px-2.5 py-1.5 text-xs font-medium text-rota-text-primary transition hover:bg-rota-day-other-bg-from"
                                onClick={() => openEmailDraft(group)}
                              >
                                Open email draft
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded-lg border border-rota-toolbar-border bg-white px-2.5 py-1.5 text-xs font-medium text-rota-text-primary transition hover:bg-rota-day-other-bg-from"
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
              )}
            </div>
          </div>
        </section>
      )}

      {/* Day / Night pickers + Full history in one container */}
      <section className="overflow-hidden rounded-2xl border border-rota-toolbar-border bg-rota-modal-bg shadow-soft">
        <div className="border-b border-rota-toolbar-border bg-gradient-to-r from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to px-4 py-3">
          <p className="text-sm font-semibold text-rota-text-primary">
            Pick winners · {getMonthLabel(selectedMonthKey)}
          </p>
          <p className="mt-0.5 text-xs text-rota-text-muted">
            Choose Day and Night winners, then use Confirm Award below. Past months stay in history.
          </p>
        </div>

        <div className="space-y-3 border-b border-rota-toolbar-border p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {renderSlot('day')}
            {renderSlot('night')}
          </div>

          <button
            type="button"
            onClick={() => setConfirmSaveOpen(true)}
            disabled={!canSaveShunters}
            className="w-full rounded-xl border-2 border-charcoal bg-white px-4 py-2.5 text-sm font-semibold text-charcoal transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm Award
          </button>

          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-rota-toolbar-border bg-white px-3 py-2.5 text-left transition hover:bg-rota-day-other-bg-from/40"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-rota-text-primary">Full history</p>
              {history.length > 0 && (
                <span className="text-[10px] text-rota-text-muted">({history.length} months)</span>
              )}
            </div>
            <svg
              className={`h-3.5 w-3.5 text-rota-text-muted transition-transform ${historyOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {historyOpen && (
          <div className="space-y-2 p-3">
            {historyYears.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setHistoryYear('all')}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    historyYear === 'all'
                      ? 'border-charcoal bg-rota-day-other-bg-from text-rota-text-primary'
                      : 'border-rota-toolbar-border bg-white text-rota-text-muted hover:bg-rota-day-other-bg-from/50'
                  }`}
                >
                  All
                </button>
                {historyYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setHistoryYear(year)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      historyYear === year
                        ? 'border-charcoal bg-rota-day-other-bg-from text-rota-text-primary'
                        : 'border-rota-toolbar-border bg-white text-rota-text-muted hover:bg-rota-day-other-bg-from/50'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[min(60vh,360px)] space-y-1.5 overflow-y-auto">
              {filteredHistory.length === 0 ? (
                <p className="px-1 py-2 text-xs text-rota-text-muted">No awards recorded yet.</p>
              ) : (
                filteredHistory.map((row, index) => {
                  const complete = row.dayId && row.nightId;
                  const isSelected = row.monthKey === selectedMonthKey;
                  const softTone =
                    index % 2 === 0
                      ? 'border-rota-card-partial-border/60 bg-rota-card-partial-bg'
                      : 'border-rota-toolbar-border bg-gradient-to-r from-white to-rota-page-bg-via/50';
                  const incompleteTone =
                    'border-rota-badge-partial-low-border bg-rota-card-partial-low-bg';
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
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl px-3 py-2 shadow-sm transition hover:shadow-md md:flex-row md:items-center md:gap-3 ${
                        complete ? softTone : incompleteTone
                      } ${isSelected ? 'ring-2 ring-rota-badge-partial-border' : ''}`}
                    >
                      <span className="flex-shrink-0 text-xs font-semibold text-rota-text-primary md:w-24">
                        {getMonthLabel(row.monthKey)}
                      </span>
                      <div className="min-w-0 md:flex-1">
                        <span className="truncate text-xs text-rota-text-primary">
                          {row.dayName || '—'}
                          {row.dayAgency ? (
                            <span className="text-rota-text-muted-light"> · {row.dayAgency}</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="min-w-0 md:flex-1">
                        <span className="truncate text-xs text-rota-text-primary">
                          {row.nightName || '—'}
                          {row.nightAgency ? (
                            <span className="text-rota-text-muted-light"> · {row.nightAgency}</span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      <Modal
        isOpen={Boolean(pickerPeriod)}
        onClose={closePickerModal}
        className="flex max-h-[min(85vh,36rem)] flex-col p-0"
      >
        <div className="border-b border-rota-modal-border px-5 py-4">
          <h2 className="text-xl font-semibold text-charcoal">{pickerModalTitle}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {getMonthLabel(selectedMonthKey)} · choose a name to put them on the card.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-3">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Search by name or agency..."
            className="admin-input mb-3 w-full text-sm"
            autoFocus
          />
          <div className="max-h-[min(55vh,22rem)] divide-y divide-rota-toolbar-border overflow-y-auto rounded-xl border border-rota-toolbar-border bg-white">
            {filteredUserList.length === 0 ? (
              <div className="py-6 text-center text-sm text-rota-text-muted">No users match.</div>
            ) : (
              filteredUserList.map((user) => {
                const fullName =
                  [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unknown';
                const isSelected = monthWinners[pickerPeriod] === user.id;
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
                    onClick={() => selectShunterFromModal(pickerPeriod, user.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-l-2 border-rota-badge-partial-border bg-rota-badge-partial-bg'
                        : 'hover:bg-rota-btn-primary-hover-bg/60'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-rota-text-primary">
                        {fullName}
                      </span>
                      {user.agency_name && (
                        <span className="block truncate text-xs text-rota-text-muted">
                          {user.agency_name}
                        </span>
                      )}
                    </span>
                    {lastLabel && (
                      <span className="flex-shrink-0 text-[10px] text-rota-text-muted-light">
                        Last: {lastLabel}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmSaveOpen}
        onClose={() => setConfirmSaveOpen(false)}
        onConfirm={handleSaveConfirm}
        title="Are you sure?"
        message={`Save the selected Shunter of the Month winner${pendingPeriods.length > 1 ? 's' : ''} for ${getMonthLabel(selectedMonthKey)}?`}
        confirmText="Save"
        cancelText="Cancel"
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
