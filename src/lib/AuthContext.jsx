import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import PropTypes from 'prop-types';

// Site URL for redirects
const siteUrl = 'https://shunters.net';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
      console.log('[AuthContext] onAuthStateChange Event:', _event);
      console.log('[AuthContext] onAuthStateChange Session:', session);
      
      // Directly set the user state without delays or processing flag
      setUser(session?.user || null);
      console.log('[AuthContext] User state updated to:', session?.user || null);
    });

    return () => {
      console.log('[AuthContext] Unsubscribing from auth changes.');
      subscription.unsubscribe();
    }
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
    console.log(`AuthContext: Sending password reset for ${email}`);
    
    try {
      // Check if we're in development or production
      const isLocalhost = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';
      
      // Create a correctly formatted redirect URL based on environment
      const baseUrl = isLocalhost ? window.location.origin : siteUrl;
      
      // Use the full path to reset-password
      const redirectURL = `${baseUrl}/reset-password`;
      
      console.log(`AuthContext: Using redirect URL: ${redirectURL}`);
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectURL,
      });
      
      if (error) {
        console.error('AuthContext: Reset password error:', error);
        return { error };
      }
      
      console.log('AuthContext: Password reset email sent successfully');
      
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
      
      // 2. Attempt to sign out from Supabase (global scope)
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (signOutError) {
        console.error('Error during Supabase sign out API call:', signOutError);
        // Log the error but proceed with client-side cleanup
      }
      
      // 3. Aggressively clear all client-side storage
      // This is crucial to prevent the listener from picking up old tokens
      localStorage.clear();
      sessionStorage.clear();
      
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
      localStorage.clear();
      sessionStorage.clear();
      
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