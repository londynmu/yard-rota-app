import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkjvtvwedjiupxoibpld.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpranZ0dndlZGppdXB4b2licGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0NDI0MDMsImV4cCI6MjA2MTAxODQwM30.J15XgpiHz-oKSghqctJ8Bll0BXdbKO_rexeav1lj8Gw';

// Site URL for redirects
const siteUrl = 'https://shunters.net';

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
  from: (table) => {
    const originalFrom = originalSupabaseClient.from(table);
    
    return {
      ...originalFrom,
      update: (data) => {
        console.log(`Supabase: Updating ${table} with:`, data);
        const originalUpdate = originalFrom.update(data);
        
        return {
          ...originalUpdate,
          eq: (column, value) => {
            console.log(`Supabase: Condition ${column} = ${value}`);
            const originalEq = originalUpdate.eq(column, value);
            
            return originalEq; // Return the original result directly without modification
          }
        };
      },
      insert: (data) => {
        console.log(`Supabase: Inserting into ${table}:`, data);
        return originalFrom.insert(data);
      },
      select: (columns) => {
        console.log(`Supabase: Selecting from ${table}:`, columns);
        return originalFrom.select(columns);
      },
      upsert: (data, options) => {
        console.log(`Supabase: Upserting into ${table}:`, data);
        return originalFrom.upsert(data, options);
      },
      delete: () => {
        console.log(`Supabase: Deleting from ${table}`);
        return originalFrom.delete();
      }
    };
  },
  rpc: (functionName, params) => {
    console.log(`Supabase: Calling RPC function ${functionName} with:`, params);
    return originalSupabaseClient.rpc(functionName, params);
  }
}; 