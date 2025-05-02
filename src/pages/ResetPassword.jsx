import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UpdatePasswordForm from '../components/Auth/UpdatePasswordForm';
import { supabase } from '../lib/supabaseClient';

export default function ResetPassword() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    // Collect debug information
    const hash = window.location.hash;
    const search = window.location.search;
    const path = window.location.pathname;
    const url = window.location.href;
    
    // Store the debug information
    setDebugInfo({
      hash,
      search,
      path,
      url,
      timestamp: new Date().toISOString()
    });
    
    // Attempt to capture and process token
    const processRecoveryToken = async () => {
      try {
        setLoading(true);
        console.log('ResetPassword: Checking for auth recovery token...');
        
        // Check if token is in URL hash
        if (hash && hash.includes('access_token') && hash.includes('type=recovery')) {
          console.log('ResetPassword: Found recovery token in URL hash');
          
          // Store recovery hash in localStorage before any potential redirects
          localStorage.setItem('recoveryHash', hash);
          
          // Directly process the token that's already in the URL
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Session error:', error);
            setErrorMessage(`Authentication error: ${error.message}`);
            setLoading(false);
            return;
          }
          
          console.log('Session established with token in URL:', !!data.session);
          setLoading(false);
          return;
        }
        
        // If no token in URL, check localStorage as fallback
        const storedHash = localStorage.getItem('recoveryHash');
        if (storedHash) {
          console.log('ResetPassword: Using stored recovery hash');
          
          // Apply the hash to the URL without navigating
          window.location.hash = storedHash;
          
          // Process the hash
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Session error with stored hash:', error);
            setErrorMessage(`Authentication error: ${error.message}`);
          } else {
            console.log('Session established with stored hash:', !!data.session);
          }
          
          // Clear it after using
          localStorage.removeItem('recoveryHash');
        } else {
          // No token found anywhere
          console.log('ResetPassword: No recovery token found');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in ResetPassword:', error);
        setErrorMessage('An unexpected error occurred. Please try again.');
        setLoading(false);
      }
    };

    processRecoveryToken();
  }, []);

  const handlePasswordUpdateComplete = () => {
    // On successful password update, navigate to login
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-blue-900 to-green-500 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md bg-black/60 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden border border-white/30 p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-4">Preparing password reset...</h2>
            <div className="animate-pulse flex justify-center">
              <div className="h-6 w-6 bg-white/30 rounded-full"></div>
            </div>
            <p className="text-sm text-white/70 mt-3">Validating your reset token</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-blue-900 to-green-500 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-black/60 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden border border-white/30 p-6">
        {errorMessage ? (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white">Password Reset Error</h2>
            </div>
            
            <div className="bg-red-500/20 backdrop-blur-sm text-red-100 p-3 rounded-md mb-4 border border-red-400/30 flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{errorMessage}</span>
            </div>
            
            <div className="bg-gray-800/50 backdrop-blur-sm p-3 rounded-md mb-4 text-xs font-mono text-white/80 overflow-auto max-h-40">
              <h3 className="font-bold mb-1">Debug Information:</h3>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
            
            <div className="text-center mt-4">
              <button
                onClick={() => navigate('/login')}
                className="bg-white/20 backdrop-blur-sm text-white py-2 px-4 rounded-md border border-white/30 hover:bg-white/30 focus:outline-none transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        ) : (
          <UpdatePasswordForm onComplete={handlePasswordUpdateComplete} recoveryHash={localStorage.getItem('recoveryHash')} />
        )}
      </div>
    </div>
  );
} 