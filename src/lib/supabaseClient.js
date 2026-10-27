import { createClient } from '@supabase/supabase-js';

// Production / preview builds must receive VITE_* from Netlify
// (`netlify.toml` [build.environment] and/or Site env).
// Local `npm run dev` can use `.env` (see `.env.example`).
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_SITE_URL || 'https://shunters.net';

/** True when production build is missing required VITE_SUPABASE_* env vars. */
export const supabaseMissingEnv = Boolean(
  import.meta.env.PROD && (!envUrl || !envAnonKey),
);

if (supabaseMissingEnv) {
  console.error(
    '[Yard Rota] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in production build. Set them on Netlify (Site env or netlify.toml [build.environment]).',
  );
} else if (!import.meta.env.PROD && (!envUrl || !envAnonKey)) {
  console.warn(
    '[Yard Rota] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing. Copy .env.example to .env for local dev.',
  );
}

const supabaseUrl = envUrl || '';
const supabaseAnonKey = envAnonKey || '';

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return ref || 'jkjvtvwedjiupxoibpld';
  } catch {
    return 'jkjvtvwedjiupxoibpld';
  }
}

const storageKey = `sb-${projectRefFromUrl(supabaseUrl || 'https://jkjvtvwedjiupxoibpld.supabase.co')}-auth-token`;

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
