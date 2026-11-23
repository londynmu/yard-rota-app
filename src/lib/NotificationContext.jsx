import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';
import {
  mapRotaShiftDetails,
  resolveNotificationShiftLabels,
} from '../utils/rotaAssignmentPush';

const NotificationContext = createContext();

const PENDING_APPROVALS_POLL_MS = 30 * 1000;
const MISSING_PRECHECKS_POLL_MS = 60 * 1000;
const INBOX_POLL_MS = 60 * 1000;

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
  const [inboxNotifications, setInboxNotifications] = useState([]);
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

  const refreshInboxNotifications = useCallback(async () => {
    if (!userId) {
      setInboxNotifications([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id,title,message,type,is_read,created_at,metadata')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = data || [];
      const missingIds = [];
      for (const row of rows) {
        const meta = row.metadata || {};
        if (Array.isArray(meta.shifts) && meta.shifts.length > 0) continue;
        for (const id of meta.scheduled_rota_ids || []) {
          if (id) missingIds.push(id);
        }
      }
      let rotaById = {};
      if (missingIds.length > 0) {
        const uniqueIds = [...new Set(missingIds)];
        const { data: rotaRows, error: rotaError } = await supabase
          .from('scheduled_rota')
          .select('id,date,location,shift_type,start_time,end_time')
          .in('id', uniqueIds);
        if (rotaError) throw rotaError;
        rotaById = Object.fromEntries(
          (rotaRows || []).map((row) => [row.id, row]),
        );
      }
      setInboxNotifications(
        rows.map((row) => {
          const metadata = row.metadata || {};
          const snapshot = Array.isArray(metadata.shifts)
            ? mapRotaShiftDetails(metadata.shifts)
            : [];
          const shift_labels =
            snapshot.length > 0
              ? snapshot.map((s) => s.label)
              : resolveNotificationShiftLabels(metadata, rotaById);
          return { ...row, metadata, shift_labels };
        }),
      );
    } catch (error) {
      console.warn('Could not load notification inbox:', error);
      setInboxNotifications([]);
    }
  }, [userId]);

  const markInboxRead = useCallback(async (ids) => {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (list.length === 0) return;
    const idSet = new Set(list);
    // Optimistic: flip is_read only — never clear title/message.
    setInboxNotifications((prev) =>
      prev.map((row) => (idSet.has(row.id) ? { ...row, is_read: true } : row)),
    );
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', list);
    if (error) {
      await refreshInboxNotifications();
      throw error;
    }
    await refreshInboxNotifications();
  }, [refreshInboxNotifications]);

  const deleteReadInbox = useCallback(async () => {
    const readIds = inboxNotifications
      .filter((row) => row.is_read && row.id)
      .map((row) => row.id);
    if (readIds.length === 0) return;
    const idSet = new Set(readIds);
    setInboxNotifications((prev) => prev.filter((row) => !idSet.has(row.id)));
    const { error } = await supabase
      .from('notifications')
      .delete()
      .in('id', readIds);
    if (error) {
      await refreshInboxNotifications();
      throw error;
    }
    await refreshInboxNotifications();
  }, [inboxNotifications, refreshInboxNotifications]);

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

  // Inbox (push history): all signed-in users
  useEffect(() => {
    if (!userId) {
      setInboxNotifications([]);
      return undefined;
    }
    refreshInboxNotifications();
    const inboxInterval = setInterval(refreshInboxNotifications, INBOX_POLL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshInboxNotifications();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearInterval(inboxInterval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [userId, refreshInboxNotifications]);

  const unreadInboxCount = useMemo(
    () => inboxNotifications.filter((row) => !row.is_read).length,
    [inboxNotifications],
  );

  const readInboxCount = useMemo(
    () => inboxNotifications.filter((row) => row.is_read).length,
    [inboxNotifications],
  );

  const alertCount = isAdmin
    ? unreadInboxCount + pendingApprovals + missingPrechecks.length
    : unreadInboxCount;

  // Memoize value object to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    pendingApprovals,
    missingPrechecks,
    inboxNotifications,
    unreadInboxCount,
    readInboxCount,
    alertCount,
    refreshPendingApprovals,
    refreshMissingPrechecks,
    refreshInboxNotifications,
    markInboxRead,
    deleteReadInbox,
    isAdmin,
    isVmu,
    isTransportManager,
    loading
  }), [
    pendingApprovals,
    missingPrechecks,
    inboxNotifications,
    unreadInboxCount,
    readInboxCount,
    alertCount,
    refreshPendingApprovals,
    refreshMissingPrechecks,
    refreshInboxNotifications,
    markInboxRead,
    deleteReadInbox,
    isAdmin,
    isVmu,
    isTransportManager,
    loading,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired
};
