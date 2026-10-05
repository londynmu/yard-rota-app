import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

const NotificationContext = createContext();

const PENDING_APPROVALS_POLL_MS = 30 * 1000;
const MISSING_PRECHECKS_POLL_MS = 60 * 1000;

export function useNotifications() {
  return useContext(NotificationContext);
}

export const NotificationProvider = ({ children }) => {
  const { user, sessionProfile } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVmu, setIsVmu] = useState(false);
  const [isTransportManager, setIsTransportManager] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [missingPrechecks, setMissingPrechecks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Roles come from sessionProfile (filled by App.jsx profile gate) — avoids duplicate profiles fetch
  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      setIsVmu(false);
      setIsTransportManager(false);
      setLoading(false);
      return;
    }
    if (!sessionProfile) {
      setIsAdmin(false);
      setIsVmu(false);
      setIsTransportManager(false);
      setLoading(false);
      return;
    }
    setIsAdmin(sessionProfile.role === 'admin');
    setIsVmu(sessionProfile.role === 'vmu');
    setIsTransportManager(sessionProfile.role === 'transport_manager');
    setLoading(false);
  }, [userId, sessionProfile]);

  const refreshPendingApprovals = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('account_status', 'pending_approval');

      if (error) throw error;
      setPendingApprovals(count || 0);
    } catch (error) {
      console.error('Error fetching pending approvals:', error);
      setPendingApprovals(0);
    }
  }, [isAdmin]);

  const refreshMissingPrechecks = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data, error } = await supabase.rpc('get_missing_precheck_reminders');
      if (error) throw error;
      setMissingPrechecks(data || []);
    } catch (error) {
      console.warn('Could not load missing pre-shift checks:', error);
    }
  }, [isAdmin]);

  // Admin alerts: poll on an interval and refresh as soon as the app is visible again (PWA resume)
  useEffect(() => {
    if (!isAdmin) {
      setPendingApprovals(0);
      setMissingPrechecks([]);
      return undefined;
    }

    refreshPendingApprovals();
    refreshMissingPrechecks();
    const approvalsInterval = setInterval(refreshPendingApprovals, PENDING_APPROVALS_POLL_MS);
    const prechecksInterval = setInterval(refreshMissingPrechecks, MISSING_PRECHECKS_POLL_MS);

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshPendingApprovals();
        refreshMissingPrechecks();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      clearInterval(approvalsInterval);
      clearInterval(prechecksInterval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAdmin, refreshPendingApprovals, refreshMissingPrechecks]);

  const alertCount = isAdmin ? pendingApprovals + missingPrechecks.length : 0;

  // Memoize value object to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    pendingApprovals,
    missingPrechecks,
    alertCount,
    refreshPendingApprovals,
    refreshMissingPrechecks,
    isAdmin,
    isVmu,
    isTransportManager,
    loading
  }), [pendingApprovals, missingPrechecks, alertCount, refreshPendingApprovals, refreshMissingPrechecks, isAdmin, isVmu, isTransportManager, loading]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired
};
