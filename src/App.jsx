import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Auth from './components/Auth/Auth';
import HomePage from './components/HomePage';
import ProfilePage from './pages/ProfilePage';
import { supabase } from './lib/supabaseClient';
import { PROFILE_SELECT_FIELDS } from './lib/AuthContext';
import { normalizeAvatarStorageUrl } from './utils/avatarUrl';
import ResetPassword from './pages/ResetPassword';
import WaitingForApprovalPage from './pages/WaitingForApprovalPage';
import { NotificationProvider } from './lib/NotificationContext';
import { usePageTracking } from './hooks/usePageTracking';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateBanner from './components/UpdateBanner';

const AUTH_HASH_WAIT_MS = 10000;
const PRIVILEGED_ROLES = new Set(['admin', 'vmu', 'transport_manager']);

// Recovery detection function - simpler and more focused
const isRecoveryLink = () => {
  const hash = window.location.hash;
  const search = window.location.search;
  return (hash && hash.includes('type=recovery')) || (search && search.includes('type=recovery'));
};

function deriveGateFromProfile(sessionProfile) {
  if (!sessionProfile) {
    return { isProfileComplete: false, accountStatus: null };
  }

  if (PRIVILEGED_ROLES.has(sessionProfile.role)) {
    return { isProfileComplete: true, accountStatus: 'approved' };
  }

  return {
    isProfileComplete: !!sessionProfile.profile_completed,
    accountStatus: sessionProfile.account_status || 'pending_approval',
  };
}

function AppContent() {
  const { user, loading: authLoading, sessionProfile, setSessionProfile } = useAuth();
  
  // Track page visits for analytics
  usePageTracking();
  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [profileCheckCompleted, setProfileCheckCompleted] = useState(false); // true only after first check has run (prevents profile page flash)
  const [error, setError] = useState(null);
  const [waitingForAuthHash, setWaitingForAuthHash] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('access_token')
  );
  const location = useLocation();
  const navigate = useNavigate();
  
  const profileCheckRef = useRef(false); // Ref to prevent multiple profile checks

  const { isProfileComplete, accountStatus } = deriveGateFromProfile(sessionProfile);
  const isApproved = accountStatus === 'approved';
  
  // Combined loading state: auth loading OR profile checking OR profile check not yet run
  const isLoading = authLoading || (waitingForAuthHash && !user) || (user && isCheckingProfile) || (user && !profileCheckCompleted);

  // Clear auth-hash wait when session attaches, or time out so we never blank forever
  useEffect(() => {
    if (!waitingForAuthHash) return undefined;

    if (user) {
      setWaitingForAuthHash(false);
      if (window.location.hash.includes('access_token')) {
        const { pathname, search } = window.location;
        window.history.replaceState(null, '', `${pathname}${search}`);
      }
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setWaitingForAuthHash(false);
    }, AUTH_HASH_WAIT_MS);

    return () => clearTimeout(timeoutId);
  }, [waitingForAuthHash, user]);

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

  // Check if user's profile is complete and account status — writes sessionProfile (gate source of truth)
  useEffect(() => {
    // Prevent multiple profile checks in the same render cycle
    if (!user || profileCheckRef.current) {
      if (!user) {
        setIsCheckingProfile(false);
        setProfileCheckCompleted(false);
        setSessionProfile(null);
      }
      return;
    }

    const checkProfileCompletion = async () => {
      profileCheckRef.current = true; // Mark that we're checking
      setIsCheckingProfile(true); // Start checking - this will trigger loading screen

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_FIELDS)
          .eq('id', user.id)
          .single();

        if (error) {
          setSessionProfile(null);
          if (error.code === 'PGRST116') {
            // No profile row yet — gate will require profile completion
          } else {
            console.error('Error checking profile completion:', error);
            setError(error.message);
          }
        } else {
          setSessionProfile({
            ...data,
            avatar_url: normalizeAvatarStorageUrl(data.avatar_url) ?? data.avatar_url,
          });
        }
      } catch (error) {
        console.error('Error in profile check:', error);
        setSessionProfile(null);
        setError(error.message);
      } finally {
        setIsCheckingProfile(false);
        setProfileCheckCompleted(true); // Mark that we've run the check (prevents profile page flash before check)
        profileCheckRef.current = false;
      }
    };

    if (user && !profileCheckRef.current) {
      checkProfileCompletion();
    } else {
      setIsCheckingProfile(false);
    }
  }, [user?.id, setSessionProfile]); // Only depend on user ID - prevents re-check on token refresh

  // Save deep link URL for redirect after login (e.g. QR code scan)
  useEffect(() => {
    if (!user && location.pathname.startsWith('/precheck/tug/')) {
      localStorage.setItem('redirect_after_login', location.pathname);
    }
  }, [user, location.pathname]);

  // After login, check for saved redirect
  useEffect(() => {
    if (user && isProfileComplete && isApproved) {
      const redirectPath = localStorage.getItem('redirect_after_login');
      if (redirectPath) {
        localStorage.removeItem('redirect_after_login');
        navigate(redirectPath, { replace: true });
      }
    }
  }, [user, isProfileComplete, isApproved, navigate]);

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
  // Only after profile check has run (profileCheckCompleted) to avoid flashing profile on load
  if (user && profileCheckCompleted && !isProfileComplete) {
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
        (user && !isCheckingProfile && isProfileComplete && isApproved) ? (
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
      <UpdateBanner />
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
