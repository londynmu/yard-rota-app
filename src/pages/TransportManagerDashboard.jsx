import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addDays, subDays } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { supabase } from '../lib/supabaseClient';

const getWeekStart = (date) => {
  const day = date.getDay();
  const diff = day === 6 ? 0 : day + 1;
  return subDays(date, diff);
};

const getEffectiveToday = () => {
  const now = new Date();
  return now.getHours() < 6
    ? format(subDays(now, 1), 'yyyy-MM-dd')
    : format(now, 'yyyy-MM-dd');
};

export default function TransportManagerDashboard() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const ymd = now.getHours() < 6
      ? format(subDays(now, 1), 'yyyy-MM-dd')
      : format(now, 'yyyy-MM-dd');
    return ymd;
  });
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('Rugby');
  const [dailyRota, setDailyRota] = useState({});
  const [attendanceBySlotId, setAttendanceBySlotId] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedShift, setExpandedShift] = useState(null);
  const [expandedAbsence, setExpandedAbsence] = useState(null);

  const fetchLocations = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('locations')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    if (e) return;
    if (data?.length) {
      setLocations(data);
      const saved = localStorage.getItem('tm_dashboard_location');
      if (saved && data.some((l) => l.name === saved)) setSelectedLocation(saved);
      else setSelectedLocation(data[0].name);
    }
  }, []);

  const fetchWeekRota = useCallback(async () => {
    if (!selectedLocation) return;
    const start = format(weekStart, 'yyyy-MM-dd');
    const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const { data: rotaData, error: rotaError } = await supabase
      .from('scheduled_rota')
      .select('id, date, shift_type, user_id')
      .gte('date', start)
      .lte('date', end)
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
        profilesData.forEach((p) => { profilesMap[p.id] = p; });
      }
    }

    const slots = (rotaData || []).map((slot) => ({
      ...slot,
      profiles: profilesMap[slot.user_id] || null,
    }));

    const slotIds = slots.map((s) => s.id);
    let bySlot = {};
    if (slotIds.length) {
      const { data: attData } = await supabase
        .from('attendance')
        .select('scheduled_rota_id, status')
        .in('scheduled_rota_id', slotIds);
      (attData || []).forEach((r) => { bySlot[r.scheduled_rota_id] = { status: r.status }; });
    }
    setAttendanceBySlotId(bySlot);

    const grouped = {};
    slots.forEach((slot) => {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    });
    setDailyRota(grouped);
  }, [weekStart, selectedLocation]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    localStorage.setItem('tm_dashboard_location', selectedLocation);
  }, [selectedLocation]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWeekRota().catch((e) => {
      console.error(e);
      setError(e.message || 'Failed to load data');
    }).finally(() => setLoading(false));
  }, [fetchWeekRota]);

  const daySlots = dailyRota[selectedDate] || [];
  const presentSlots = daySlots.filter((s) => s.profiles && !attendanceBySlotId[s.id]);
  const shiftCounts = useMemo(() => ({
    day: presentSlots.filter((s) => s.shift_type === 'day').length,
    afternoon: presentSlots.filter((s) => s.shift_type === 'afternoon').length,
    night: presentSlots.filter((s) => s.shift_type === 'night').length,
  }), [presentSlots]);

  const absencesForDay = useMemo(() => {
    let noShow = 0;
    let sick = 0;
    let late = 0;
    const byShift = { noShow: { day: 0, afternoon: 0, night: 0 }, sick: { day: 0, afternoon: 0, night: 0 }, late: { day: 0, afternoon: 0, night: 0 } };
    daySlots.forEach((s) => {
      if (!attendanceBySlotId[s.id]) return;
      const st = s.shift_type || 'day';
      if (attendanceBySlotId[s.id].status === 'no_show') {
        noShow += 1;
        byShift.noShow[st] += 1;
      } else if (attendanceBySlotId[s.id].status === 'sick') {
        sick += 1;
        byShift.sick[st] += 1;
      } else if (attendanceBySlotId[s.id].status === 'late') {
        late += 1;
        byShift.late[st] += 1;
      }
    });
    return { noShow, sick, late, byShift };
  }, [daySlots, attendanceBySlotId]);

  const staffTotal = shiftCounts.day + shiftCounts.afternoon + shiftCounts.night;

  const selectedDateFormatted = format(new Date(selectedDate + 'T12:00:00'), 'EEEE d-MM-yyyy');

  const hasAnyAbsence = absencesForDay.noShow > 0 || absencesForDay.sick > 0 || absencesForDay.late > 0;

  const shiftNames = useMemo(() => {
    const out = { day: [], afternoon: [], night: [] };
    presentSlots.forEach((s) => {
      const name = s.profiles ? `${s.profiles.first_name || ''} ${s.profiles.last_name || ''}`.trim() : 'Unknown';
      if (!out[s.shift_type].includes(name)) out[s.shift_type].push(name);
    });
    return out;
  }, [presentSlots]);

  const absenceNames = useMemo(() => {
    const out = { no_show: [], sick: [], late: [] };
    daySlots.forEach((s) => {
      if (!attendanceBySlotId[s.id]) return;
      const name = s.profiles ? `${s.profiles.first_name || ''} ${s.profiles.last_name || ''}`.trim() : 'Unknown';
      const status = attendanceBySlotId[s.id].status;
      if (status === 'no_show' && !out.no_show.includes(name)) out.no_show.push(name);
      else if (status === 'sick' && !out.sick.includes(name)) out.sick.push(name);
      else if (status === 'late' && !out.late.includes(name)) out.late.push(name);
    });
    return out;
  }, [daySlots, attendanceBySlotId]);

  if (loading && Object.keys(dailyRota).length === 0) {
    return (
      <div className="min-h-screen bg-offwhite py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-offwhite py-6 px-4">
        <div className="max-w-4xl mx-auto text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite py-6 px-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Date picker + Today + location */}
        <div className="tm-dashboard-datepicker flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <DatePicker
              selected={selectedDate ? new Date(selectedDate + 'T12:00:00') : null}
              onChange={(date) => {
                if (date) {
                  setSelectedDate(format(date, 'yyyy-MM-dd'));
                  setWeekStart(getWeekStart(date));
                }
              }}
              dateFormat="EEE d MMM yyyy"
              placeholderText="Select date"
              className="w-full min-w-[180px] text-sm border-2 border-gray-300 rounded-xl px-3 py-2.5 text-charcoal bg-white focus:outline-none focus:border-charcoal"
              wrapperClassName="min-w-[180px]"
              popperClassName="tm-dashboard-datepicker-popper"
              showPopperArrow={false}
            />
            <button
              type="button"
              onClick={() => {
                const today = getEffectiveToday();
                setSelectedDate(today);
                setWeekStart(getWeekStart(new Date(today + 'T12:00:00')));
              }}
              className="px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-gray-300 text-charcoal bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Today
            </button>
          </div>
          {locations.length > 1 && (
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="text-sm border-2 border-gray-300 rounded-xl px-3 py-2 text-charcoal bg-white"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          )}
        </div>
        <style>{`
          .tm-dashboard-datepicker .react-datepicker-wrapper { min-width: 180px; }
          .tm-dashboard-datepicker-popper.react-datepicker-popper { z-index: 50; }
          .tm-dashboard-datepicker-popper .react-datepicker {
            font-family: inherit;
            border: 2px solid #e5e7eb;
            border-radius: 1rem;
            background: #fff;
            box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
          }
          .tm-dashboard-datepicker-popper .react-datepicker__header {
            background: #FAFAFA;
            border-bottom: 1px solid #e5e7eb;
            padding: 8px 0;
            border-radius: 1rem 1rem 0 0;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__current-month {
            color: #2D2D2D;
            font-weight: 600;
            font-size: 0.9rem;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day-names { padding: 0 4px; }
          .tm-dashboard-datepicker-popper .react-datepicker__day-name {
            color: #6b7280;
            font-weight: 600;
            font-size: 0.7rem;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day {
            border-radius: 0.375rem;
            color: #1f2937;
            transition: background 0.15s ease;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day:hover:not(.react-datepicker__day--disabled):not(.react-datepicker__day--selected) {
            background: #f3f4f6;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day--selected,
          .tm-dashboard-datepicker-popper .react-datepicker__day--keyboard-selected {
            background: #2D2D2D !important;
            color: #fff !important;
            font-weight: 700;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day--today:not(.react-datepicker__day--selected) {
            border: 2px solid #ea580c;
            font-weight: 700;
            background: #fed7aa;
          }
          .tm-dashboard-datepicker-popper .react-datepicker__day--outside-month { color: #d1d5db; }
          .tm-dashboard-datepicker-popper .react-datepicker__navigation-icon::before { border-color: #6b7280; }
        `}</style>

        {/* Main badge: Total shunters (24h) with date inside */}
        <div className="bg-white border-2 border-charcoal rounded-2xl shadow-md p-6 text-center">
          <p className="text-sm font-semibold text-gray-600">{selectedDateFormatted}</p>
          <p className="text-4xl font-bold text-charcoal tabular-nums mt-2">{staffTotal}</p>
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-600 mt-1">Total shunters</p>
        </div>

        {/* Shift badges – click any to expand one list below with all 3 shifts */}
        <div className="space-y-0">
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'day', label: 'Day', count: shiftCounts.day, names: shiftNames.day || [], bg: 'bg-amber-50/80 border-amber-200', text: 'text-amber-800', sub: 'text-amber-700' },
              { key: 'afternoon', label: 'Afternoon', count: shiftCounts.afternoon, names: shiftNames.afternoon || [], bg: 'bg-orange-50/80 border-orange-200', text: 'text-orange-800', sub: 'text-orange-700' },
              { key: 'night', label: 'Night', count: shiftCounts.night, names: shiftNames.night || [], bg: 'bg-blue-50/80 border-blue-200', text: 'text-blue-800', sub: 'text-blue-700' },
            ].map(({ key, label, count, names, bg, text, sub }) => {
              const hasAnyNames = (shiftNames.day || []).length > 0 || (shiftNames.afternoon || []).length > 0 || (shiftNames.night || []).length > 0;
              const isExpanded = expandedShift === 'shifts';
              return (
                <div key={key} className={`border-2 rounded-2xl shadow-sm transition-all duration-200 ${bg} ${isExpanded ? 'rounded-b-none' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedShift(hasAnyNames && isExpanded ? null : 'shifts')}
                    className={`w-full p-5 text-center ${hasAnyNames ? 'cursor-pointer hover:opacity-90' : ''}`}
                  >
                    <p className={`text-3xl font-bold tabular-nums ${text}`}>{count}</p>
                    <p className={`text-xs font-semibold uppercase tracking-wide mt-1 ${sub}`}>{label}</p>
                    {hasAnyNames && (
                      <span className={`inline-block mt-1.5 text-xs ${sub} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          {/* Single expanded list below: all 3 shifts at once */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out border-2 border-t-0 border-gray-200 rounded-b-2xl bg-white ${expandedShift === 'shifts' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
            aria-hidden={expandedShift !== 'shifts'}
          >
            <div className="grid grid-cols-3 gap-0 border-t border-gray-100">
              <div className="px-4 py-3 border-r border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">Day</p>
                <ul className="space-y-1 text-sm text-charcoal">
                  {(shiftNames.day || []).map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                  {(shiftNames.day || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
              <div className="px-4 py-3 border-r border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 mb-2">Afternoon</p>
                <ul className="space-y-1 text-sm text-charcoal">
                  {(shiftNames.afternoon || []).map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                  {(shiftNames.afternoon || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">Night</p>
                <ul className="space-y-1 text-sm text-charcoal">
                  {(shiftNames.night || []).map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                  {(shiftNames.night || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Absences – only if any; clickable with user list */}
        {hasAnyAbsence && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'no_show', label: 'No show', count: absencesForDay.noShow, names: absenceNames.no_show, byShift: absencesForDay.byShift.noShow, bg: 'bg-red-50/50 border-red-200', text: 'text-red-700', sub: 'text-red-600' },
                { key: 'sick', label: 'Sick', count: absencesForDay.sick, names: absenceNames.sick, byShift: absencesForDay.byShift.sick, bg: 'bg-amber-50/50 border-amber-200', text: 'text-amber-800', sub: 'text-amber-700' },
              ].map(({ key, label, count, names, byShift, bg, text, sub }) => {
                const isExpanded = expandedAbsence === key;
                return (
                  <div key={key} className={`border-2 rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${bg}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedAbsence(isExpanded ? null : key)}
                      className={`w-full p-5 text-center ${count > 0 ? 'cursor-pointer hover:opacity-90' : ''}`}
                    >
                      <p className={`text-3xl font-bold tabular-nums ${text}`}>{count}</p>
                      <p className={`text-xs font-semibold uppercase tracking-wide mt-1 ${sub}`}>{label}</p>
                      {count > 0 && (
                        <p className={`text-[10px] ${sub} mt-1.5 opacity-90`}>
                          Day {byShift.day} · Aft {byShift.afternoon} · Ngt {byShift.night}
                        </p>
                      )}
                      {names.length > 0 && (
                        <span className={`inline-block mt-1.5 text-xs ${sub} transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                      )}
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                      aria-hidden={!isExpanded}
                    >
                      <ul className="px-4 pb-4 pt-1 space-y-1 text-sm text-charcoal border-t border-gray-200/50">
                        {names.map((name, i) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
            {absencesForDay.late > 0 && (
              <div className={`border-2 rounded-2xl shadow-sm overflow-hidden transition-all duration-200 bg-slate-50/50 border-slate-200`}>
                <button
                  type="button"
                  onClick={() => setExpandedAbsence(expandedAbsence === 'late' ? null : 'late')}
                  className="w-full p-4 text-center cursor-pointer hover:opacity-90"
                >
                  <p className="text-lg font-bold text-charcoal tabular-nums">{absencesForDay.late}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mt-1">Late</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Day {absencesForDay.byShift.late.day} · Aft {absencesForDay.byShift.late.afternoon} · Ngt {absencesForDay.byShift.late.night}
                  </p>
                  {absenceNames.late.length > 0 && (
                    <span className={`inline-block mt-1.5 text-xs text-gray-500 transition-transform duration-200 ${expandedAbsence === 'late' ? 'rotate-180' : ''}`}>▼</span>
                  )}
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${expandedAbsence === 'late' ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                  aria-hidden={expandedAbsence !== 'late'}
                >
                  <ul className="px-4 pb-4 pt-1 space-y-1 text-sm text-charcoal border-t border-gray-200/50">
                    {absenceNames.late.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
