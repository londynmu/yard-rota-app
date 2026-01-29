import { createClient } from '@supabase/supabase-js';

// Load configuration from environment variables with fallback to hardcoded values
// This ensures the app works in production even if env vars are not set
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jkjvtvwedjiupxoibpld.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpranZ0dndlZGppdXB4b2licGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0NDI0MDMsImV4cCI6MjA2MTAxODQwM30.J15XgpiHz-oKSghqctJ8Bll0BXdbKO_rexeav1lj8Gw';
const siteUrl = import.meta.env.VITE_SITE_URL || 'https://shunters.net';

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