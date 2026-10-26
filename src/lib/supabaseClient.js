import { createClient } from '@supabase/supabase-js';

// Prefer Netlify / local env. Hardcoded fallbacks kept until production + preview
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are confirmed on Netlify.
// TODO(#3 Wave D): remove FALLBACK_* after Netlify env is verified; do not rotate anon key yet.
const FALLBACK_SUPABASE_URL = 'https://jkjvtvwedjiupxoibpld.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpranZ0dndlZGppdXB4b2licGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0NDI0MDMsImV4cCI6MjA2MTAxODQwM30.J15XgpiHz-oKSghqctJ8Bll0BXdbKO_rexeav1lj8Gw';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_SITE_URL || 'https://shunters.net';

/** True when production build is missing required VITE_SUPABASE_* env vars. */
export const supabaseMissingEnv = Boolean(
  import.meta.env.PROD && (!envUrl || !envAnonKey),
);

const usingFallback = !envUrl || !envAnonKey;
if (usingFallback) {
  console.warn(
    '[Yard Rota] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing; using hardcoded fallback. Confirm Netlify env before removing fallbacks (Wave D #3).',
  );
}

const supabaseUrl = envUrl || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = envAnonKey || FALLBACK_SUPABASE_ANON_KEY;

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return ref || 'jkjvtvwedjiupxoibpld';
  } catch {
    return 'jkjvtvwedjiupxoibpld';
  }
}

const storageKey = `sb-${projectRefFromUrl(supabaseUrl)}-auth-token`;

// Singleton pattern to ensure only one client instance is created
let supabaseInstance = null;

// Create Supabase client with custom auth settings
const createSupabaseClient = () => {
  if (supabaseInstance === null) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        redirectTo: `${siteUrl}/login`,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true, // Enable session detection from URL hash
        storageKey,
      },
      global: {
        headers: {
          'X-Client-Info': 'yard-rota-app'
        }
      }
    });
  }
  return supabaseInstance;
};

// Create a custom supabase client with debug logging
const originalSupabaseClient = createSupabaseClient();

// Create enhanced supabase client with better debugging
export const supabase = {
  ...originalSupabaseClient,
  storage: originalSupabaseClient.storage,
  from: originalSupabaseClient.from.bind(originalSupabaseClient),
  rpc: originalSupabaseClient.rpc.bind(originalSupabaseClient)
};
