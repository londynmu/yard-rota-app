import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/NotificationContext';
import { useToast } from '../components/ui/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';

const UserApprovalPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotifications() || {};
  const { success, error: toastError } = useToast();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectUserId, setRejectUserId] = useState(null);
  const navigate = useNavigate();

  // Check if user is admin and fetch pending users
  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        navigate('/');
        return;
      }

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;

        if (profileData?.role !== 'admin') {
          navigate('/');
          return;
        }

        // Fetch pending users using account_status
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('account_status', 'pending_approval')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        setPendingUsers(data || []);
      } catch (err) {
        console.error('Error fetching pending users:', err);
        setError('Failed to load pending users. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, [user, navigate]);

  // Approve a user
  const handleApprove = async (userId) => {
    try {
      // Update account_status to approved
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'approved' })
        .eq('id', userId);

      if (error) throw error;

      // Update the local state
      setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      
      success('User approved');
      // Add notification if available
      if (typeof addNotification === 'function') {
        addNotification('User approved successfully', 'success');
      }
    } catch (err) {
      console.error('Error approving user:', err);
      toastError('Failed to approve user');
      if (typeof addNotification === 'function') {
        addNotification('Failed to approve user', 'error');
      }
    }
  };

  // Reject a user (confirmed through ConfirmDialog)
  const handleReject = async (userId) => {
    if (!userId) return;

    try {
      // Update account_status to rejected
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'rejected' })
        .eq('id', userId);

      if (error) throw error;

      // Update the local state
      setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      
      success('User rejected');
      // Add notification if available
      if (typeof addNotification === 'function') {
        addNotification('User rejected', 'success');
      }
    } catch (err) {
      console.error('Error rejecting user:', err);
      toastError('Failed to reject user');
      if (typeof addNotification === 'function') {
        addNotification('Failed to reject user', 'error');
      }
    }
  };

  const formatRegistered = (createdAt) =>
    createdAt ? new Date(createdAt).toLocaleDateString() : 'Unknown';

  const renderAvatar = (pending, sizeClass) => (
    <div
      className={`flex-shrink-0 ${sizeClass} rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300`}
    >
      {pending.avatar_url ? (
        <img
          className={`${sizeClass} rounded-full object-cover`}
          src={normalizeAvatarStorageUrl(pending.avatar_url) || pending.avatar_url}
          alt={`${pending.first_name || ''} ${pending.last_name || ''}`}
          decoding="async"
        />
      ) : (
        <span className="text-charcoal text-sm font-semibold">
          {pending.first_name?.[0] || ''}
          {pending.last_name?.[0] || ''}
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-slate-300 rounded mb-6" />
        
        {/* Approval cards skeleton */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-slate-300 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-6 bg-slate-300 rounded w-48" />
                <div className="h-4 bg-slate-200 rounded w-64" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:justify-end md:gap-3">
              <div className="h-11 bg-slate-200 rounded-lg md:w-24 md:h-10" />
              <div className="h-11 bg-slate-200 rounded-lg md:w-24 md:h-10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
        <h3 className="text-lg font-semibold mb-2 text-charcoal">Error</h3>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // When embedded in AdminPage, don't use the full screen container
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-200">
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <h2 className="text-xl font-bold text-charcoal">Pending User Approvals</h2>
        <p className="text-gray-600 text-sm mt-1">
          Review and approve new user registrations
        </p>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="p-6 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 mx-auto text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-4 text-gray-600">No pending approvals</p>
        </div>
      ) : (
        <>
          {/* Mobile: one card per user so the actions are always on screen */}
          <div className="divide-y divide-gray-200 md:hidden">
            {pendingUsers.map((pending) => (
              <div key={pending.id} className="p-4">
                <div className="flex items-start gap-3">
                  {renderAvatar(pending, 'h-12 w-12')}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-charcoal break-words">
                      {pending.first_name || ''} {pending.last_name || ''}
                    </p>
                    <p className="text-sm text-gray-600 break-words">
                      {pending.email || 'No email'}
                    </p>
                    <p className="text-sm text-gray-600 break-words">
                      {pending.phone || 'No phone'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Registered {formatRegistered(pending.created_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleApprove(pending.id)}
                    className="flex min-h-11 items-center justify-center rounded-lg border-2 border-green-600 bg-white px-3 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectUserId(pending.id)}
                    className="flex min-h-11 items-center justify-center rounded-lg border-2 border-red-500 bg-white px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pendingUsers.map((pending) => (
                  <tr key={pending.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {renderAvatar(pending, 'h-10 w-10')}
                        <div className="ml-4">
                          <div className="text-sm font-medium text-charcoal">
                            {pending.first_name || ''} {pending.last_name || ''}
                          </div>
                          <div className="text-sm text-gray-600">
                            {pending.phone || 'No phone'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {pending.email || 'No email'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatRegistered(pending.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleApprove(pending.id)}
                        className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-lg text-white transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectUserId(pending.id)}
                        className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg text-white transition-colors"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={rejectUserId !== null}
        onClose={() => setRejectUserId(null)}
        onConfirm={() => handleReject(rejectUserId)}
        title="Reject user"
        message="This user will not be able to sign in. You can change it later in user management."
        confirmText="Reject"
        isDestructive
      />
    </div>
  );
};

export default UserApprovalPage; 
