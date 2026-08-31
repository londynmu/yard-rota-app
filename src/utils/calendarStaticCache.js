/**
 * Deduplicates in-flight fetches for calendar "dictionary" data (locations, settings)
 * so parallel mounts / Strict Mode do not double-hit Supabase for the same session.
 */
let locationsNamesPromise = null;
let showManageBreaksPromise = null;
let homePromoCardsPromise = null;

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

/** @returns {Promise<{ showShunterOfTheMonthCard: boolean, showShunterGuideCard: boolean }>} */
export function fetchHomePromoCardsCached(supabase) {
  if (!homePromoCardsPromise) {
    homePromoCardsPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['show_shunter_of_the_month_card', 'show_shunter_guide_card']);
        if (error) throw error;
        const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
        return {
          showShunterOfTheMonthCard: map.show_shunter_of_the_month_card !== 'false',
          showShunterGuideCard: map.show_shunter_guide_card !== 'false',
        };
      } catch {
        return {
          showShunterOfTheMonthCard: true,
          showShunterGuideCard: true,
        };
      }
    })();
  }
  return homePromoCardsPromise;
}

export function resetCalendarStaticCache() {
  locationsNamesPromise = null;
  showManageBreaksPromise = null;
  homePromoCardsPromise = null;
}
