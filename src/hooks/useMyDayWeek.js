import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { getWeekStart } from '../utils/rotaHelpers';
import { toLocalYmd } from '../utils/operationalDay';

const NIGHT_MORNING_END_HOUR = 7;
const TICK_MS = 30 * 1000;
const ABSENCE_LABELS = { no_show: 'No show', sick: 'Sick', late: 'Late' };
const EMPTY_DATA = { slots: [], breaks: [], absenceBySlotId: {} };

const hm = (value) => (value ? String(value).slice(0, 5) : '');

function atDateTime(ymd, time, addDay = false) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, m] = hm(time).split(':').map(Number);
  return new Date(y, mo - 1, d + (addDay ? 1 : 0), h || 0, m || 0);
}

function shiftWindow(slot) {
  const start = atDateTime(slot.date, slot.start_time);
  let end = atDateTime(slot.date, slot.end_time);
  if (end <= start) end = addDays(end, 1);
  return { start, end };
}

/** Night breaks 00:00-06:59 are stored on the night start date but happen the following morning. */
function breakWindow(brk) {
  const startHour = Number(hm(brk.break_start_time).split(':')[0]);
  const nextMorning = brk.shift_type === 'night' && startHour < NIGHT_MORNING_END_HOUR;
  const start = atDateTime(brk.date, brk.break_start_time, nextMorning);
  const end = new Date(start.getTime() + (brk.break_duration_minutes || 0) * 60000);
  return { start, end };
}

const minutesBetween = (from, to) => Math.max(0, Math.ceil((to - from) / 60000));

function describeSlot(slot, absenceBySlotId) {
  return {
    date: slot.date,
    shiftType: slot.shift_type,
    start: hm(slot.start_time),
    end: hm(slot.end_time),
    location: (slot.location || '').trim(),
    absence: absenceBySlotId[slot.id] || null,
  };
}

/** Picks the shift that counts as "today": last night's shift until it ends, otherwise today's. */
function pickCurrentSlot(slots, now) {
  const todayYmd = toLocalYmd(now);
  const yesterdayYmd = toLocalYmd(subDays(now, 1));

  const lastNight = slots.find(
    (slot) => slot.date === yesterdayYmd && slot.shift_type === 'night' && shiftWindow(slot).end > now
  );
  if (lastNight) return lastNight;

  const today = slots.filter((slot) => slot.date === todayYmd);
  return today.find((slot) => shiftWindow(slot).end > now) || today[today.length - 1] || null;
}

function getBreakStatus(slot, breaks, now) {
  const mine = breaks
    .filter((brk) => brk.date === slot.date && (!brk.shift_type || brk.shift_type === slot.shift_type))
    .map((brk) => ({ ...brk, ...breakWindow(brk) }))
    .sort((a, b) => a.start - b.start);

  if (mine.length === 0) return { kind: 'none' };

  const open = mine.filter((brk) => brk.end > now);
  if (open.length === 0) return { kind: 'done' };

  const [first] = open;
  const base = {
    start: format(first.start, 'HH:mm'),
    end: format(first.end, 'HH:mm'),
    moreCount: open.length - 1,
  };
  if (first.start <= now) return { ...base, kind: 'active', minutesLeft: minutesBetween(now, first.end) };
  return { ...base, kind: 'upcoming', minutesUntil: minutesBetween(now, first.start) };
}

/**
 * The signed-in user's shifts for the current rota week (Sat-Fri, as in My Rota) plus today's break status.
 */
export function useMyDayWeek() {
  const { user } = useAuth();
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const weekStartYmd = toLocalYmd(getWeekStart(now));

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setData(EMPTY_DATA);
      setLoading(false);
      return;
    }

    const today = new Date();
    const weekStart = getWeekStart(today);
    const yesterday = subDays(today, 1);
    const fromYmd = toLocalYmd(yesterday < weekStart ? yesterday : weekStart);
    const toYmd = toLocalYmd(addDays(weekStart, 6));

    try {
      const [rotaRes, breaksRes] = await Promise.all([
        supabase
          .from('scheduled_rota')
          .select('id, date, shift_type, location, start_time, end_time')
          .eq('user_id', user.id)
          .gte('date', fromYmd)
          .lte('date', toYmd),
        supabase
          .from('scheduled_breaks')
          .select('id, date, shift_type, break_start_time, break_duration_minutes')
          .eq('user_id', user.id)
          .in('date', [toLocalYmd(yesterday), toLocalYmd(today)]),
      ]);
      if (rotaRes.error) throw rotaRes.error;
      if (breaksRes.error) throw breaksRes.error;

      const seen = new Set();
      const slots = (rotaRes.data || [])
        .filter((slot) => {
          const key = `${slot.date}-${slot.start_time}-${slot.end_time}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => shiftWindow(a).start - shiftWindow(b).start);

      const absenceBySlotId = {};
      if (slots.length) {
        const { data: attendance } = await supabase
          .from('attendance')
          .select('scheduled_rota_id, status')
          .in('scheduled_rota_id', slots.map((slot) => slot.id));
        (attendance || []).forEach((row) => {
          const label = ABSENCE_LABELS[row.status];
          if (row.scheduled_rota_id && label) absenceBySlotId[row.scheduled_rota_id] = label;
        });
      }

      setData({ slots, breaks: breaksRes.data || [], absenceBySlotId });
    } catch (err) {
      console.warn('useMyDayWeek: could not load my shifts', err);
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
      setNow(new Date());
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData, weekStartYmd]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchData]);

  return useMemo(() => {
    const { slots, breaks, absenceBySlotId } = data;
    const todayYmd = toLocalYmd(now);
    const weekStart = getWeekStart(now);

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const ymd = toLocalYmd(date);
      const slot = slots.find((s) => s.date === ymd);
      return {
        ymd,
        date,
        isToday: ymd === todayYmd,
        isPast: ymd < todayYmd,
        shift: slot ? describeSlot(slot, absenceBySlotId) : null,
      };
    });

    const currentSlot = pickCurrentSlot(slots, now);
    const nextSlot = currentSlot ? null : slots.find((slot) => shiftWindow(slot).start > now) || null;

    return {
      loading,
      days,
      currentShift: currentSlot ? describeSlot(currentSlot, absenceBySlotId) : null,
      breakStatus: currentSlot ? getBreakStatus(currentSlot, breaks, now) : null,
      nextShift: nextSlot ? { ...describeSlot(nextSlot, absenceBySlotId), dayLabel: format(shiftWindow(nextSlot).start, 'EEE') } : null,
    };
  }, [data, loading, now]);
}
