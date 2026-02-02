import React from 'react';
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../lib/AuthContext';
import { useNotifications } from '../../lib/NotificationContext';

/**
 * Protected Route Component for Admin-only pages
 * Uses NotificationContext for admin status to avoid redundant checks
 */
export default function ProtectedAdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: notificationLoading } = useNotifications();

  // Show loading spinner while checking authentication and admin status
  if (authLoading || notificationLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to main page if not admin
  if (!isAdmin) {
    return <Navigate to="/calendar" replace />;
  }

  // Render protected content for admin users
  return children;
}

ProtectedAdminRoute.propTypes = {
  children: PropTypes.node.isRequired
};
