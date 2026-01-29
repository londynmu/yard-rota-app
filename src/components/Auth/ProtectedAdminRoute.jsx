import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * Protected Route Component for Admin-only pages
 * Verifies user authentication and admin role from database
 */
export default function ProtectedAdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        
        setIsAdmin(data?.role === 'admin');
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  // Show loading spinner while checking authentication and admin status
  if (authLoading || checking) {
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
