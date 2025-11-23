import { supabase } from '../lib/supabaseClient';

// Helper: convert month key 'YYYY-MM' to a DATE string 'YYYY-MM-01'
const monthKeyToDate = (monthKey) => {
  if (!monthKey || typeof monthKey !== 'string') return null;
  const [year, month] = monthKey.split('-');
  if (!year || !month) return null;
  return `${year}-${month}-01`;
};

// Helper: convert DATE string 'YYYY-MM-DD' from DB into month key 'YYYY-MM'
const dateToMonthKey = (dateStr) => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  } catch (e) {
    console.error('[shunterAwardsApi] Invalid date for month key:', dateStr, e);
    return null;
  }
};

// Get all awards in a month range (inclusive), joined with basic profile info
export async function getMonthlyAwards({ fromMonth, toMonth }) {
  const fromDate = monthKeyToDate(fromMonth);
  const toDate = monthKeyToDate(toMonth);

  let query = supabase
    .from('monthly_shunter_awards')
    .select(
      `
        id,
        user_id,
        award_month,
        period,
        amount,
        awarded_at,
        profiles:user_id (
          first_name,
          last_name
        )
      `
    )
    .order('award_month', { ascending: false })
    .order('period', { ascending: true });

  if (fromDate) {
    query = query.gte('award_month', fromDate);
  }
  if (toDate) {
    query = query.lte('award_month', toDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[shunterAwardsApi] getMonthlyAwards error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    awardMonth: dateToMonthKey(row.award_month),
    period: row.period, // 'day' | 'night'
    amount: row.amount,
    awardedAt: row.awarded_at,
    firstName: row.profiles?.first_name || '',
    lastName: row.profiles?.last_name || '',
  }));
}

// Upsert a single award for given month + period
export async function createOrUpdateMonthlyAward({
  awardMonthKey,
  period,
  userId,
  amount = 50,
  adminUserId = null,
}) {
  const awardMonthDate = monthKeyToDate(awardMonthKey);
  if (!awardMonthDate) {
    throw new Error('Invalid awardMonthKey, expected YYYY-MM');
  }
  if (!userId) {
    throw new Error('userId is required');
  }
  if (period !== 'day' && period !== 'night') {
    throw new Error("period must be 'day' or 'night'");
  }

  const payload = {
    user_id: userId,
    award_month: awardMonthDate,
    period,
    amount,
    awarded_by: adminUserId || null,
  };

  const { data, error } = await supabase
    .from('monthly_shunter_awards')
    .upsert(payload, {
      onConflict: 'award_month,period',
    })
    .select()
    .single();

  if (error) {
    console.error('[shunterAwardsApi] createOrUpdateMonthlyAward error:', error);
    throw error;
  }

  return {
    id: data.id,
    userId: data.user_id,
    awardMonth: dateToMonthKey(data.award_month),
    period: data.period,
    amount: data.amount,
    awardedAt: data.awarded_at,
  };
}

// Get last award (day & night) per user across all history
// Returns a Map<userId, { day: 'YYYY-MM' | null, night: 'YYYY-MM' | null }>
export async function getUsersLastAwards() {
  const { data, error } = await supabase
    .from('monthly_shunter_awards')
    .select('user_id, award_month, period')
    .order('award_month', { ascending: false });

  if (error) {
    console.error('[shunterAwardsApi] getUsersLastAwards error:', error);
    throw error;
  }

  const result = new Map();

  (data || []).forEach((row) => {
    const userId = row.user_id;
    const monthKey = dateToMonthKey(row.award_month);
    if (!userId || !monthKey) return;

    if (!result.has(userId)) {
      result.set(userId, { day: null, night: null });
    }
    const entry = result.get(userId);

    if (row.period === 'day' && !entry.day) {
      entry.day = monthKey;
    }
    if (row.period === 'night' && !entry.night) {
      entry.night = monthKey;
    }
  });

  return result;
}

// Get awards only for the current month (for user/mobile card)
export async function getCurrentMonthAwards(currentDate = new Date()) {
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const monthKey = `${year}-${month}`;
  const awardMonthDate = monthKeyToDate(monthKey);

  const { data, error } = await supabase
    .from('monthly_shunter_awards')
    .select(
      `
        id,
        user_id,
        award_month,
        period,
        amount,
        awarded_at,
        profiles:user_id (
          first_name,
          last_name
        )
      `
    )
    .eq('award_month', awardMonthDate);

  if (error) {
    console.error('[shunterAwardsApi] getCurrentMonthAwards error:', error);
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    awardMonth: dateToMonthKey(row.award_month),
    period: row.period,
    amount: row.amount,
    awardedAt: row.awarded_at,
    firstName: row.profiles?.first_name || '',
    lastName: row.profiles?.last_name || '',
  }));
}

// Delete a single award by id
export async function deleteAwardById(id) {
  if (!id) throw new Error('Award id is required');

  const { error } = await supabase
    .from('monthly_shunter_awards')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[shunterAwardsApi] deleteAwardById error:', error);
    throw error;
  }
}



