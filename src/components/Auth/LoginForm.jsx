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
        <h2 className="text-xl font-semibold text-white">Sign In</h2>
        <p className="text-sm text-white/80 mt-1">Sign in to continue to Yard Rota</p>
      </div>
      
      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm text-red-100 p-3 rounded-md mb-4 border border-red-400/30">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} autoComplete="on">
        <div className="mb-4">
          <label htmlFor="email" className="block text-white text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-md focus:outline-none focus:border-white/50 text-white"
            placeholder="your@email.com"
            required
            autoComplete="username email"
          />
        </div>
        
        <div className="mb-2">
          <label htmlFor="password" className="block text-white text-sm font-medium mb-2">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-md focus:outline-none focus:border-white/50 text-white"
            required
            autoComplete="current-password"
          />
        </div>
        
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm text-white/70 hover:text-white transition-colors focus:outline-none"
          >
            Forgot password?
          </button>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur-xl text-white py-2 px-4 rounded-md border border-white/30 hover:bg-white/20 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4 shadow-md"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        
        <div className="text-center mt-6 border-t border-white/10 pt-4">
          <p className="text-white/70 text-sm">
            Don&apos;t have an account?
          </p>
          <button
            type="button"
            onClick={onRegister}
            className="mt-2 w-full py-2 px-4 bg-white/10 hover:bg-white/20 text-white/90 hover:text-white rounded-md border border-white/20 transition-colors focus:outline-none"
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