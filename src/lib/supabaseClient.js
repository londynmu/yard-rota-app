import { createClient } from '@supabase/supabase-js';

function requiredEnv(name) {
  const value = String(import.meta.env[name] || '').trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SITE_URL before starting the app.`
    );
  }
  return value;
}

function normalizeSiteUrl(raw) {
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProto.replace(/\/$/, '');
}

function authStorageKeyFromSupabaseUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid URL, e.g. https://<project-ref>.supabase.co');
  }
  const ref = hostname.split('.')[0];
  if (!ref) {
    throw new Error('VITE_SUPABASE_URL must include a Supabase project ref');
  }
  return `sb-${ref}-auth-token`;
}

export const supabaseUrl = requiredEnv('VITE_SUPABASE_URL');
export const supabaseAnonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');
export const siteUrl = normalizeSiteUrl(requiredEnv('VITE_SITE_URL'));
export const authStorageKey = authStorageKeyFromSupabaseUrl(supabaseUrl);

let supabaseInstance = null;

const createSupabaseClient = () => {
  if (supabaseInstance === null) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        redirectTo: `${siteUrl}/login`,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: authStorageKey,
      },
      global: {
        headers: {
          'X-Client-Info': 'yard-rota-app',
        },
      },
    });
  }
  return supabaseInstance;
};

const originalSupabaseClient = createSupabaseClient();

export const supabase = {
  ...originalSupabaseClient,
  storage: originalSupabaseClient.storage,
  from: originalSupabaseClient.from.bind(originalSupabaseClient),
  rpc: originalSupabaseClient.rpc.bind(originalSupabaseClient),
};
