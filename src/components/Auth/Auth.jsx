import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ConfirmationMessage from './ConfirmationMessage';
import { useAuth } from '../../lib/AuthContext';
import ForgotPasswordForm from './ForgotPasswordForm';

export default function Auth() {
  const [authMode, setAuthMode] = useState('login');
  const [registrationSuccessful, setRegistrationSuccessful] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const { user, loading: authLoading } = useAuth();

  const handleRegistrationSuccess = (email) => {
    setRegisteredEmail(email);
    setRegistrationSuccessful(true);
    setAuthMode('login');
  };

  const handleSwitchMode = (mode) => {
    setAuthMode(mode);
    setRegistrationSuccessful(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-black via-blue-900 to-green-500">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-blue-900 to-green-500 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-black/60 backdrop-blur-xl rounded-xl shadow-xl overflow-hidden border border-white/30">
        <div className="p-6">
          {registrationSuccessful ? (
            <ConfirmationMessage 
              email={registeredEmail} 
              onContinue={() => handleSwitchMode('login')}
            />
          ) : authMode === 'login' ? (
            <LoginForm 
              onRegister={() => handleSwitchMode('register')} 
              onForgotPassword={() => handleSwitchMode('forgotPassword')}
            />
          ) : authMode === 'register' ? (
            <RegisterForm 
              onLogin={() => handleSwitchMode('login')} 
              onRegistrationSuccess={handleRegistrationSuccess} 
            />
          ) : authMode === 'forgotPassword' ? (
            <>
              <button 
                onClick={() => handleSwitchMode('login')}
                className="inline-flex items-center text-white/80 hover:text-white mb-4 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to login
              </button>
              <ForgotPasswordForm 
                onLogin={() => handleSwitchMode('login')} 
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
} 