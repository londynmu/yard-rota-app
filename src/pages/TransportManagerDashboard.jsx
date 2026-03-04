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
  const expandedCardRef = React.useRef(null);

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
    if (expandedShift && expandedCardRef.current) {
      expandedCardRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [expandedShift]);

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

  const shiftListItems = useMemo(() => {
    const out = { day: [], afternoon: [], night: [] };
    daySlots.forEach((s) => {
      if (!s.profiles) return;
      const name = `${s.profiles.first_name || ''} ${s.profiles.last_name || ''}`.trim() || 'Unknown';
      const isNoShow = attendanceBySlotId[s.id]?.status === 'no_show';
      const st = s.shift_type || 'day';
      out[st].push({ name, isNoShow });
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
        {/* Date picker + Today + location – one line on mobile, smaller controls */}
        <div className="tm-dashboard-datepicker flex flex-nowrap md:flex-wrap items-center gap-2 md:gap-4">
          <div className="flex flex-1 min-w-0 flex-nowrap gap-2 items-center">
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
              className="w-full min-w-0 text-sm md:text-base border-2 border-gray-300 rounded-lg md:rounded-xl px-3 py-2 md:px-4 md:py-3 text-charcoal bg-white focus:outline-none focus:border-charcoal"
              wrapperClassName="min-w-0 flex-1 md:min-w-[200px] md:flex-none"
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
              className="flex-shrink-0 text-sm md:text-base font-medium rounded-lg md:rounded-xl border-2 border-gray-300 text-charcoal bg-white hover:bg-gray-50 transition-colors whitespace-nowrap px-3 py-2 md:px-5 md:py-3"
            >
              Today
            </button>
          </div>
          {locations.length > 1 && (
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="flex-shrink-0 text-sm md:text-base border-2 border-gray-300 rounded-lg md:rounded-xl px-3 py-2 md:px-4 md:py-3 text-charcoal bg-white min-w-0"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          )}
        </div>
        <style>{`
          .tm-dashboard-datepicker .react-datepicker-wrapper { min-width: 0; flex: 1; }
          @media (min-width: 768px) {
            .tm-dashboard-datepicker .react-datepicker-wrapper { min-width: 200px; flex: none; }
          }
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

        {/* Top row: Total shunters only */}
        <div className="flex flex-wrap gap-4 items-stretch">
          <div className="bg-white border-2 border-charcoal rounded-2xl shadow-md p-8 text-center min-w-[200px] flex-1">
            <p className="text-base font-semibold text-gray-600">{selectedDateFormatted}</p>
            <p className="text-5xl font-bold text-charcoal tabular-nums mt-3">{staffTotal}</p>
            <p className="text-base font-semibold uppercase tracking-wide text-gray-600 mt-2">Total shunters</p>
          </div>
        </div>

        {/* Shift badges – mobile: each card expands its own list; desktop: shared panel below */}
        <div className="space-y-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {[
              { key: 'day', label: 'Day', timeRange: '05:45 – 18:00', count: shiftCounts.day, noShowCount: absencesForDay.byShift.noShow.day, bg: 'bg-amber-50/80 border-amber-200', text: 'text-amber-800', sub: 'text-amber-700' },
              { key: 'afternoon', label: 'Afternoon', timeRange: '13:45 – 02:00', count: shiftCounts.afternoon, noShowCount: absencesForDay.byShift.noShow.afternoon, bg: 'bg-orange-50/80 border-orange-200', text: 'text-orange-800', sub: 'text-orange-700' },
              { key: 'night', label: 'Night', timeRange: '17:45 – 06:00', count: shiftCounts.night, noShowCount: absencesForDay.byShift.noShow.night, bg: 'bg-blue-50/80 border-blue-200', text: 'text-blue-800', sub: 'text-blue-700' },
            ].map(({ key, label, timeRange, count, noShowCount, bg, text, sub }) => {
              const hasAny = (shiftListItems.day?.length || 0) > 0 || (shiftListItems.afternoon?.length || 0) > 0 || (shiftListItems.night?.length || 0) > 0;
              const isExpandedDesktop = expandedShift !== null;
              const isExpandedThis = expandedShift === key;
              const isLast = key === 'night';
              const listItems = shiftListItems[key] || [];
              return (
                <div
                  key={key}
                  ref={isExpandedThis ? expandedCardRef : undefined}
                  className="flex flex-col"
                >
                  <div className={`border-2 rounded-xl md:rounded-2xl shadow-sm transition-all duration-200 ${bg} ${isExpandedDesktop ? 'md:rounded-b-none' : ''} ${isExpandedThis ? 'rounded-b-none' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedShift(hasAny && isExpandedThis ? null : key)}
                      className={`w-full text-left md:text-center p-3 md:p-6 ${hasAny ? 'cursor-pointer hover:opacity-90' : ''}`}
                    >
                      {/* Mobile: compact – label + no show left, number + chevron right; no time */}
                      <div className="md:hidden flex items-center justify-between gap-2">
                        <p className={`text-lg font-semibold ${sub}`}>
                          {label}
                          {noShowCount > 0 && <span className="text-red-600 font-semibold"> · {noShowCount} no show</span>}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <p className={`text-2xl font-bold tabular-nums ${text}`}>{count}</p>
                          {hasAny && (
                            <span className={`text-sm ${sub} transition-transform duration-200 ${isExpandedThis ? 'rotate-180' : ''}`}>▼</span>
                          )}
                        </div>
                      </div>
                      {/* Desktop: large number, label, time */}
                      <div className="hidden md:block">
                        <p className={`text-4xl font-bold tabular-nums ${text}`}>{count}</p>
                        {noShowCount > 0 && (
                          <p className="text-base font-semibold text-red-600 mt-1">{noShowCount} no show</p>
                        )}
                        <p className={`text-sm font-semibold uppercase tracking-wide mt-2 ${sub}`}>{label}</p>
                        <p className={`text-sm ${sub} font-medium mt-1 tabular-nums`}>{timeRange}</p>
                        {hasAny && (
                          <span className={`inline-block mt-2 text-sm ${sub} transition-transform duration-200 ${isExpandedDesktop ? 'rotate-180' : ''}`}>▼</span>
                        )}
                      </div>
                    </button>
                  </div>
                  {/* Mobile only: expandable list under this card */}
                  <div
                    className={`md:hidden overflow-hidden transition-all duration-300 ease-out border-2 border-t-0 border-gray-200 rounded-b-xl bg-white ${isExpandedThis ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}
                    aria-hidden={!isExpandedThis}
                  >
                    <div className="px-4 py-3 border-t border-gray-100">
                      <ul className="space-y-2 text-base text-charcoal">
                        {listItems.map((item, i) => (
                          <li key={i} className={item.isNoShow ? 'text-red-600 font-semibold' : ''}>{item.name}</li>
                        ))}
                        {listItems.length === 0 && <li className="text-gray-400">—</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop only: single expanded list below all 3 shifts */}
          <div
            className={`hidden md:block overflow-hidden transition-all duration-300 ease-out border-2 border-t-0 border-gray-200 rounded-b-2xl bg-white ${expandedShift !== null ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
            aria-hidden={expandedShift === null}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 md:border-b-0 md:border-r border-gray-100">
                <p className="text-sm font-semibold uppercase tracking-wide text-amber-700 mb-3">Day</p>
                <ul className="space-y-2 text-base text-charcoal">
                  {(shiftListItems.day || []).map((item, i) => (
                    <li key={i} className={item.isNoShow ? 'text-red-600 font-semibold' : ''}>{item.name}</li>
                  ))}
                  {(shiftListItems.day || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
              <div className="px-5 py-4 border-b border-gray-100 md:border-b-0 md:border-r border-gray-100">
                <p className="text-sm font-semibold uppercase tracking-wide text-orange-700 mb-3">Afternoon</p>
                <ul className="space-y-2 text-base text-charcoal">
                  {(shiftListItems.afternoon || []).map((item, i) => (
                    <li key={i} className={item.isNoShow ? 'text-red-600 font-semibold' : ''}>{item.name}</li>
                  ))}
                  {(shiftListItems.afternoon || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-700 mb-3">Night</p>
                <ul className="space-y-2 text-base text-charcoal">
                  {(shiftListItems.night || []).map((item, i) => (
                    <li key={i} className={item.isNoShow ? 'text-red-600 font-semibold' : ''}>{item.name}</li>
                  ))}
                  {(shiftListItems.night || []).length === 0 && <li className="text-gray-400">—</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
