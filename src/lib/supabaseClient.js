import { createClient } from '@supabase/supabase-js';

// Load configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const siteUrl = import.meta.env.VITE_SITE_URL || 'https://shunters.net';

// Validate required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing required environment variables. Please check your .env file.'
  );
}

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
        storageKey: 'sb-jkjvtvwedjiupxoibpld-auth-token' // Using the actual key format used by Supabase
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