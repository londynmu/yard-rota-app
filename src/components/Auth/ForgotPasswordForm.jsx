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
        <h2 className="text-xl font-semibold text-charcoal">Reset Password</h2>
        <p className="text-sm text-gray-600 mt-1">We'll send you instructions to reset your password</p>
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 border border-red-200">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 border border-green-200">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="email" className="block text-charcoal text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-2 focus:ring-black/20 text-charcoal"
            placeholder="your@email.com"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black hover:bg-gray-800 text-white py-2 px-4 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Sending...' : 'Send Reset Instructions'}
        </button>
        
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Remember your password?{' '}
            <button
              type="button"
              onClick={onLogin}
              className="text-charcoal hover:underline focus:outline-none transition-colors"
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