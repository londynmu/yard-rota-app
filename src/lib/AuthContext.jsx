import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import PropTypes from 'prop-types';
import { resetCalendarStaticCache } from '../utils/calendarStaticCache';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';

// Site URL for redirects - load from environment variables
const siteUrl = import.meta.env.VITE_SITE_URL || 'https://shunters.net';

const AuthContext = createContext();

/** Shared profile row for header, notifications, ShiftDashboard — set from App.jsx after gate check */
export const PROFILE_SELECT_FIELDS =
  'profile_completed, account_status, role, first_name, last_name, avatar_url, shift_preference';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionProfile, setSessionProfile] = useState(null);

  useEffect(() => {
    // Get user session on first load
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user || null;
      if (!newUser) {
        setUser(null);
        setSessionProfile(null);
        resetCalendarStaticCache();
        return;
      }
      // Only update state if user identity changed (login/logout/switch user)
      // Skip update on token refresh to prevent unnecessary re-renders across the app
      setUser(prev => (prev?.id === newUser?.id) ? prev : newUser);
    });

    return () => {
      subscription.unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setSessionProfile(null);
      resetCalendarStaticCache();
    }
  }, [user]);

  const refreshSessionProfile = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      setSessionProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_FIELDS)
      .eq('id', uid)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('[AuthContext] refreshSessionProfile:', error);
      return;
    }
    setSessionProfile(data || null);
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { data, error };
  };

  const signUp = async (email, password) => {
    // Ensure redirects point to the base site URL for email verification
    const redirectURL = siteUrl;
    
    // Restore options object
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectURL,
      }
    });
    
    return { data, error };
  };

  const resetPassword = async (email) => {
    try {
      // Check if we're in development or production
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      
      // Create a correctly formatted redirect URL based on environment
      const baseUrl = isLocalhost ? window.location.origin : siteUrl;
      
      // Use the full path to reset-password
      const redirectURL = `${baseUrl}/reset-password`;
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectURL,
      });
      
      if (error) {
        console.error('AuthContext: Reset password error:', error);
        return { error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error('AuthContext: Unexpected error in resetPassword:', err);
      return { data: null, error: err };
    }
  };

  const signOut = async () => {
    try {
      // 1. Immediately update local state
      setUser(null);
      setSessionProfile(null);
      resetCalendarStaticCache();
      
      // 2. Attempt to sign out from Supabase (global scope)
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (signOutError) {
        console.error('Error during Supabase sign out API call:', signOutError);
        // Log the error but proceed with client-side cleanup
      }
      
      // 3. Clear only auth-related storage (preserve user preferences)
      // Remove Supabase auth token
      localStorage.removeItem('sb-jkjvtvwedjiupxoibpld-auth-token');
      localStorage.removeItem('recoveryHash');
      
      // Remove session tracking
      sessionStorage.removeItem('page_tracking_session_id');
      
      // 4. Add a slightly longer delay to ensure cleanup completes before redirect
      await new Promise(resolve => setTimeout(resolve, 200)); 
      
      // 5. Redirect using window.location.replace to clear history
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      
      if (isLocalhost) {
        window.location.replace('/login');
      } else {
        window.location.replace(`${siteUrl}/login`);
      }
      
      return { error: null };

    } catch (error) {
      // Catch any unexpected errors during the overall process
      console.error('Unexpected exception during sign out process:', error);
      
      // Fallback cleanup just in case
      setUser(null);
      setSessionProfile(null);
      resetCalendarStaticCache();
      localStorage.removeItem('sb-jkjvtvwedjiupxoibpld-auth-token');
      localStorage.removeItem('recoveryHash');
      sessionStorage.removeItem('page_tracking_session_id');
      
      // Fallback redirect
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        window.location.replace('/login');
      } else {
        window.location.replace(`${siteUrl}/login`);
      }
      
      return { error };
    }
  };

  const value = {
    user,
    loading,
    sessionProfile,
    setSessionProfile,
    refreshSessionProfile,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export function useAuth() {
  return useContext(AuthContext);
} 