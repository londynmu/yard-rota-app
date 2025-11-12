import { useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import PropTypes from 'prop-types';

export default function ForgotPasswordForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      
      const { error } = await resetPassword(email);
      
      if (error) throw error;
      
      setSuccess('Password reset instructions sent to your email.');
    } catch (error) {
      setError(error.message || 'Failed to send reset instructions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-charcoal dark:text-white">Reset Password</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">We'll send you instructions to reset your password</p>
      </div>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 p-3 rounded-lg mb-4 border border-green-200 dark:border-green-800">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="email" className="block text-charcoal dark:text-white text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20 text-charcoal dark:text-white"
            placeholder="your@email.com"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black py-2 px-4 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Sending...' : 'Send Reset Instructions'}
        </button>
        
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Remember your password?{' '}
            <button
              type="button"
              onClick={onLogin}
              className="text-charcoal dark:text-white hover:underline focus:outline-none transition-colors"
            >
              Back to login
            </button>
          </p>
        </div>
      </form>
    </div>
  );
}

ForgotPasswordForm.propTypes = {
  onLogin: PropTypes.func.isRequired
}; 