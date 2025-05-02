import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';

export default function UpdatePasswordForm({ onComplete, recoveryHash }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);

  // Process tokens from URL and establish session on component mount
  useEffect(() => {
    const processAccessToken = async () => {
      try {
        setSessionChecked(false);
        
        // Check if we have a hash in the URL with an access token
        const hash = window.location.hash;
        const url = window.location.href;
        
        console.log('UpdatePasswordForm: Processing URL for tokens:', { hash });
        
        // First try to get existing session
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (sessionData.session) {
          console.log('UpdatePasswordForm: Active session already exists');
          setSessionChecked(true);
          return;
        }
        
        // Check provided recovery hash prop
        if (recoveryHash) {
          console.log('UpdatePasswordForm: Using provided recovery hash');
          window.location.hash = recoveryHash;
          
          // Try to establish session with recovery hash
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('UpdatePasswordForm: Error setting session from provided hash:', error);
            setError('Could not authenticate with the provided link. Please request a new password reset link.');
            setSessionChecked(true);
            return;
          }
          
          if (data.session) {
            console.log('UpdatePasswordForm: Session established from provided hash');
            setSessionChecked(true);
            return;
          }
        }
        
        // No existing session, check if we have tokens in URL
        if (!hash || (!hash.includes('access_token') && !url.includes('access_token'))) {
          console.log('UpdatePasswordForm: No access token found in URL');
          setError('No authentication token found. Please use a valid password reset link.');
          setSessionChecked(true);
          return;
        }
        
        // We have a hash with access token, process it
        console.log('UpdatePasswordForm: Found access token in URL, setting session...');
        
        // This will parse the hash and set the session
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('UpdatePasswordForm: Error setting session from URL:', error);
          setError('Could not authenticate with the provided link. Please request a new password reset link.');
          setSessionChecked(true);
          return;
        }
        
        console.log('UpdatePasswordForm: Session established successfully:', !!data.session);
        setSessionChecked(true);
      } catch (err) {
        console.error('UpdatePasswordForm: Unexpected error processing tokens:', err);
        setError('An unexpected error occurred. Please try again or request a new password reset link.');
        setSessionChecked(true);
      }
    };

    processAccessToken();
  }, [recoveryHash]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!password) {
      setError('Please enter a new password');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      console.log('UpdatePasswordForm: Attempting to update password...');
      
      // Get current session to ensure we have one before updating
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        console.error('UpdatePasswordForm: No active session found when trying to update password');
        throw new Error('Your password reset session has expired. Please request a new reset link.');
      }
      
      const { data, error } = await supabase.auth.updateUser({ 
        password 
      });
      
      if (error) throw error;
      
      console.log('UpdatePasswordForm: Password updated successfully:', data);
      
      setSuccess('Your password has been updated successfully.');
      
      // After successful password reset, notify parent to redirect to login after a brief delay
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
      
    } catch (error) {
      console.error('UpdatePasswordForm: Update failed:', error);
      
      // If the error is about no session or expired token, give more helpful message
      if (error.message.includes('session') || error.message.includes('token') || error.message.includes('expired')) {
        setError('Your password reset link has expired or is invalid. Please request a new one.');
      } else {
        setError(error.message || 'Failed to update password');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="text-center">
        <div className="animate-pulse flex justify-center mb-4">
          <div className="h-6 w-6 bg-white/30 rounded-full"></div>
        </div>
        <p className="text-white/80">Preparing password reset...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-white">Set New Password</h2>
        <p className="text-sm text-white/80 mt-1">Create a new password for your account</p>
      </div>
      
      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm text-red-100 p-3 rounded-md mb-4 border border-red-400/30 flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/20 backdrop-blur-sm text-green-100 p-3 rounded-md mb-4 border border-green-400/30 flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{success}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="password" className="block text-white text-sm font-medium mb-2">
            New Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-md focus:outline-none focus:border-white/50 text-white"
            placeholder="Enter new password"
            autoComplete="new-password"
            required
          />
        </div>
        
        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-white text-sm font-medium mb-2">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-md focus:outline-none focus:border-white/50 text-white"
            placeholder="Confirm your password"
            autoComplete="new-password"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || success}
          className={`w-full py-2 px-4 rounded-md border focus:outline-none transition-all shadow-md text-white ${
            success 
              ? 'bg-green-600/50 border-green-400/30 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur-xl border-white/30 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {loading ? 'Updating...' : success ? 'Password Updated' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}

UpdatePasswordForm.propTypes = {
  onComplete: PropTypes.func,
  recoveryHash: PropTypes.string
}; 