import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Auth from './components/Auth/Auth';
import HomePage from './components/HomePage';
import ProfilePage from './pages/ProfilePage';
import { supabase } from './lib/supabaseClient';
import ResetPassword from './pages/ResetPassword';
import WaitingForApprovalPage from './pages/WaitingForApprovalPage';
import { NotificationProvider } from './lib/NotificationContext';
import { usePageTracking } from './hooks/usePageTracking';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import ErrorBoundary from './components/ErrorBoundary';

// Recovery detection function - simpler and more focused
const isRecoveryLink = () => {
  const hash = window.location.hash;
  const search = window.location.search;
  return (hash && hash.includes('type=recovery')) || (search && search.includes('type=recovery'));
};

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  
  // Track page visits for analytics
  usePageTracking();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [accountStatus, setAccountStatus] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Memoize auth hash check - only calculate once on mount
  const hasAuthHash = useMemo(() => 
    window.location.hash.includes('access_token'), 
    [] // Empty deps = calculate only once
  );
  
  const profileCheckRef = useRef(false); // Ref to prevent multiple profile checks
  
  // Combined loading state: auth loading OR profile checking
  const isLoading = authLoading || (hasAuthHash && !user) || (user && isCheckingProfile);

  // Handle URL detection on mount and URL changes
  useEffect(() => {
    const checkUrlAndRedirect = async () => {
      // If recovery link is detected, redirect to reset-password
      if (isRecoveryLink() && location.pathname !== '/reset-password') {
        // Save the hash to localStorage before navigating
        if (window.location.hash && window.location.hash.includes('access_token')) {
          localStorage.setItem('recoveryHash', window.location.hash);
        }
        
        // Use replace to avoid creating history entries
        navigate('/reset-password', { replace: true });
        return;
      }
    };

    checkUrlAndRedirect();
  }, [location, navigate]);

  // Check if user's profile is complete and account status
  useEffect(() => {
    // Prevent multiple profile checks in the same render cycle
    if (!user || profileCheckRef.current) {
      if (!user) {
        setIsCheckingProfile(false);
      }
      return;
    }

    const checkProfileCompletion = async () => {
      profileCheckRef.current = true; // Mark that we're checking
      setIsCheckingProfile(true); // Start checking - this will trigger loading screen

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('profile_completed, account_status, role')
          .eq('id', user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            setIsProfileComplete(false);
            setAccountStatus(null);
          } else {
            console.error('Error checking profile completion:', error);
            setError(error.message);
          }
        } else {
          // Admin users bypass profile completion and approval checks
          if (data?.role === 'admin') {
            setIsProfileComplete(true);
            setAccountStatus('approved');
          } else {
            const complete = !!data?.profile_completed;
            setIsProfileComplete(complete);
            setAccountStatus(data?.account_status || 'approved');
          }
        }
      } catch (error) {
        console.error('Error in profile check:', error);
        setError(error.message);
      } finally {
        setIsCheckingProfile(false);
        profileCheckRef.current = false;
      }
    };

    if (user && !profileCheckRef.current) {
      checkProfileCompletion();
    } else {
      setIsCheckingProfile(false);
    }
  }, [user]);

  // --- UNIFIED LOADING LOGIC ---
  // Show empty screen during:
  // 1. AuthProvider loading (initial getSession)
  // 2. Auth hash processing (waiting for onAuthStateChange)
  // 3. Profile checking (verifying profile completion and status)
  // This prevents any UI flashing during authentication and profile verification
  if (isLoading) {
    return <div className="min-h-screen bg-offwhite"></div>;
  }
  // --- END UNIFIED LOADING LOGIC ---

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg max-w-md border border-red-200">
          <h3 className="font-bold mb-2">Error checking your profile</h3>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // If user exists but profile is not complete, show profile completion page
  if (user && !isProfileComplete) {
    return (
      <ProfilePage isRequired={true} supabaseClient={supabase} simplifiedView={true} />
    );
  }

  // If user has a complete profile but is pending approval or rejected
  if (user && isProfileComplete && accountStatus && accountStatus !== 'approved') {
    // Redirect to waiting for approval page if user is pending approval or rejected
    // but trying to access a different page
    if (location.pathname !== '/waiting-for-approval') {
      return <Navigate to="/waiting-for-approval" replace />;
    }
  }

  // Main routing
  return (
    <Routes>
      <Route path="/login" element={!user ? <Auth /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/waiting-for-approval" element={<WaitingForApprovalPage />} />
      {/* Show HomePage only if user exists, profile check finished, profile is complete, and account is approved */}
      <Route path="/*" element={
        (user && !isCheckingProfile && isProfileComplete && (!accountStatus || accountStatus === 'approved')) ? (
          <HomePage />
        ) : (
          <Navigate to={user && isProfileComplete ? "/waiting-for-approval" : "/login"} replace />
        )
      } />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <PWAInstallPrompt />
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
