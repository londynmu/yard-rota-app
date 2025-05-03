import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/NotificationContext';

const UserApprovalPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotifications() || {};
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      
      // Add notification if available
      if (typeof addNotification === 'function') {
        addNotification('User approved successfully', 'success');
      }
    } catch (err) {
      console.error('Error approving user:', err);
      if (typeof addNotification === 'function') {
        addNotification('Failed to approve user', 'error');
      }
    }
  };

  // Reject a user
  const handleReject = async (userId) => {
    if (!window.confirm('Are you sure you want to reject this user?')) {
      return;
    }

    try {
      // Update account_status to rejected
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'rejected' })
        .eq('id', userId);

      if (error) throw error;

      // Update the local state
      setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      
      // Add notification if available
      if (typeof addNotification === 'function') {
        addNotification('User rejected', 'success');
      }
    } catch (err) {
      console.error('Error rejecting user:', err);
      if (typeof addNotification === 'function') {
        addNotification('Failed to reject user', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white shadow-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-500/30 text-center">
        <h3 className="text-lg font-semibold mb-2 text-white">Error</h3>
        <p className="text-white/80">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-red-700/40 hover:bg-red-700/60 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // When embedded in AdminPage, don't use the full screen container
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-white/10">
        <h2 className="text-xl font-bold text-white">Pending User Approvals</h2>
        <p className="text-white/70 text-sm mt-1">
          Review and approve new user registrations
        </p>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="p-6 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12 mx-auto text-white/30"
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
          <p className="mt-4 text-white/70">No pending approvals</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/5">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/70 uppercase tracking-wider">
                  Registered
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-white/70 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pendingUsers.map((user) => (
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center border border-white/20">
                        {user.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={user.avatar_url}
                            alt={`${user.first_name || ''} ${user.last_name || ''}`}
                          />
                        ) : (
                          <span className="text-white text-sm font-semibold">
                            {user.first_name?.[0] || ''}
                            {user.last_name?.[0] || ''}
                          </span>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-white">
                          {user.first_name || ''} {user.last_name || ''}
                        </div>
                        <div className="text-sm text-white/70">
                          {user.phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/90">
                    {user.email || 'No email'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/70">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="text-blue-400 hover:text-blue-300 mr-4 px-3 py-1 rounded-lg hover:bg-blue-500/20 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(user.id)}
                      className="text-red-400 hover:text-red-300 px-3 py-1 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UserApprovalPage; 