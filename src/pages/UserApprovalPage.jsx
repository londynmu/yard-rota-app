import React, { useState } from 'react';
import { useToast } from '../components/ui/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import usePendingApprovals from '../hooks/usePendingApprovals';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';
import { formatUserName } from '../utils/userName';

const UserApprovalPage = () => {
  const toast = useToast();
  const { pendingUsers, loading, error, approve, reject, reload } = usePendingApprovals();
  const [userToReject, setUserToReject] = useState(null);

  const handleApprove = async (userId) => {
    try {
      await approve(userId);
      toast.success('User approved.');
    } catch (err) {
      console.error('Error approving user:', err);
      toast.error('Could not approve the user. Please try again.');
    }
  };

  const handleReject = async (userId) => {
    try {
      await reject(userId);
      toast.success('User rejected.');
    } catch (err) {
      console.error('Error rejecting user:', err);
      toast.error('Could not reject the user. Please try again.');
    }
  };

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
            <div className="flex gap-3 justify-end">
              <div className="h-10 w-24 bg-slate-200 rounded-lg" />
              <div className="h-10 w-24 bg-slate-200 rounded-lg" />
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
          onClick={reload}
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
        <div className="overflow-x-auto">
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
              {pendingUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300">
                        {user.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={normalizeAvatarStorageUrl(user.avatar_url) || user.avatar_url}
                            alt={`${user.first_name || ''} ${user.last_name || ''}`}
                            width={40}
                            height={40}
                            decoding="async"
                          />
                        ) : (
                          <span className="text-charcoal text-sm font-semibold">
                            {user.first_name?.[0] || ''}
                            {user.last_name?.[0] || ''}
                          </span>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-charcoal">
                          {user.first_name || ''} {user.last_name || ''}
                        </div>
                        <div className="text-sm text-gray-600">
                          {user.phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {user.email || 'No email'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-lg text-white transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setUserToReject(user)}
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
      )}

      <ConfirmDialog
        isOpen={Boolean(userToReject)}
        onClose={() => setUserToReject(null)}
        onConfirm={() => handleReject(userToReject.id)}
        title="Reject user"
        message={`Are you sure you want to reject ${formatUserName(userToReject, 'this user')}?`}
        confirmText="Reject"
        isDestructive
      />
    </div>
  );
};

export default UserApprovalPage; 