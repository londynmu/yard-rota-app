import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getEffectiveTodayYmd } from '../utils/operationalDay';

const EMPTY_SUMMARY = { day: 0, afternoon: 0, night: 0, total: 0 };

/**
 * Unique shunters rostered today at `location` (absent slots excluded), split by shift.
 * Uses the same 07:00 operational-day threshold as the break list night cycle.
 */
export function useTodayShiftSummary(location) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  useEffect(() => {
    if (!location) return undefined;
    let cancelled = false;

    const fetchTodayShiftSummary = async () => {
      try {
        // Before 07:00 this is yesterday — same night-cycle anchor as the break list.
        const today = getEffectiveTodayYmd();

        const { data: rotaData, error: rotaError } = await supabase
          .from('scheduled_rota')
          .select('id, user_id, shift_type')
          .eq('date', today)
          .eq('location', location);

        if (rotaError) throw rotaError;
        const slots = rotaData || [];
        if (slots.length === 0) {
          if (!cancelled) setSummary(EMPTY_SUMMARY);
          return;
        }

        const userIds = [...new Set(slots.map((s) => s.user_id).filter(Boolean))];
        const profilesMap = {};
        if (userIds.length) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          if (profilesError) throw profilesError;
          if (profilesData) {
            profilesData.forEach((p) => {
              profilesMap[p.id] = p;
            });
          }
        }

        const slotIds = slots.map((s) => s.id).filter(Boolean);
        const attendanceBySlotId = {};
        if (slotIds.length) {
          const { data: attData, error: attError } = await supabase
            .from('attendance')
            .select('scheduled_rota_id, status')
            .in('scheduled_rota_id', slotIds);
          if (attError) throw attError;
          (attData || []).forEach((r) => {
            if (r.scheduled_rota_id) {
              attendanceBySlotId[r.scheduled_rota_id] = { status: r.status };
            }
          });
        }

        const presentSlots = slots.filter(
          (s) => s.user_id && profilesMap[s.user_id] && !attendanceBySlotId[s.id]
        );

        const uniqByShift = {
          day: new Set(),
          afternoon: new Set(),
          night: new Set(),
        };
        const uniqAll = new Set();

        presentSlots.forEach((row) => {
          if (!row?.user_id) return;
          uniqAll.add(row.user_id);
          if (row.shift_type === 'day') uniqByShift.day.add(row.user_id);
          if (row.shift_type === 'afternoon') uniqByShift.afternoon.add(row.user_id);
          if (row.shift_type === 'night') uniqByShift.night.add(row.user_id);
        });

        if (!cancelled) {
          setSummary({
            day: uniqByShift.day.size,
            afternoon: uniqByShift.afternoon.size,
            night: uniqByShift.night.size,
            total: uniqAll.size,
          });
        }
      } catch (err) {
        // Keep the previous summary — do not pretend the yard is empty on fetch failure.
        console.warn('useTodayShiftSummary: could not fetch today shift summary', err);
      }
    };

    fetchTodayShiftSummary();
    return () => {
      cancelled = true;
    };
  }, [location]);

  return summary;
}
