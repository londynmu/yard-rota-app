import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Auth from './components/Auth/Auth';
import HomePage from './components/HomePage';
import ProfileRequiredCheck from './components/Auth/ProfileRequiredCheck';
import ProfilePage from './pages/ProfilePage';
import { supabase } from './lib/supabaseClient';
import ResetPassword from './pages/ResetPassword';
import WaitingForApprovalPage from './pages/WaitingForApprovalPage';
import { NotificationProvider } from './lib/NotificationContext';

// Recovery detection function - simpler and more focused
const isRecoveryLink = () => {
  const hash = window.location.hash;
  const search = window.location.search;
  return (hash && hash.includes('type=recovery')) || (search && search.includes('type=recovery'));
};

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [accountStatus, setAccountStatus] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const hasAuthHash = window.location.hash.includes('access_token'); // Check for auth hash
  const profileCheckRef = useRef(false); // Ref to prevent multiple profile checks
  
  // Dodajemy hook dla opóźnionego loadera
  const [showLoader, setShowLoader] = useState(false);
  const isLoading = authLoading || (hasAuthHash && !user);

  // Log state on every render
  console.log('[AppContent Render] State:', {
    authLoading,
    user: !!user,
    isCheckingProfile,
    isProfileComplete,
    accountStatus,
    pathname: location.pathname,
    hasAuthHash // Log the hash check
  });

  // Hook na najwyższym poziomie komponentu
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowLoader(true);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setShowLoader(false);
    }
  }, [isLoading]);

  // Handle URL detection on mount and URL changes
  useEffect(() => {
    const checkUrlAndRedirect = async () => {
      // Log all URL information for debugging
      console.log('URL CHECK:');
      console.log('- Path:', location.pathname);
      console.log('- Hash:', window.location.hash);
      console.log('- Search:', window.location.search);
      console.log('- Full URL:', window.location.href);

      // If recovery link is detected, redirect to reset-password
      if (isRecoveryLink() && location.pathname !== '/reset-password') {
        console.log('RECOVERY LINK DETECTED - redirecting to reset-password');
        
        // Save the hash to localStorage before navigating
        if (window.location.hash && window.location.hash.includes('access_token')) {
          console.log('Saving recovery hash to localStorage');
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
      
      // Specjalny przypadek dla administratora - omijamy sprawdzanie profilu
      if (user.email === 'tideend@gmail.com' || user.role === 'service_role') {
        setIsProfileComplete(true);
        setAccountStatus('approved'); // Admins are always approved
        setIsCheckingProfile(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('profile_completed, account_status')
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
          const complete = !!data?.profile_completed;
          setIsProfileComplete(complete);
          setAccountStatus(data?.account_status || 'approved'); // Default to approved for existing users
        }
      } catch (error) {
        console.error('Error in profile check:', error);
        setError(error.message);
      } finally {
        setIsCheckingProfile(false);
        // Reset the ref reliably in the finally block
        profileCheckRef.current = false;
      }
    };

    if (user && !profileCheckRef.current) {
      checkProfileCompletion();
    } else {
      setIsCheckingProfile(false);
    }
  }, [user]);

  // --- NEW LOADING LOGIC ---
  // Show loader if:
  // 1. AuthProvider is still loading (initial getSession)
  // OR 2. There's an auth hash in the URL, BUT we don't have a user yet (waiting for onAuthStateChange)
  if (isLoading) {
    console.log('[AppContent Decision] Rendering Combined Loading (Auth or Hash Wait)...');
    
    // Nie pokazuj nic przez pierwsze 500ms
    if (!showLoader) {
      return null;
    }
    
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black dark:border-white"></div>
      </div>
    );
  }
  // --- END NEW LOADING LOGIC ---

  // Error state
  if (error) {
    console.log('[AppContent Decision] Rendering Error State...');
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite dark:bg-gray-900">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg max-w-md border border-red-200 dark:border-red-800">
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

  // If user exists, but we are still checking profile OR we know profile is not complete
  if (user && (isCheckingProfile || !isProfileComplete)) {
    // Specjalny przypadek dla administratora próbującego wejść na stronę /admin lub /rota-planner
    if ((user.email === 'tideend@gmail.com' || user.role === 'service_role') && 
        (location.pathname === '/admin' || location.pathname === '/rota-planner')) {
      console.log('[AppContent Decision] Admin user accessing protected route - skipping profile check');
      return <HomePage />;
    }
    
    // If still checking profile
    if (isCheckingProfile) {
      console.log('[AppContent Decision] Rendering Profile Checking Loader...');
      return (
        <div className="min-h-screen flex justify-center items-center bg-offwhite dark:bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black dark:border-white"></div>
        </div>
      );
    } else {
      console.log('[AppContent Decision] Rendering Full Profile Form...');
      return (
        <ProfilePage isRequired={true} supabaseClient={supabase} simplifiedView={true} />
      );
    }
  }

  // If user has a complete profile but is pending approval or rejected
  if (user && isProfileComplete && accountStatus && accountStatus !== 'approved') {
    // Special case for admin paths - always allow access for admins
    if ((user.email === 'tideend@gmail.com' || user.role === 'service_role') && 
        (location.pathname === '/admin' || location.pathname === '/rota-planner')) {
      return <HomePage />;
    }
  
    // Redirect to waiting for approval page if user is pending approval or rejected
    // but trying to access a different page
    if (location.pathname !== '/waiting-for-approval') {
      return <Navigate to="/waiting-for-approval" replace />;
    }
  }

  // Main routing
  console.log('[AppContent Decision] Evaluating Main Routing...');
  return (
    <Routes>
      <Route path="/login" element={!user ? <Auth /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/waiting-for-approval" element={<WaitingForApprovalPage />} />
      {/* Show HomePage only if user exists, profile check finished, profile is complete, and account is approved */}
      <Route path="/*" element={
        (user && !isCheckingProfile && isProfileComplete && (!accountStatus || accountStatus === 'approved')) ? (
          <ProfileRequiredCheck>
            <HomePage />
          </ProfileRequiredCheck>
        ) : (
          <Navigate to={user && isProfileComplete ? "/waiting-for-approval" : "/login"} replace />
        )
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
