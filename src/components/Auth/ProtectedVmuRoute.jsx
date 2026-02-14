import React from 'react';
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../lib/AuthContext';
import { useNotifications } from '../../lib/NotificationContext';

/**
 * Protected Route Component for VMU pages
 * Allows access for users with 'vmu' role or admin
 */
export default function ProtectedVmuRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isVmu, loading: notificationLoading } = useNotifications();

  if (authLoading || notificationLoading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-offwhite">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin && !isVmu) {
    return <Navigate to="/calendar" replace />;
  }

  return children;
}

ProtectedVmuRoute.propTypes = {
  children: PropTypes.node.isRequired
};
