import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Auth from './components/Auth/Auth';
import HomePage from './components/HomePage';
import ProfilePage from './pages/ProfilePage';
import { supabase, supabaseMissingEnv } from './lib/supabaseClient';
import { PROFILE_SELECT_FIELDS } from './lib/AuthContext';
import { normalizeAvatarStorageUrl } from './utils/avatarUrl';
import ResetPassword from './pages/ResetPassword';
import WaitingForApprovalPage from './pages/WaitingForApprovalPage';
import { NotificationProvider } from './lib/NotificationContext';
import { usePageTracking } from './hooks/usePageTracking';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PreferredStartTimePrompt from './components/User/PreferredStartTimePrompt';
import PhoneRequiredPrompt from './components/User/PhoneRequiredPrompt';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateBanner from './components/UpdateBanner';
import { setMonitoringUser } from './lib/monitoring';
import { safeLocalStorage } from './utils/safeStorage';

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

  useEffect(() => {
    setMonitoringUser(user?.id ?? null);
  }, [user?.id]);

  const [isCheckingProfile, setIsCheckingProfile] = useState(false);
  const [profileCheckCompleted, setProfileCheckCompleted] = useState(false); // true only after first check has run (prevents profile page flash)
  // null = not checked yet / N/A; true = has phone_e164 via RPC; false = missing (gate applies)
  const [hasOwnPhone, setHasOwnPhone] = useState(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
  // Non-destructive: RPC failure must not open the phone gate as "no phone"
  const [phoneCheckError, setPhoneCheckError] = useState(false);
  const [phoneCheckRetryKey, setPhoneCheckRetryKey] = useState(0);
  const [error, setError] = useState(null);
  const [waitingForAuthHash, setWaitingForAuthHash] = useState(
    () => typeof window !== 'undefined' && window.location.hash.includes('access_token')
  );
  const location = useLocation();
  const navigate = useNavigate();
  const profileCheckRequestRef = useRef(0);
  const phoneCheckRequestRef = useRef(0);

  const { isProfileComplete, accountStatus } = deriveGateFromProfile(sessionProfile);
  const isApproved = accountStatus === 'approved';
  const isPrivilegedRole = Boolean(
    sessionProfile?.role && PRIVILEGED_ROLES.has(sessionProfile.role),
  );
  // Phone onboarding only for approved shunters (role=user), not admin/TM/VMU
  const phoneGateApplies =
    Boolean(user) &&
    profileCheckCompleted &&
    isApproved &&
    Boolean(sessionProfile) &&
    !isPrivilegedRole;
  const isResetPasswordRoute = location.pathname === '/reset-password';
  const isWaitingRoute = location.pathname === '/waiting-for-approval';
  
  // Combined loading state: auth loading OR profile checking OR profile check not yet run
  // Also wait for phone RPC when the phone gate applies (avoids home flash before prompt).
  // On RPC error we stop waiting (phoneCheckError) without treating the user as phone-less.
  const isLoading =
    authLoading ||
    (waitingForAuthHash && !user) ||
    (user && isCheckingProfile) ||
    (user && !profileCheckCompleted) ||
    (phoneGateApplies && isCheckingPhone) ||
    (phoneGateApplies && hasOwnPhone === null && !phoneCheckError);

  // Clear auth-hash wait when session attaches, or time out so we never blank forever
  useEffect(() => {
    if (!waitingForAuthHash) return undefined;

    if (user) {
      setWaitingForAuthHash(false);
      const hash = window.location.hash;
      // Keep recovery hash for ResetPassword; strip only non-recovery access tokens
      if (hash.includes('access_token') && !hash.includes('type=recovery')) {
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
          safeLocalStorage.setItem('recoveryHash', window.location.hash);
        }
        
        // Use replace to avoid creating history entries
        navigate('/reset-password', { replace: true });
        return;
      }
    };

    checkUrlAndRedirect();
  }, [location, navigate]);

  // Reset phone gate when session ends
  useEffect(() => {
    if (!user) {
      phoneCheckRequestRef.current += 1;
      setHasOwnPhone(null);
      setIsCheckingPhone(false);
      setPhoneCheckError(false);
      setPhoneCheckRetryKey(0);
    }
  }, [user]);

  // Check if user's profile is complete and account status — writes sessionProfile (gate source of truth)
  useEffect(() => {
    if (!user) {
      profileCheckRequestRef.current += 1;
      setIsCheckingProfile(false);
      setProfileCheckCompleted(false);
      setSessionProfile(null);
      return undefined;
    }

    const requestId = ++profileCheckRequestRef.current;
    let cancelled = false;

    const checkProfileCompletion = async () => {
      setIsCheckingProfile(true);

      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_FIELDS)
          .eq('id', user.id)
          .single();

        if (cancelled || requestId !== profileCheckRequestRef.current) return;

        if (fetchError) {
          setSessionProfile(null);
          if (fetchError.code === 'PGRST116') {
            // No profile row yet — gate will require profile completion
          } else {
            console.error('Error checking profile completion:', fetchError);
            setError(fetchError.message);
          }
        } else {
          setSessionProfile({
            ...data,
            avatar_url: normalizeAvatarStorageUrl(data.avatar_url) ?? data.avatar_url,
          });
        }
      } catch (err) {
        if (cancelled || requestId !== profileCheckRequestRef.current) return;
        console.error('Error in profile check:', err);
        setSessionProfile(null);
        setError(err.message);
      } finally {
        if (!cancelled && requestId === profileCheckRequestRef.current) {
          setIsCheckingProfile(false);
          setProfileCheckCompleted(true);
        }
      }
    };

    void checkProfileCompletion();

    return () => {
      cancelled = true;
    };
    // Only depend on user ID - prevents re-check on token refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, setSessionProfile]);

  // Phone presence for role=user — do NOT select phone_e164 from profiles (SELECT revoked);
  // use get_own_whatsapp_messaging() like ProfilePage.
  useEffect(() => {
    if (!phoneGateApplies) {
      phoneCheckRequestRef.current += 1;
      setIsCheckingPhone(false);
      setPhoneCheckError(false);
      // Privileged / not-yet-approved: gate does not apply
      if (!user?.id || isPrivilegedRole || !isApproved) {
        setHasOwnPhone(null);
      }
      return undefined;
    }

    const requestId = ++phoneCheckRequestRef.current;
    let cancelled = false;

    const checkOwnPhone = async () => {
      setIsCheckingPhone(true);
      setPhoneCheckError(false);
      try {
        const { data, error: rpcError } = await supabase.rpc('get_own_whatsapp_messaging');
        if (cancelled || requestId !== phoneCheckRequestRef.current) return;

        if (rpcError) {
          console.error('Error checking own WhatsApp messaging:', rpcError);
          // Never assume "no phone" on error — keep previous known state and leave gate closed
          setPhoneCheckError(true);
          return;
        }

        const messaging = Array.isArray(data) ? data[0] : data;
        const phone = typeof messaging?.phone_e164 === 'string' ? messaging.phone_e164.trim() : '';
        setHasOwnPhone(Boolean(phone));
        setPhoneCheckError(false);
      } catch (err) {
        if (cancelled || requestId !== phoneCheckRequestRef.current) return;
        console.error('Error in phone gate check:', err);
        // Keep previous hasOwnPhone; do not open PhoneRequiredPrompt
        setPhoneCheckError(true);
      } finally {
        if (!cancelled && requestId === phoneCheckRequestRef.current) {
          setIsCheckingPhone(false);
        }
      }
    };

    void checkOwnPhone();

    return () => {
      cancelled = true;
    };
  }, [phoneGateApplies, user?.id, isPrivilegedRole, isApproved, phoneCheckRetryKey]);

  // Save deep link URL for redirect after login (e.g. QR code scan)
  useEffect(() => {
    if (!user && location.pathname.startsWith('/precheck/tug/')) {
      safeLocalStorage.setItem('redirect_after_login', location.pathname);
    }
  }, [user, location.pathname]);

  // After login, check for saved redirect
  useEffect(() => {
    if (user && isProfileComplete && isApproved) {
      const redirectPath = safeLocalStorage.getItem('redirect_after_login');
      if (redirectPath) {
        safeLocalStorage.removeItem('redirect_after_login');
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

  // Allow password recovery regardless of profile/approval gate
  if (isResetPasswordRoute) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/reset-password" replace />} />
      </Routes>
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
    if (!isWaitingRoute) {
      return <Navigate to="/waiting-for-approval" replace />;
    }
  }

  // Only open gate after a successful RPC that confirmed phone is missing — never on RPC error
  const needsPhone =
    phoneGateApplies && hasOwnPhone === false && !phoneCheckError;

  // Preferred start only after phone is confirmed present (hasOwnPhone === true).
  // While phone is unknown (null / loading / RPC error), keep preferred-start closed
  // so it cannot cover the Retry banner or skip phone-then-start order.
  // Privileged roles never hit this (excluded below); they are phone-gate exempt.
  const needsPreferredStart =
    user &&
    profileCheckCompleted &&
    isApproved &&
    sessionProfile &&
    !isPrivilegedRole &&
    hasOwnPhone === true &&
    !sessionProfile.preferred_start_time;

  // Main routing
  return (
    <>
    {supabaseMissingEnv && (
      <div
        role="status"
        className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm text-center"
      >
        App configuration warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in this production build.
        Ask an administrator to set them on Netlify (Site environment variables) and redeploy.
      </div>
    )}
    {phoneGateApplies && phoneCheckError && !needsPhone && (
      <div
        role="status"
        className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-sm text-center flex flex-wrap items-center justify-center gap-2"
      >
        <span>Could not verify your phone number. You can continue and retry.</span>
        <button
          type="button"
          onClick={() => setPhoneCheckRetryKey((key) => key + 1)}
          disabled={isCheckingPhone}
          className="underline font-medium disabled:opacity-60"
        >
          {isCheckingPhone ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    )}
    {needsPhone && (
      <PhoneRequiredPrompt
        userId={user.id}
        onSaved={() => {
          setHasOwnPhone(true);
          setPhoneCheckError(false);
        }}
      />
    )}
    {needsPreferredStart && (
      <PreferredStartTimePrompt
        userId={user.id}
        shiftPreference={sessionProfile.shift_preference}
        onSaved={(time) => {
          setSessionProfile((prev) => (prev ? { ...prev, preferred_start_time: time } : prev));
        }}
      />
    )}
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
    </>
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
