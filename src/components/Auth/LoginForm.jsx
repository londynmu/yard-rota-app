import React, { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import PropTypes from 'prop-types';

export default function LoginForm({ onRegister, onForgotPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const { error } = await signIn(email, password);
      
      if (error) throw error;
      
    } catch (error) {
      setError(error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-charcoal dark:text-white">Sign In</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Sign in to continue to Yard Rota</p>
      </div>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} autoComplete="on">
        <div className="mb-4">
          <label htmlFor="email" className="block text-charcoal dark:text-white text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-charcoal dark:text-white"
            placeholder="your@email.com"
            required
            autoComplete="username email"
          />
        </div>
        
        <div className="mb-2">
          <label htmlFor="password" className="block text-charcoal dark:text-white text-sm font-medium mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-charcoal dark:text-white"
            required
            autoComplete="current-password"
          />
        </div>
        
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors focus:outline-none"
          >
            Forgot password?
          </button>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black py-2 px-4 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        
        <div className="text-center mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Don&apos;t have an account?
          </p>
          <button
            type="button"
            onClick={onRegister}
            className="mt-2 w-full py-2 px-4 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-charcoal dark:text-white rounded-lg border-2 border-black dark:border-white transition-colors focus:outline-none"
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