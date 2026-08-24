import { addDays, format } from 'date-fns';
import {
  assignmentSlotKey,
  countAdditionalPeople,
  diffAddedSlots,
  formatShiftClock,
  groupAddedSlotsByAgency,
  normalizeShiftDate,
} from './rotaAdditionalBookings';

/**
 * @param {Date} weekStart
 * @returns {string}
 */
export function weekStartIso(weekStart) {
  return format(weekStart, 'yyyy-MM-dd');
}

/**
 * Assigned scheduled_rota rows for Saturday–Friday, with live profile/agency.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Date} weekStart
 * @returns {Promise<object[]>}
 */
export async function fetchAssignedSlotsForWeek(supabase, weekStart) {
  const start = weekStartIso(weekStart);
  const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const { data: scheduleData, error: scheduleError } = await supabase
    .from('scheduled_rota')
    .select('id, date, shift_type, location, start_time, end_time, user_id')
    .gte('date', start)
    .lte('date', end)
    .not('user_id', 'is', null);

  if (scheduleError) throw scheduleError;
  if (!scheduleData?.length) return [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, agency_id');
  if (profilesError) throw profilesError;

  const { data: agenciesData, error: agenciesError } = await supabase
    .from('agencies')
    .select('id, name, email');
  if (agenciesError) throw agenciesError;

  const profilesMap = {};
  (profilesData || []).forEach((profile) => {
    profilesMap[profile.id] = profile;
  });
  const agenciesMap = {};
  (agenciesData || []).forEach((agency) => {
    agenciesMap[agency.id] = agency;
  });

  return scheduleData.map((slot) => {
    const profile = profilesMap[slot.user_id] || {};
    const agency = profile.agency_id ? agenciesMap[profile.agency_id] : null;
    return {
      user_id: slot.user_id,
      date: normalizeShiftDate(slot.date),
      shift_type: slot.shift_type,
      location: slot.location,
      start_time: slot.start_time,
      end_time: slot.end_time,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      agency_id: profile.agency_id || null,
      agency_name: agency?.name || '',
      agency_email: agency?.email || '',
    };
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} weekStart
 * @returns {Promise<{ baseline: object|null, slots: object[] }>}
 */
export async function loadWeekBaseline(supabase, weekStart) {
  const { data: baseline, error: baselineError } = await supabase
    .from('rota_week_baselines')
    .select('id, week_start, source, created_by, created_at, updated_at')
    .eq('week_start', weekStart)
    .maybeSingle();

  if (baselineError) throw baselineError;
  if (!baseline) return { baseline: null, slots: [] };

  const { data: slots, error: slotsError } = await supabase
    .from('rota_week_baseline_slots')
    .select('id, baseline_id, user_id, date, start_time, end_time, location, shift_type')
    .eq('baseline_id', baseline.id);

  if (slotsError) throw slotsError;
  return { baseline, slots: slots || [] };
}

function toBaselineSlotRow(baselineId, slot) {
  return {
    baseline_id: baselineId,
    user_id: slot.user_id,
    date: normalizeShiftDate(slot.date),
    start_time: formatShiftClock(slot.start_time),
    end_time: formatShiftClock(slot.end_time),
    location: slot.location || '',
    shift_type: slot.shift_type || '',
  };
}

/**
 * Create the week baseline only if none exists. Empty rota is a no-op.
 * @returns {Promise<{ created: boolean, reason?: string, baselineId?: string }>}
 */
export async function ensureWeekBaseline(supabase, { weekStartIso: weekIso, source, slots, userId }) {
  if (!slots?.length) return { created: false, reason: 'empty' };

  const { data: existing, error: existingError } = await supabase
    .from('rota_week_baselines')
    .select('id')
    .eq('week_start', weekIso)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return { created: false, reason: 'exists', baselineId: existing.id };

  const { data: inserted, error: insertError } = await supabase
    .from('rota_week_baselines')
    .insert({
      week_start: weekIso,
      source,
      created_by: userId || null,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return { created: false, reason: 'exists' };
    }
    throw insertError;
  }

  const rows = slots
    .filter((slot) => slot?.user_id)
    .map((slot) => toBaselineSlotRow(inserted.id, slot));

  if (rows.length) {
    const { error: slotsError } = await supabase
      .from('rota_week_baseline_slots')
      .insert(rows);
    if (slotsError) throw slotsError;
  }

  return { created: true, baselineId: inserted.id };
}

/**
 * Merge sent additional-booking slots into the existing baseline (idempotent).
 */
export async function mergeSlotsIntoBaseline(supabase, baselineId, slotsToAdd) {
  if (!baselineId || !slotsToAdd?.length) return { merged: 0 };

  const { data: existing, error: existingError } = await supabase
    .from('rota_week_baseline_slots')
    .select('user_id, date, start_time, end_time, location')
    .eq('baseline_id', baselineId);

  if (existingError) throw existingError;

  const keys = new Set((existing || []).map(assignmentSlotKey));
  const newRows = slotsToAdd
    .filter((slot) => slot?.user_id && !keys.has(assignmentSlotKey(slot)))
    .map((slot) => toBaselineSlotRow(baselineId, slot));

  if (newRows.length) {
    const { error: insertError } = await supabase
      .from('rota_week_baseline_slots')
      .insert(newRows);
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from('rota_week_baselines')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', baselineId);
  if (updateError) throw updateError;

  return { merged: newRows.length };
}

export async function resetWeekBaseline(supabase, weekIso) {
  const { error } = await supabase
    .from('rota_week_baselines')
    .delete()
    .eq('week_start', weekIso);
  if (error) throw error;
}

/**
 * People count for the planner Export badge. 0 if there is no baseline.
 */
export async function countPendingAdditionalPeople(supabase, weekStart) {
  const weekIso = weekStartIso(weekStart);
  const [{ baseline, slots: baselineSlots }, currentSlots] = await Promise.all([
    loadWeekBaseline(supabase, weekIso),
    fetchAssignedSlotsForWeek(supabase, weekStart),
  ]);
  if (!baseline) return 0;
  const added = diffAddedSlots(currentSlots, baselineSlots);
  const groups = groupAddedSlotsByAgency(added, baselineSlots);
  return countAdditionalPeople(groups);
}
