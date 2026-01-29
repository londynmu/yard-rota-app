import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import PropTypes from 'prop-types';
import { getSecureAuthErrorMessage } from '../../utils/authErrorMessages';

export default function LoginForm({ onRegister, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const { signIn } = useAuth();
  
  // HTTPS enforcement check for production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 
        window.location.protocol !== 'https:') {
      console.error('SECURITY WARNING: Login page is not using HTTPS in production!');
      setError('Warning: This connection is not secure. Please use HTTPS');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    // Check if locked due to too many attempts
    if (lockedUntil && Date.now() < lockedUntil) {
      const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please wait ${secondsLeft} seconds`);
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const { error } = await signIn(email, password);
      
      if (error) throw error;
      
      // Reset attempt count on success
      setAttemptCount(0);
      setLockedUntil(null);
      
    } catch (error) {
      // Use secure error message
      setError(getSecureAuthErrorMessage(error));
      
      // Increment attempt counter
      const newCount = attemptCount + 1;
      setAttemptCount(newCount);
      
      // Lock for 30 seconds after 5 failed attempts
      if (newCount >= 5) {
        const lockTime = Date.now() + 30000;
        setLockedUntil(lockTime);
        setError('Too many failed attempts. Please wait 30 seconds before trying again');
        
        // Reset after 30 seconds
        setTimeout(() => {
          setLockedUntil(null);
          setAttemptCount(0);
        }, 30000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-charcoal">Sign In</h2>
        <p className="text-sm text-gray-600 mt-1">Sign in to continue to Yard Rota</p>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 border border-red-200">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} autoComplete="on">
        <div className="mb-4">
          <label htmlFor="email" className="block text-charcoal text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-2 focus:ring-black/20 text-charcoal"
            placeholder="your@email.com"
            required
            autoComplete="username email"
          />
        </div>
        
        <div className="mb-2">
          <label htmlFor="password" className="block text-charcoal text-sm font-medium mb-2">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 pr-10 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-2 focus:ring-black/20 text-charcoal"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-gray-600 hover:text-black transition-colors focus:outline-none"
          >
            Forgot password?
          </button>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black hover:bg-gray-800 text-white py-2 px-4 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        
        <div className="text-center mt-6 border-t border-gray-200 pt-4">
          <p className="text-gray-600 text-sm">
            Don&apos;t have an account?
          </p>
          <button
            type="button"
            onClick={onRegister}
            className="mt-2 w-full py-2 px-4 bg-transparent hover:bg-gray-100 text-charcoal rounded-lg border-2 border-black transition-colors focus:outline-none"
          >
            Create Account
          </button>
        </div>
      </form>
    </div>
  );
}

LoginForm.propTypes = {
  onRegister: PropTypes.func.isRequired,
  onForgotPassword: PropTypes.func.isRequired
}; 