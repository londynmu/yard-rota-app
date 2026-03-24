/**
 * Deduplicates in-flight fetches for calendar "dictionary" data (locations, settings)
 * so parallel mounts / Strict Mode do not double-hit Supabase for the same session.
 */
let locationsNamesPromise = null;
let showManageBreaksPromise = null;

export function fetchActiveLocationNamesCached(supabase) {
  if (!locationsNamesPromise) {
    locationsNamesPromise = supabase
      .from('locations')
      .select('name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((loc) => loc.name).filter(Boolean);
      })
      .catch((err) => {
        locationsNamesPromise = null;
        throw err;
      });
  }
  return locationsNamesPromise;
}

export function fetchShowManageBreaksCached(supabase) {
  if (!showManageBreaksPromise) {
    showManageBreaksPromise = (async () => {
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'show_manage_breaks_button')
          .single();
        return data?.value !== 'false';
      } catch {
        return true;
      }
    })();
  }
  return showManageBreaksPromise;
}

export function resetCalendarStaticCache() {
  locationsNamesPromise = null;
  showManageBreaksPromise = null;
}
