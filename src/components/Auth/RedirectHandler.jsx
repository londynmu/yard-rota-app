import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

export default function RedirectHandler() {
  const [message, setMessage] = useState('Checking authentication status...');
  const [errorDetails, setErrorDetails] = useState(null);
  const [debugInfo, setDebugInfo] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    // Get URL parameters for debugging
    const hash = window.location.hash;
    const search = window.location.search;
    const pathname = window.location.pathname;
    const fullUrl = window.location.href;
    
    // Log all information for debugging
    console.log('RedirectHandler Debug Info:');
    console.log('- URL:', fullUrl);
    console.log('- Pathname:', pathname);
    console.log('- Hash:', hash);
    console.log('- Search:', search);
    
    setDebugInfo({ hash, search, pathname, fullUrl });

    // Check for specific errors in the URL
    const isExpiredLink = 
      hash.includes('error=access_denied') || 
      hash.includes('error_code=otp_expired') || 
      hash.includes('link+is+invalid+or+has+expired') ||
      search.includes('error=access_denied') || 
      search.includes('error_code=otp_expired') || 
      search.includes('link+is+invalid+or+has+expired');

    if (isExpiredLink) {
      console.log('Expired or invalid password reset link detected');
      setMessage('Password reset link has expired or is invalid');
      setErrorDetails('Please request a new password reset link from the login page.');
      return;
    }

    // This handles the auth callback from Supabase
    const handleAuthCallback = async () => {
      // Check if this is a callback URL
      const hasAccessToken = hash.includes('access_token');
      const hasErrorParam = hash.includes('error');
      
      // Various ways to detect a password reset
      const isPasswordReset = 
        hash.includes('type=recovery') || 
        search.includes('type=recovery') ||
        pathname.includes('reset-password') || 
        fullUrl.includes('reset-password') || 
        hash.includes('recovery');
      
      console.log('Is password reset?', isPasswordReset);
      
      if (hasAccessToken || hasErrorParam) {
        setMessage('Processing authentication...');
        
        // Let Supabase handle the auth callback
        const { data, error } = await supabase.auth.getSession();
        console.log('Session data:', data);
        
        if (error) {
          console.error('Auth callback error:', error);
          setMessage('Authentication error');
          setErrorDetails('There was a problem processing your request. Please try again.');
          return;
        }
        
        // Check if this is a password reset link
        if (isPasswordReset) {
          setMessage('Authentication successful. Redirecting to password reset...');
          // Redirect to the password reset page
          setTimeout(() => {
            navigate('/reset-password', { replace: true });
          }, 2000);
          return;
        }
        
        // Successfully authenticated for normal login
        setMessage('Authentication successful. Redirecting...');
        
        // Redirect to the main app after a short delay
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 2000);
      } else if (isPasswordReset) {
        // Handle the case where isPasswordReset is true but there's no access token
        // (some password reset flows might work this way)
        setMessage('Password reset link detected. Redirecting to password reset...');
        setTimeout(() => {
          navigate('/reset-password', { replace: true });
        }, 2000);
      }
    };

    handleAuthCallback();
  }, [navigate]);

  const handleGoToLogin = () => {
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-gray-900">
      <div className="max-w-md w-full p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-center">
        {errorDetails ? (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-charcoal dark:text-white mb-2">{message}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{errorDetails}</p>
              
              <button
                onClick={handleGoToLogin}
                className="mt-4 inline-block bg-black dark:bg-white text-white dark:text-black py-2 px-4 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 font-medium transition-colors"
              >
                Go to Login
              </button>
            </div>
            
            {/* Debug information */}
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-750 rounded-lg text-left text-xs text-charcoal dark:text-gray-300 font-mono overflow-auto max-h-40">
              <div className="font-bold mb-1">Debug Info:</div>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <div className="animate-spin w-12 h-12 border-t-2 border-b-2 border-blue-500 rounded-full mx-auto"></div>
            </div>
            <h2 className="text-xl font-medium text-charcoal dark:text-white mb-2">{message}</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">You will be redirected automatically.</p>
            
            {/* Debug information */}
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-750 rounded-lg text-left text-xs text-charcoal dark:text-gray-300 font-mono overflow-auto max-h-40">
              <div className="font-bold mb-1">Debug Info:</div>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
            
            <div className="mt-4">
              <button
                onClick={handleGoToLogin}
                className="inline-block bg-black dark:bg-white text-white dark:text-black py-2 px-4 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 font-medium transition-colors"
              >
                Go to Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 