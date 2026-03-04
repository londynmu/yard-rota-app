import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
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
  const [isVmu, setIsVmu] = useState(false);
  const [isTransportManager, setIsTransportManager] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add a new notification - memoized to prevent re-creation
  const addNotification = useCallback((message, type = 'info') => {
    const newNotification = {
      id: Date.now(),
      message,
      type,
      isRead: false,
      createdAt: new Date()
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);

  // Check if user is admin - depend on user ID only to prevent re-check on token refresh
  const userId = user?.id;
  useEffect(() => {
    async function checkIfAdmin() {
      if (!userId) {
        setIsAdmin(false);
        setIsVmu(false);
        setIsTransportManager(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        if (error) throw error;
        setIsAdmin(data?.role === 'admin');
        setIsVmu(data?.role === 'vmu');
        setIsTransportManager(data?.role === 'transport_manager');
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
        setIsVmu(false);
        setIsTransportManager(false);
      } finally {
        setLoading(false);
      }
    }

    checkIfAdmin();
  }, [userId]);

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

  // Mark notifications as read - memoized to prevent re-creation
  const markAllAsRead = useCallback(async () => {
    try {
      // Update notifications to mark them as read
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, isRead: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }, []);

  // No real-time subscriptions since this version of Supabase doesn't support it

  // Memoize value object to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    notifications,
    unreadCount,
    pendingApprovals,
    isAdmin,
    isVmu,
    isTransportManager,
    addNotification,
    markAllAsRead,
    loading
  }), [notifications, unreadCount, pendingApprovals, isAdmin, isVmu, isTransportManager, addNotification, markAllAsRead, loading]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired
}; 