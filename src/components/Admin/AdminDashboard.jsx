import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { addDays, format, parseISO, startOfMonth, subDays } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentMonthAwards } from '../../utils/shunterAwardsApi';
import { aggregateYesterdayPerformance } from '../../utils/tmPerformanceKpi';
import { weeklyPresenceSeries } from '../../utils/adminDashboard';
import AssessmentsDueCard from './AssessmentsDueCard';

const PERF_SELECT = `
  user_id,
  number_of_moves,
  report_date,
  profiles:user_id (
    first_name,
    last_name,
    show_on_reports
  )
`;

function personName(first, last) {
  const name = `${first || ''} ${last || ''}`.trim();
  return name || 'Unknown';
}

function formatAwardMoney(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return `£${value}`;
}

async function loadBestYesterday() {
  const reportForYesterday = format(new Date(), 'yyyy-MM-dd');
  const fetchDay = async (reportDate) => {
    const { data, error } = await supabase
      .from('shunter_performance')
      .select(PERF_SELECT)
      .eq('report_date', reportDate);
    if (error) throw error;
    return data || [];
  };

  let rows = await fetchDay(reportForYesterday);
  let reportDate = reportForYesterday;
  if (rows.length === 0) {
    const { data: latest, error } = await supabase
      .from('shunter_performance')
      .select('report_date')
      .order('report_date', { ascending: false })
      .limit(1);
    if (error) throw error;
    reportDate = latest?.[0]?.report_date || null;
    rows = reportDate ? await fetchDay(reportDate) : [];
  }

  const summary = aggregateYesterdayPerformance(rows);
  const workDate = reportDate ? format(subDays(parseISO(reportDate), 1), 'yyyy-MM-dd') : null;
  const isYesterday = workDate === format(subDays(new Date(), 1), 'yyyy-MM-dd');
  return {
    name: summary.best?.name || null,
    moves: summary.best?.moves ?? null,
    label: !workDate
      ? 'No performance import yet'
      : isYesterday
        ? 'Yesterday'
        : format(parseISO(workDate), 'd MMM'),
  };
}

async function loadMonthLeader() {
  const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const end = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('shunter_performance')
    .select(PERF_SELECT)
    .gte('report_date', start)
    .lte('report_date', end);
  if (error) throw error;
  const summary = aggregateYesterdayPerformance(data || []);
  return {
    name: summary.best?.name || null,
    moves: summary.best?.moves ?? null,
  };
}

async function loadAwards() {
  const awards = await getCurrentMonthAwards();
  return (awards || []).map((award) => ({
    id: award.id,
    name: personName(award.firstName, award.lastName),
    period: award.period === 'night' ? 'Night' : 'Day',
    amount: formatAwardMoney(award.amount),
  }));
}

async function loadActivity() {
  const [approvalsRes, checksRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, account_status, created_at')
      .eq('account_status', 'pending_approval')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('precheck_submissions')
      .select('id, created_at, profiles:user_id(first_name, last_name), tugs(tug_number, display_name)')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const items = [];
  if (!approvalsRes.error) {
    (approvalsRes.data || []).forEach((row) => {
      items.push({
        id: `approval-${row.id}`,
        section: 'approvals',
        title: personName(row.first_name, row.last_name),
        detail: 'Waiting for approval',
        at: row.created_at,
      });
    });
  }
  if (!checksRes.error) {
    (checksRes.data || []).forEach((row) => {
      const tug = row.tugs?.display_name || row.tugs?.tug_number || 'Tug';
      items.push({
        id: `check-${row.id}`,
        section: 'prechecks',
        title: personName(row.profiles?.first_name, row.profiles?.last_name),
        detail: `Pre-check · ${tug}`,
        at: row.created_at,
      });
    });
  }
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return items.slice(0, 6);
}

async function loadPresence() {
  const end = new Date();
  const start = subDays(end, 6);
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    dates.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }
  const { data: slots, error: slotsError } = await supabase
    .from('scheduled_rota')
    .select('id, date, user_id')
    .gte('date', dates[0])
    .lte('date', dates[6])
    .not('user_id', 'is', null);
  if (slotsError) throw slotsError;

  const ids = (slots || []).map((slot) => slot.id);
  let attendance = [];
  if (ids.length) {
    const { data, error } = await supabase
      .from('attendance')
      .select('scheduled_rota_id')
      .in('scheduled_rota_id', ids);
    if (error) throw error;
    attendance = data || [];
  }
  return weeklyPresenceSeries(slots || [], attendance, dates).map((day) => ({
    ...day,
    label: format(parseISO(day.date), 'EEE'),
  }));
}

function SummaryCard({ title, eyebrow, value, detail, empty, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-modern p-4 text-left transition hover:border-slate-300"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-rota-text-muted">{title}</p>
      <p className="mt-2 truncate text-lg font-semibold text-charcoal">{value || '—'}</p>
      <p className="mt-1 text-sm text-rota-text-muted">{empty || detail || eyebrow}</p>
    </button>
  );
}

SummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  eyebrow: PropTypes.string,
  value: PropTypes.string,
  detail: PropTypes.string,
  empty: PropTypes.string,
  onClick: PropTypes.func,
};

SummaryCard.defaultProps = {
  eyebrow: '',
  value: '',
  detail: '',
  empty: '',
  onClick: undefined,
};

export default function AdminDashboard({ onOpen, onOpenUserAssessment }) {
  const [loading, setLoading] = useState(true);
  const [best, setBest] = useState(null);
  const [leader, setLeader] = useState(null);
  const [awards, setAwards] = useState([]);
  const [activity, setActivity] = useState([]);
  const [presence, setPresence] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [bestRes, leaderRes, awardsRes, activityRes, presenceRes] = await Promise.allSettled([
        loadBestYesterday(),
        loadMonthLeader(),
        loadAwards(),
        loadActivity(),
        loadPresence(),
      ]);
      if (cancelled) return;
      setBest(bestRes.status === 'fulfilled' ? bestRes.value : null);
      setLeader(leaderRes.status === 'fulfilled' ? leaderRes.value : null);
      setAwards(awardsRes.status === 'fulfilled' ? awardsRes.value : []);
      setActivity(activityRes.status === 'fulfilled' ? activityRes.value : []);
      setPresence(presenceRes.status === 'fulfilled' ? presenceRes.value : []);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxPresent = Math.max(1, ...presence.map((day) => day.present));
  const awardValue = awards.length
    ? awards.map((award) => award.name).join(' · ')
    : '';
  const awardDetail = awards.length
    ? awards.map((award) => `${award.period}${award.amount ? ` ${award.amount}` : ''}`).join(' · ')
    : '';

  return (
    <div className="space-y-6">
      <AssessmentsDueCard onOpenUser={onOpenUserAssessment} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          title="Best yesterday"
          value={loading ? 'Loading…' : best?.name}
          detail={best?.moves != null ? `${best.moves} moves · ${best.label}` : ''}
          empty={!loading && !best?.name ? 'No moves imported' : ''}
          onClick={() => onOpen('performance')}
        />
        <SummaryCard
          title="Shunter of the Month"
          value={loading ? 'Loading…' : awardValue}
          detail={awardDetail}
          empty={!loading && !awardValue ? 'No award this month' : ''}
          onClick={() => onOpen('shunter-month')}
        />
        <SummaryCard
          title="Overall leader"
          value={loading ? 'Loading…' : leader?.name}
          detail={leader?.moves != null ? `${leader.moves} moves this month` : ''}
          empty={!loading && !leader?.name ? 'No moves this month' : ''}
          onClick={() => onOpen('performance')}
        />
      </section>

      <section className="card-modern p-4">
        <h2 className="text-sm font-semibold text-charcoal">Recent activity</h2>
        {loading ? (
          <p className="mt-3 text-sm text-rota-text-muted">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="mt-3 text-sm text-rota-text-muted">No recent approvals or pre-checks.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200/80">
            {activity.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.section)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-charcoal">{item.title}</span>
                    <span className="block truncate text-xs text-rota-text-muted">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-rota-text-muted">
                    {item.at ? format(parseISO(item.at), 'd MMM') : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-modern p-4">
        <h2 className="text-sm font-semibold text-charcoal">Weekly attendance</h2>
        <p className="mt-1 text-xs text-rota-text-muted">
          People on the rota who were not marked absent.
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-rota-text-muted">Loading…</p>
        ) : (
          <div className="mt-4 grid grid-cols-7 items-end gap-2">
            {presence.map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <span className="text-[11px] font-semibold text-charcoal">{day.present}</span>
                <div className="flex h-24 w-full items-end rounded-md bg-slate-100">
                  <div
                    className="w-full rounded-md bg-slate-700"
                    style={{ height: `${Math.max(8, Math.round((day.present / maxPresent) * 100))}%` }}
                  />
                </div>
                <span className="text-[11px] text-rota-text-muted">{day.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

AdminDashboard.propTypes = {
  onOpen: PropTypes.func.isRequired,
  onOpenUserAssessment: PropTypes.func,
};
