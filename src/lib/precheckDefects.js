/**
 * Fetch open (non-resolved) defects for a tug, grouped by check item key.
 * Used in PreCheckForm to show shunters existing known defects before they report.
 * @param {string} tugId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Record<string, Array<{ id: string; description: string; reporterName: string; date: string; imageUrls: string[]; repairStatus: string }>>>}
 */
export async function getOpenDefectsForTug(tugId, supabase) {
  if (!tugId || !supabase) return {};

  const { data, error } = await supabase
    .from('precheck_damages')
    .select(`
      id,
      description,
      image_urls,
      created_at,
      repair_status,
      precheck_submissions!inner(
        tug_id,
        check_date,
        check_time,
        profiles:user_id(first_name, last_name)
      ),
      precheck_items!inner(item_name)
    `)
    .eq('precheck_submissions.tug_id', tugId)
    .neq('repair_status', 'resolved')
    .eq('source', 'check_item')
    .not('item_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[precheckDefects] Error fetching open defects:', error);
    return {};
  }

  const byItem = {};
  for (const d of data || []) {
    const itemName = d.precheck_items?.item_name;
    if (!itemName) continue;

    const profile = d.precheck_submissions?.profiles;
    const reporterName = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'
      : 'Unknown';

    const dateVal = d.precheck_submissions?.check_date || d.precheck_submissions?.check_time || d.created_at;
    const date = dateVal
      ? new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';

    const entry = {
      id: d.id,
      description: d.description || '',
      reporterName,
      date,
      imageUrls: Array.isArray(d.image_urls) ? d.image_urls : [],
      repairStatus: d.repair_status || 'open',
    };

    if (!byItem[itemName]) byItem[itemName] = [];
    byItem[itemName].push(entry);
  }

  return byItem;
}

/**
 * Split defects by item into ones that still need shunter action and ones
 * VMU has acknowledged (known, will not be repaired – shown as info only).
 * @param {Record<string, Array<{ repairStatus?: string }>>} byItem
 * @returns {{ active: Record<string, Array<object>>, acknowledged: Record<string, Array<object>> }}
 */
export function splitAcknowledged(byItem) {
  const active = {};
  const acknowledged = {};
  for (const [itemKey, defects] of Object.entries(byItem || {})) {
    for (const def of defects) {
      const target = def.repairStatus === 'acknowledged' ? acknowledged : active;
      if (!target[itemKey]) target[itemKey] = [];
      target[itemKey].push(def);
    }
  }
  return { active, acknowledged };
}
