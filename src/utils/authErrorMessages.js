/**
 * Security-focused error message handler for authentication
 * Returns generic error messages to prevent account enumeration attacks
 */

export const getSecureAuthErrorMessage = (error) => {
  if (!error || !error.message) {
    return 'An error occurred. Please try again';
  }

  const errorMsg = error.message.toLowerCase();

  // Login errors - use generic message
  if (errorMsg.includes('invalid login') || 
      errorMsg.includes('invalid credentials') ||
      errorMsg.includes('email not found') ||
      errorMsg.includes('password')) {
    return 'Invalid email or password';
  }

  // Email not confirmed - can reveal this (user needs to know)
  if (errorMsg.includes('email not confirmed') || 
      errorMsg.includes('not verified')) {
    return 'Please verify your email address before signing in';
  }

  // Rate limiting
  if (errorMsg.includes('rate limit') || 
      errorMsg.includes('too many requests')) {
    return 'Too many attempts. Please try again later';
  }

  // Network errors
  if (errorMsg.includes('network') || 
      errorMsg.includes('fetch') ||
      errorMsg.includes('connection')) {
    return 'Connection error. Please check your internet and try again';
  }

  // Weak password (for registration)
  if (errorMsg.includes('weak password')) {
    return 'Password is too weak. Please use a stronger password';
  }

  // Email already exists (registration)
  if (errorMsg.includes('already registered') || 
      errorMsg.includes('already exists')) {
    return 'This email is already registered. Please sign in instead';
  }

  // Session/token expired
  if (errorMsg.includes('expired') || 
      errorMsg.includes('invalid token') ||
      errorMsg.includes('no session')) {
    return 'Your session has expired. Please try again';
  }

  // Generic fallback - don't expose internal errors
  return 'An error occurred. Please try again';
};

export const getSecureResetPasswordErrorMessage = (error) => {
  if (!error || !error.message) {
    return 'Failed to send reset instructions. Please try again';
  }

  const errorMsg = error.message.toLowerCase();

  // Rate limiting
  if (errorMsg.includes('rate limit') || 
      errorMsg.includes('too many')) {
    return 'Too many reset requests. Please try again in a few minutes';
  }

  // Don't reveal if email exists or not - always show success-like message
  return 'If an account exists with this email, you will receive reset instructions';
};
