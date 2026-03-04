import React from 'react';
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../lib/AuthContext';
import { useNotifications } from '../../lib/NotificationContext';

/**
 * Protected Route for Transport Manager dashboard.
 * Allows access for users with 'transport_manager' role or admin.
 */
export default function ProtectedTransportManagerRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isTransportManager, loading: notificationLoading } = useNotifications();

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

  if (!isAdmin && !isTransportManager) {
    return <Navigate to="/calendar" replace />;
  }

  return children;
}

ProtectedTransportManagerRoute.propTypes = {
  children: PropTypes.node.isRequired
};
