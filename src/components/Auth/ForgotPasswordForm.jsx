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
        <h2 className="text-xl font-semibold text-white">Reset Password</h2>
        <p className="text-sm text-white/80 mt-1">We'll send you instructions to reset your password</p>
      </div>
      
      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm text-red-100 p-3 rounded-md mb-4 border border-red-400/30">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/20 backdrop-blur-sm text-green-100 p-3 rounded-md mb-4 border border-green-400/30">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="email" className="block text-white text-sm font-medium mb-2">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-md focus:outline-none focus:border-white/50 text-white"
            placeholder="your@email.com"
            required
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white/20 backdrop-blur-sm text-white py-2 px-4 rounded-md border border-white/30 hover:bg-white/30 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Sending...' : 'Send Reset Instructions'}
        </button>
        
        <div className="text-center">
          <p className="text-white/70 text-sm">
            Remember your password?{' '}
            <button
              type="button"
              onClick={onLogin}
              className="text-white/90 hover:text-white focus:outline-none transition-colors"
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