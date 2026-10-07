import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useNotifications } from '../lib/NotificationContext';

/**
 * Pending sign-ups for admins, with approve / reject actions.
 * Re-fetches whenever the polled pending count in NotificationContext changes.
 */
export default function usePendingApprovals() {
  const { isAdmin, pendingApprovals = 0, refreshPendingApprovals } = useNotifications() || {};
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPendingUsers = useCallback(async () => {
    if (!isAdmin) {
      setPendingUsers([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_status', 'pending_approval')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPendingUsers(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching pending users:', err);
      setError('Failed to load pending users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchPendingUsers();
  }, [fetchPendingUsers, pendingApprovals]);

  const setAccountStatus = useCallback(async (userId, status) => {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ account_status: status })
      .eq('id', userId);

    if (updateError) throw updateError;
    setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
    refreshPendingApprovals?.();
  }, [refreshPendingApprovals]);

  const approve = useCallback((userId) => setAccountStatus(userId, 'approved'), [setAccountStatus]);
  const reject = useCallback((userId) => setAccountStatus(userId, 'rejected'), [setAccountStatus]);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchPendingUsers();
  }, [fetchPendingUsers]);

  return { pendingUsers, loading, error, approve, reject, reload };
}
