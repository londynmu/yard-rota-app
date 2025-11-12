import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function WaitingForApprovalPage() {
  const { user, signOut } = useAuth();
  const [accountStatus, setAccountStatus] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkApprovalStatus = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('account_status')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        setAccountStatus(data?.account_status || 'checking');
      } catch (err) {
        console.error('Error checking approval status:', err);
        setError('Failed to load your account status. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    checkApprovalStatus();

    // Set up a polling interval to check status every 30 seconds
    const interval = setInterval(checkApprovalStatus, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If the user has been approved, redirect to the main app
  if (accountStatus === 'approved') {
    return <Navigate to="/" replace />;
  }

  // If the user has been rejected, show a message
  if (accountStatus === 'rejected') {
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-6 rounded-lg border border-red-200 dark:border-red-800 shadow-lg">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold text-center mb-4">Account Access Denied</h2>
          <p className="text-white/80 text-center mb-6">
            Your account registration has been rejected. Please contact the administrator for more information.
          </p>
          <button
            onClick={handleSignOut}
            className="w-full bg-white/10 hover:bg-white/20 text-white py-2 px-4 rounded-md transition-colors border border-white/20"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex justify-center items-center bg-cream dark:bg-gray-900 p-4">
      {loading ? (
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black dark:border-white"></div>
      ) : error ? (
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-6 rounded-lg border border-red-200 dark:border-red-800 shadow-lg">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black py-2 px-4 rounded-lg transition-colors font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold text-center mb-4 text-charcoal dark:text-white">Profile Awaiting Approval</h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            Thank you for completing your profile! Your account is now awaiting administrator approval.
            You'll gain full access to the system once approved.
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-sm text-center mb-6">
            This page will automatically update when your status changes.
          </p>
          <button
            onClick={handleSignOut}
            className="w-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black py-2 px-4 rounded-lg transition-colors font-medium"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
} 