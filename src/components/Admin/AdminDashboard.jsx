import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { addDays, format, parseISO, startOfMonth, subDays } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { getCurrentMonthAwards } from '../../utils/shunterAwardsApi';
import { aggregateYesterdayPerformance } from '../../utils/tmPerformanceKpi';
import { weeklyPresenceSeries } from '../../utils/adminDashboard';
import {
  diversifySystemItems,
  formatAssessmentActivityItem,
  formatSystemActivityItem,
  interleaveActivityItems,
  targetUserIdFromPayload,
} from '../../utils/adminDashboardActivity';
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
  const [approvalsRes, checksRes, assessmentsRes, systemRes] = await Promise.all([
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
    supabase
      .from('shunter_assessments')
      .select(`
        id,
        user_id,
        assessment_date,
        created_at,
        updated_at,
        profiles:user_id ( first_name, last_name ),
        created_by_profile:created_by ( first_name, last_name )
      `)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.rpc('get_system_activity_log', {
      days_back: 7,
      limit_count: 40,
      entity_type_filter: null,
      user_id_filter: null,
    }),
  ]);

  const approvalItems = [];
  if (!approvalsRes.error) {
    (approvalsRes.data || []).forEach((row) => {
      approvalItems.push({
        id: `approval-${row.id}`,
        kind: 'approval',
        section: 'approvals',
        title: personName(row.first_name, row.last_name),
        detail: 'Waiting for approval',
        at: row.created_at,
      });
    });
  }

  const checkItems = [];
  if (!checksRes.error) {
    (checksRes.data || []).forEach((row) => {
      const tug = row.tugs?.display_name || row.tugs?.tug_number || 'Tug';
      checkItems.push({
        id: `check-${row.id}`,
        kind: 'precheck',
        section: 'prechecks',
        title: personName(row.profiles?.first_name, row.profiles?.last_name),
        detail: `Pre-check · ${tug}`,
        at: row.created_at,
      });
    });
  }

  const assessmentItems = [];
  if (!assessmentsRes.error) {
    (assessmentsRes.data || []).forEach((row) => {
      const item = formatAssessmentActivityItem(row);
      if (item) assessmentItems.push(item);
    });
  }

  const systemLogs = !systemRes.error ? systemRes.data || [] : [];
  const targetIds = new Set();
  systemLogs.forEach((log) => {
    const id = targetUserIdFromPayload(log.payload, log.action_type);
    if (id) targetIds.add(id);
  });

  let nameById = {};
  if (targetIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', [...targetIds]);
    nameById = {};
    (profiles || []).forEach((pr) => {
      nameById[pr.id] = personName(pr.first_name, pr.last_name);
    });
  }

  const systemItems = diversifySystemItems(
    systemLogs
      .map((log) => formatSystemActivityItem(log, nameById))
      .filter(Boolean)
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))),
    3,
  );

  // Round-robin sources so assessments / rota aren't buried under break spam.
  return interleaveActivityItems(
    [assessmentItems, systemItems, approvalItems, checkItems],
    12,
  );
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

/** Soft tones reused from Rota Planner slot / day cards (tailwind `rota.*`). */
const SUMMARY_TONES = {
  best: {
    shell:
      'border-rota-input-focus-border/40 bg-gradient-to-br from-rota-btn-primary-hover-bg via-white to-rota-page-bg-via',
    title: 'text-rota-btn-primary-hover-text',
  },
  award: {
    shell:
      'border-rota-badge-partial-border bg-gradient-to-br from-rota-badge-partial-bg via-white to-rota-card-partial-bg',
    title: 'text-rota-badge-partial-text',
  },
  leader: {
    shell:
      'border-rota-badge-full-border bg-gradient-to-br from-rota-badge-full-bg via-white to-rota-card-full-bg',
    title: 'text-rota-badge-full-text',
  },
};

function SummaryCard({ title, value, detail, empty, onClick, tone = 'best' }) {
  const palette = SUMMARY_TONES[tone] || SUMMARY_TONES.best;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left shadow-soft transition hover:shadow-medium ${palette.shell}`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${palette.title}`}>{title}</p>
      <p className="mt-2 truncate text-lg font-semibold text-rota-text-primary">{value || '—'}</p>
      <p className="mt-1 text-sm text-rota-text-muted">{empty || detail || ''}</p>
    </button>
  );
}

SummaryCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.string,
  detail: PropTypes.string,
  empty: PropTypes.string,
  onClick: PropTypes.func,
  tone: PropTypes.oneOf(['best', 'award', 'leader']),
};

SummaryCard.defaultProps = {
  value: '',
  detail: '',
  empty: '',
  onClick: undefined,
  tone: 'best',
};

/** Same fill bands as Rota Planner SlotCard — soft windows, never dark bars. */
function attendanceWindowTone(present, maxPresent) {
  if (!present || maxPresent <= 0) {
    return {
      borderClass: 'border-rota-toolbar-border',
      bgClass: 'bg-gradient-to-br from-rota-day-other-bg-from to-rota-day-other-bg-to',
      valueClass: 'text-rota-day-other-text',
    };
  }
  const ratio = present / maxPresent;
  if (ratio >= 0.85) {
    return {
      borderClass: 'border-rota-card-full-border',
      bgClass: 'bg-rota-card-full-bg',
      valueClass: 'text-rota-badge-full-text',
    };
  }
  if (ratio >= 0.55) {
    return {
      borderClass: 'border-rota-card-partial-border',
      bgClass: 'bg-rota-card-partial-bg',
      valueClass: 'text-rota-badge-partial-text',
    };
  }
  return {
    borderClass: 'border-rota-card-partial-low-border',
    bgClass: 'bg-rota-card-partial-low-bg',
    valueClass: 'text-rota-badge-partial-low-text',
  };
}

export default function AdminDashboard({ onOpen, onOpenUserAssessment, users }) {
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
      <AssessmentsDueCard onOpenUser={onOpenUserAssessment} users={users} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          tone="best"
          title="Best yesterday"
          value={loading ? 'Loading…' : best?.name}
          detail={best?.moves != null ? `${best.moves} moves · ${best.label}` : ''}
          empty={!loading && !best?.name ? 'No moves imported' : ''}
          onClick={() => onOpen('performance')}
        />
        <SummaryCard
          tone="award"
          title="Shunter of the Month"
          value={loading ? 'Loading…' : awardValue}
          detail={awardDetail}
          empty={!loading && !awardValue ? 'No award this month' : ''}
          onClick={() => onOpen('shunter-month')}
        />
        <SummaryCard
          tone="leader"
          title="Overall leader"
          value={loading ? 'Loading…' : leader?.name}
          detail={leader?.moves != null ? `${leader.moves} moves this month` : ''}
          empty={!loading && !leader?.name ? 'No moves this month' : ''}
          onClick={() => onOpen('performance')}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-rota-toolbar-border bg-rota-modal-bg shadow-soft">
        <div className="border-b border-rota-toolbar-border bg-gradient-to-r from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to px-4 py-3">
          <h2 className="text-sm font-semibold text-rota-text-primary">Recent activity</h2>
        </div>
        <div className="px-4 pb-1">
          {loading ? (
            <p className="py-3 text-sm text-rota-text-muted">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="py-3 text-sm text-rota-text-muted">No recent activity yet.</p>
          ) : (
            <ul className="divide-y divide-rota-toolbar-border">
              {activity.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === 'assessment' && item.userId && onOpenUserAssessment) {
                        onOpenUserAssessment(item.userId);
                        return;
                      }
                      onOpen(item.section);
                    }}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-rota-btn-primary-hover-bg/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-rota-text-primary">{item.title}</span>
                      <span className="block truncate text-xs text-rota-text-muted">{item.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-rota-text-muted-light">
                      {item.at ? format(parseISO(item.at), 'd MMM') : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-rota-toolbar-border bg-rota-modal-bg shadow-soft">
        <div className="border-b border-rota-toolbar-border bg-gradient-to-r from-rota-badge-partial-bg/70 via-white to-rota-page-bg-via px-4 py-3">
          <h2 className="text-sm font-semibold text-rota-text-primary">Weekly attendance</h2>
          <p className="mt-0.5 text-xs text-rota-text-muted">
            People on the rota who were not marked absent.
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-3 text-sm text-rota-text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 p-3 sm:gap-2 sm:p-4">
            {presence.map((day) => {
              const tone = attendanceWindowTone(day.present, maxPresent);
              return (
                <div
                  key={day.date}
                  className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center shadow-sm sm:min-h-[5rem] ${tone.borderClass} ${tone.bgClass}`}
                  title={`${day.present} present · ${day.scheduled} scheduled`}
                >
                  <span className={`text-base font-semibold tabular-nums sm:text-lg ${tone.valueClass}`}>
                    {day.present}
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-rota-text-muted-light sm:text-[11px]">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

AdminDashboard.propTypes = {
  onOpen: PropTypes.func.isRequired,
  onOpenUserAssessment: PropTypes.func,
  users: PropTypes.arrayOf(PropTypes.object),
};
