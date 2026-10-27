import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays, parseISO } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { getEffectiveTodayYmd } from '../utils/operationalDay';
import { aggregateYesterdayPerformance } from '../utils/tmPerformanceKpi';
import {
  locationsWithStaffToday,
  resolveTmLocationSelection,
} from '../utils/tmLocationsWithStaff';
import TmLocationPills from '../components/TransportManager/TmLocationPills';

const ABSENCE_STATUS_LABEL = {
  no_show: 'No show',
  sick: 'Sick',
  late: 'Late',
  other: 'Other',
};

const EMPTY_ABSENCES = { noShow: 0, sick: 0, late: 0, other: 0, total: 0, people: [] };

/**
 * Transport Manager Home — greeting + today's KPI cards.
 * Location preference shared with Rota via localStorage `tm_dashboard_location`.
 */
export default function TransportManagerHome() {
  const { sessionProfile } = useAuth();
  const firstName = sessionProfile?.first_name?.trim() || 'there';

  const [staffedLocations, setStaffedLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('tm_dashboard_location') || '' : ''
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [shiftCounts, setShiftCounts] = useState({ day: 0, afternoon: 0, night: 0 });
  const [absences, setAbsences] = useState(EMPTY_ABSENCES);
  const [performanceKpi, setPerformanceKpi] = useState({
    totalMoves: 0,
    best: null,
    worst: null,
    hasData: false,
  });

  const todayYmd = useMemo(() => getEffectiveTodayYmd(), []);
  const yesterdayYmd = useMemo(
    () => format(subDays(parseISO(`${todayYmd}T12:00:00`), 1), 'yyyy-MM-dd'),
    [todayYmd]
  );
  const reportDateForYesterday = todayYmd;
  const todayFormatted = useMemo(
    () => format(parseISO(`${todayYmd}T12:00:00`), 'EEEE d MMM yyyy'),
    [todayYmd]
  );
  const yesterdayFormatted = useMemo(
    () => format(parseISO(`${yesterdayYmd}T12:00:00`), 'EEE d MMM'),
    [yesterdayYmd]
  );

  const fetchStaffedLocations = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('scheduled_rota')
      .select('location')
      .eq('date', todayYmd);
    if (e) throw e;

    const staffed = locationsWithStaffToday(data || []);
    setStaffedLocations(staffed);

    const saved = localStorage.getItem('tm_dashboard_location');
    const next = resolveTmLocationSelection(staffed, saved);
    if (next) setSelectedLocation(next);
  }, [todayYmd]);

  const fetchKpis = useCallback(async () => {
    if (!selectedLocation) {
      setShiftCounts({ day: 0, afternoon: 0, night: 0 });
      setAbsences(EMPTY_ABSENCES);
      return;
    }

    const { data: rotaData, error: rotaError } = await supabase
      .from('scheduled_rota')
      .select('id, date, shift_type, user_id')
      .eq('date', todayYmd)
      .eq('location', selectedLocation);

    if (rotaError) throw rotaError;

    const userIds = [...new Set((rotaData || []).map((r) => r.user_id).filter(Boolean))];
    let profilesMap = {};
    if (userIds.length) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);
      if (!profilesError && profilesData) {
        profilesData.forEach((p) => {
          profilesMap[p.id] = p;
        });
      }
    }

    const slots = (rotaData || []).map((slot) => ({
      ...slot,
      profiles: profilesMap[slot.user_id] || null,
    }));

    const slotIds = slots.map((s) => s.id);
    const attendanceBySlotId = {};
    if (slotIds.length) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('scheduled_rota_id, status')
        .in('scheduled_rota_id', slotIds);
      (attData || []).forEach((r) => {
        attendanceBySlotId[r.scheduled_rota_id] = { status: r.status };
      });
    }

    const presentSlots = slots.filter((s) => s.profiles && !attendanceBySlotId[s.id]);
    setShiftCounts({
      day: presentSlots.filter((s) => s.shift_type === 'day').length,
      afternoon: presentSlots.filter((s) => s.shift_type === 'afternoon').length,
      night: presentSlots.filter((s) => s.shift_type === 'night').length,
    });

    let noShow = 0;
    let sick = 0;
    let late = 0;
    let other = 0;
    const people = [];
    slots.forEach((s) => {
      const st = attendanceBySlotId[s.id]?.status;
      if (!st || !ABSENCE_STATUS_LABEL[st]) return;
      if (st === 'no_show') noShow += 1;
      else if (st === 'sick') sick += 1;
      else if (st === 'late') late += 1;
      else if (st === 'other') other += 1;
      const name = `${s.profiles?.first_name || ''} ${s.profiles?.last_name || ''}`.trim() || 'Unknown';
      people.push({ name, status: st });
    });
    people.sort((a, b) => a.name.localeCompare(b.name));
    setAbsences({
      noShow,
      sick,
      late,
      other,
      total: noShow + sick + late + other,
      people,
    });

    // actual_date = report_date - 1 → yesterday's work is report_date = today
    const { data: perfData, error: perfError } = await supabase
      .from('shunter_performance')
      .select(`
        user_id,
        number_of_moves,
        report_date,
        profiles:user_id (
          first_name,
          last_name
        )
      `)
      .eq('report_date', reportDateForYesterday);

    if (perfError) throw perfError;
    setPerformanceKpi(aggregateYesterdayPerformance(perfData || []));
  }, [selectedLocation, todayYmd, reportDateForYesterday]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStaffedLocations()
      .catch((e) => {
        console.error(e);
        setError(e.message || 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, [fetchStaffedLocations]);

  useEffect(() => {
    if (!selectedLocation) return;
    localStorage.setItem('tm_dashboard_location', selectedLocation);
  }, [selectedLocation]);

  useEffect(() => {
    if (!selectedLocation) return;
    setLoading(true);
    setError(null);
    fetchKpis()
      .catch((e) => {
        console.error(e);
        setError(e.message || 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, [fetchKpis, selectedLocation]);

  const staffTotal = shiftCounts.day + shiftCounts.afternoon + shiftCounts.night;
  const performanceHref = `/performance?date=${yesterdayYmd}`;

  if (loading && staffedLocations.length === 0 && !error) {
    return (
      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 sm:px-6 lg:px-8 pb-bottom-nav">
        <div className="w-full max-w-7xl mx-auto space-y-6">
          <div className="h-9 w-56 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
          <div className="h-10 w-full max-w-md bg-slate-100 rounded-full animate-pulse" />
          <div className="h-36 card-modern animate-pulse bg-slate-50" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-36 card-modern animate-pulse bg-slate-50" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 sm:px-6 lg:px-8 pb-bottom-nav">
        <div className="w-full max-w-7xl mx-auto text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-transparent px-4 py-6 sm:px-6 lg:px-8 pb-bottom-nav">
      <div className="w-full max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-charcoal">
              Hello, {firstName}
            </h1>
            <p className="text-sm text-rota-text-muted-light mt-1">{todayFormatted}</p>
          </div>
        </div>

        <TmLocationPills
          locations={staffedLocations}
          selected={selectedLocation}
          onSelect={setSelectedLocation}
        />

        {staffedLocations.length === 0 && (
          <p className="text-sm text-rota-text-muted-light">
            No shunters scheduled today at any location.
          </p>
        )}

        {/* Yesterday band — one clickable card → performance for yesterday */}
        <Link
          to={performanceHref}
          className="card-modern block p-5 sm:p-6 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
          aria-label={`View yesterday performance for ${yesterdayFormatted}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rota-text-muted-light">
                Yesterday&apos;s moves
              </p>
              <p className="text-[10px] text-rota-text-muted-light mt-0.5">{yesterdayFormatted}</p>
            </div>
            <span className="text-sm font-medium text-slate-600">
              View full list →
            </span>
          </div>

          {performanceKpi.hasData ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-charcoal tabular-nums">
                  {performanceKpi.totalMoves.toLocaleString()}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-rota-text-muted-light mt-1">
                  Moves
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/70 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Best
                </p>
                <p className="text-sm font-semibold text-charcoal mt-0.5 truncate">
                  {performanceKpi.best?.name}
                </p>
                <p className="text-lg font-bold text-emerald-800 tabular-nums">
                  {performanceKpi.best?.moves ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200/60 bg-rose-50/70 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                  Worst
                </p>
                <p className="text-sm font-semibold text-charcoal mt-0.5 truncate">
                  {performanceKpi.worst?.name}
                </p>
                <p className="text-lg font-bold text-rose-800 tabular-nums">
                  {performanceKpi.worst?.moves ?? 0}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-rota-text-muted-light mt-4">
              No performance data for yesterday
            </p>
          )}
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Shunters today → Rota */}
          <Link
            to="/transport-dashboard/rota"
            className="card-modern block p-5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            aria-label="View today's rota"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rota-text-muted-light">
                Shunters today
              </p>
              <span className="text-sm font-medium text-slate-600 whitespace-nowrap">
                View rota →
              </span>
            </div>
            <p className="text-4xl font-bold text-charcoal tabular-nums mt-2">{staffTotal}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-amber-50/80 border border-amber-200/60 px-2 py-2">
                <p className="text-lg font-bold text-amber-800 tabular-nums">{shiftCounts.day}</p>
                <p className="text-[10px] font-semibold uppercase text-amber-700">Day</p>
              </div>
              <div className="rounded-xl bg-orange-50/80 border border-orange-200/60 px-2 py-2">
                <p className="text-lg font-bold text-orange-800 tabular-nums">{shiftCounts.afternoon}</p>
                <p className="text-[10px] font-semibold uppercase text-orange-700">Aft</p>
              </div>
              <div className="rounded-xl bg-blue-50/80 border border-blue-200/60 px-2 py-2">
                <p className="text-lg font-bold text-blue-800 tabular-nums">{shiftCounts.night}</p>
                <p className="text-[10px] font-semibold uppercase text-blue-700">Night</p>
              </div>
            </div>
          </Link>

          {/* Absences today — counts + names */}
          <div className="card-modern p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-rota-text-muted-light">
              Absences today
            </p>
            <p className="text-4xl font-bold text-charcoal tabular-nums mt-2">{absences.total}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-charcoal">
              <p>
                <span className="font-semibold text-red-600 tabular-nums">{absences.noShow}</span>
                {' '}No show
              </p>
              <p>
                <span className="font-semibold text-amber-700 tabular-nums">{absences.sick}</span>
                {' '}Sick
              </p>
              <p>
                <span className="font-semibold text-orange-700 tabular-nums">{absences.late}</span>
                {' '}Late
              </p>
              <p>
                <span className="font-semibold text-slate-600 tabular-nums">{absences.other}</span>
                {' '}Other
              </p>
            </div>
            {absences.people?.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-slate-200/60 pt-3">
                {absences.people.map((person, idx) => (
                  <li
                    key={`${person.name}-${person.status}-${idx}`}
                    className="text-sm text-charcoal flex items-baseline justify-between gap-2"
                  >
                    <span className="font-medium truncate">{person.name}</span>
                    <span className="text-xs text-rota-text-muted-light flex-shrink-0">
                      {ABSENCE_STATUS_LABEL[person.status] || person.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
