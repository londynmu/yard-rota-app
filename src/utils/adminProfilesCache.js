import { supabase } from '../lib/supabaseClient';

const CACHE_TTL_MS = 60_000;

/** @type {{ at: number, users: object[] } | null} */
let cache = null;
/** @type {Promise<object[]> | null} */
let inFlight = null;

function mapRpcRows(rpcData) {
  return (rpcData || []).map((row) => ({
    ...row,
    performance_score: row.performance_score ?? 50,
    is_active: row.is_active !== false,
    show_on_reports: row.show_on_reports !== false,
    agency_name: row.agency_name ?? null,
  }));
}

function mapProfileRows(profilesData) {
  return (profilesData || []).map((profile) => ({
    ...profile,
    performance_score: profile.performance_score ?? 50,
    is_active: profile.is_active !== false,
    show_on_reports: profile.show_on_reports !== false,
    agency_name: profile.agencies?.name ?? null,
  }));
}

/**
 * Single-flight + short TTL cache for admin profile lists.
 * Dedupes React Strict Mode double mounts and rapid remounts.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchAdminProfilesCached(opts = {}) {
  const force = Boolean(opts.force);
  const now = Date.now();

  if (!force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.users;
  }

  if (!force && inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_profiles_with_emails');
      if (!rpcError && Array.isArray(rpcData)) {
        let usersList = mapRpcRows(rpcData);
        const firstRow = usersList[0];
        if (usersList.length > 0 && !Object.prototype.hasOwnProperty.call(firstRow, 'role')) {
          const ids = usersList.map((u) => u.id);
          const { data: roleData } = await supabase.from('profiles').select('id, role').in('id', ids);
          const roleMap = new Map((roleData || []).map((r) => [r.id, r.role]));
          usersList = usersList.map((u) => ({ ...u, role: roleMap.get(u.id) ?? null }));
        }
        cache = { at: Date.now(), users: usersList };
        return usersList;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(
          'id, first_name, last_name, role, account_status, is_active, show_on_reports, performance_score, agency_id, avatar_url, shift_preference, preferred_location, yard_system_id, deleted_at, agencies(id, name)',
        )
        .is('deleted_at', null);

      if (profilesError) throw profilesError;
      if (!Array.isArray(profilesData)) {
        throw new Error('Invalid data format received from profiles table');
      }

      const usersList = mapProfileRows(profilesData);
      cache = { at: Date.now(), users: usersList };
      return usersList;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Clear cache after mutations that change the admin user list. */
export function invalidateAdminProfilesCache() {
  cache = null;
  inFlight = null;
}
