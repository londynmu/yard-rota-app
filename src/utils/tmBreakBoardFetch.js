import { supabase } from '../lib/supabaseClient';
import {
  TM_BREAK_SHIFTS,
  STANDARD_BREAK_SLOTS,
  mapToDbBreakType,
  sortBreakSlots,
} from './tmBreakBoardConfig';

export { TM_BREAK_SHIFTS, STANDARD_BREAK_SLOTS, mapToDbBreakType, sortBreakSlots };

/**
 * Read-only TM board for one shift at a location/date.
 * Returns slots + assignments (names) with absent users filtered out.
 */
export async function fetchTmBreakBoardForShift({ date, location, shift }) {
  if (!date || !location || !shift) {
    return { shift, slots: [], assignments: [] };
  }

  const shiftKey = shift;
  const shiftLower = shift.toLowerCase();
  let workingStandardSlots = [...(STANDARD_BREAK_SLOTS[shiftKey] || [])];

  try {
    const dateObj = new Date(`${date}T00:00:00`);
    if (dateObj.getDay() === 6 && shiftLower === 'night') {
      workingStandardSlots.unshift({
        start_time: '20:00',
        duration_minutes: 60,
        capacity: 3,
        break_type: 'Night Break (60 min)',
      });
    }
  } catch {
    // ignore bad date
  }

  let modifiedCapacities = {};
  try {
    const { data: modifiedSlotsData } = await supabase
      .from('scheduled_breaks')
      .select('std_slot_id, capacity')
      .eq('date', date)
      .eq('shift_type', shiftLower)
      .eq('location', location)
      .is('user_id', null)
      .not('std_slot_id', 'is', null);

    (modifiedSlotsData || []).forEach((mod) => {
      if (mod.std_slot_id && mod.capacity !== null) {
        modifiedCapacities[mod.std_slot_id] = mod.capacity;
      }
    });
  } catch {
    modifiedCapacities = {};
  }

  const standardSlotsWithIds = workingStandardSlots.map((slot, index) => {
    const slotId = `std-${shiftKey}-${index}`;
    const modifiedCapacity = modifiedCapacities[slotId];
    return {
      ...slot,
      id: slotId,
      is_custom: false,
      capacity: modifiedCapacity !== undefined ? modifiedCapacity : slot.capacity,
    };
  });

  let customSlotsData = [];
  try {
    const { data } = await supabase
      .from('scheduled_breaks')
      .select('id, break_start_time, break_duration_minutes, break_type, capacity')
      .eq('date', date)
      .eq('shift_type', shiftLower)
      .is('user_id', null)
      .is('std_slot_id', null);

    customSlotsData = (data || []).map((slot) => ({
      id: slot.id,
      start_time: slot.break_start_time,
      duration_minutes: slot.break_duration_minutes,
      capacity: slot.capacity || 999,
      break_type: slot.break_type,
      is_custom: true,
    }));
  } catch {
    customSlotsData = [];
  }

  const allSlots = sortBreakSlots(
    [...standardSlotsWithIds, ...customSlotsData],
    shiftKey
  );

  let processedScheduled = [];
  try {
    const { data: scheduledData } = await supabase
      .from('scheduled_breaks')
      .select(`
        id, user_id, break_start_time, break_duration_minutes, break_type, location,
        profiles:user_id (first_name, last_name, shift_preference)
      `)
      .eq('date', date)
      .eq('shift_type', shiftLower)
      .eq('location', location)
      .not('user_id', 'is', null);

    processedScheduled = (scheduledData || [])
      .map((record) => {
        if (!record.profiles) return null;
        const matchingSlot = allSlots.find((slot) => {
          const slotDbBreakType = mapToDbBreakType(slot.break_type);
          const slotTimeHHMM = slot.start_time?.substring(0, 5);
          const recordTimeHHMM = record.break_start_time?.substring(0, 5);
          return (
            slotTimeHHMM === recordTimeHHMM &&
            slot.duration_minutes === record.break_duration_minutes &&
            slotDbBreakType === record.break_type
          );
        });
        return {
          id: record.id,
          slot_id: matchingSlot?.id || null,
          user_id: record.user_id,
          user_name: `${record.profiles.first_name} ${record.profiles.last_name}`,
          preferred_shift: record.profiles.shift_preference,
          location: record.location || location,
        };
      })
      .filter(Boolean);
  } catch {
    processedScheduled = [];
  }

  const absentUserIds = new Set();
  try {
    const { data: scheduledShifts } = await supabase
      .from('scheduled_rota')
      .select('id, user_id')
      .eq('date', date)
      .eq('shift_type', shiftLower)
      .eq('location', location)
      .not('user_id', 'is', null);

    const rotaIds = (scheduledShifts || []).map((r) => r.id).filter(Boolean);
    if (rotaIds.length > 0) {
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('scheduled_rota_id')
        .in('scheduled_rota_id', rotaIds);
      const absentRotaIds = new Set((attendanceData || []).map((a) => a.scheduled_rota_id));
      (scheduledShifts || []).forEach((record) => {
        if (record.id && absentRotaIds.has(record.id) && record.user_id) {
          absentUserIds.add(record.user_id);
        }
      });
    }
  } catch {
    // leave empty
  }

  const assignments = processedScheduled.filter(
    (a) => !absentUserIds.has(a.user_id)
  );

  return { shift: shiftKey, slots: allSlots, assignments };
}

export async function fetchTmBreakBoards({ date, location }) {
  const boards = await Promise.all(
    TM_BREAK_SHIFTS.map((shift) =>
      fetchTmBreakBoardForShift({ date, location, shift })
    )
  );
  return boards;
}
