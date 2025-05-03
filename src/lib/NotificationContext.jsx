import React, { createContext, useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

const NotificationContext = createContext();

export function useNotifications() {
  return useContext(NotificationContext);
}

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add a new notification
  const addNotification = (message, type = 'info') => {
    const newNotification = {
      id: Date.now(),
      message,
      type,
      isRead: false,
      createdAt: new Date()
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
  };

  // Check if user is admin
  useEffect(() => {
    async function checkIfAdmin() {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
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
        setLoading(false);
      }
    }

    checkIfAdmin();
  }, [user]);

  // Fetch pending approvals count
  useEffect(() => {
    if (!isAdmin) return;

    async function fetchPendingApprovals() {
      try {
        // Use account_status instead of approved column
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('account_status', 'pending_approval');

        if (error) throw error;
        setPendingApprovals(data?.length || 0);
      } catch (error) {
        console.error('Error fetching pending approvals:', error);
        // Set to 0 on error to avoid showing incorrect badge
        setPendingApprovals(0);
      }
    }

    fetchPendingApprovals();
    
    // Set up interval to periodically check for new pending approvals
    const interval = setInterval(fetchPendingApprovals, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Mark notifications as read
  const markAllAsRead = async () => {
    try {
      // Update notifications to mark them as read
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, isRead: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  // No real-time subscriptions since this version of Supabase doesn't support it

  const value = {
    notifications,
    unreadCount,
    pendingApprovals,
    isAdmin,
    addNotification,
    markAllAsRead,
    loading
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired
}; 