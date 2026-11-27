import React, { useState } from 'react';
import { useToast } from '../components/ui/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import usePendingApprovals from '../hooks/usePendingApprovals';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';
import { formatUserName } from '../utils/userName';

function PendingUserAvatar({ user }) {
  const name = formatUserName(user, 'User');
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-gray-200">
      {user.avatar_url ? (
        <img
          className="h-10 w-10 rounded-full object-cover"
          src={normalizeAvatarStorageUrl(user.avatar_url) || user.avatar_url}
          alt=""
          width={40}
          height={40}
          decoding="async"
        />
      ) : (
        <span className="text-sm font-semibold text-charcoal" aria-hidden="true">
          {user.first_name?.[0] || ''}
          {user.last_name?.[0] || ''}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

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
      <div className="admin-section-card animate-pulse motion-reduce:animate-none">
        <div className="admin-section-header !h-auto !block px-4 py-3 sm:px-6 sm:py-4">
          <div className="h-7 w-56 rounded bg-slate-200" />
          <div className="mt-2 h-4 w-72 max-w-full rounded bg-slate-100" />
        </div>
        <div className="divide-y divide-gray-200">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-200" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 max-w-full rounded bg-slate-200" />
                  <div className="h-3 w-48 max-w-full rounded bg-slate-100" />
                </div>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <div className="h-11 w-24 rounded-lg bg-slate-100" />
                <div className="h-11 w-24 rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <h3 className="mb-2 text-lg font-semibold text-charcoal">Error</h3>
        <p className="text-gray-600">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="admin-btn-danger mt-4 min-h-11"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="admin-section-card">
      <div className="admin-section-header !block !h-auto px-4 py-3 sm:px-6 sm:py-4">
        <h2 className="text-xl font-bold text-charcoal">Pending User Approvals</h2>
        <p className="mt-1 text-sm text-gray-600">
          Review and approve new user registrations
        </p>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="p-6 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
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
        <ul className="divide-y divide-gray-200" aria-label="Pending user approvals">
          {pendingUsers.map((user) => {
            const displayName = formatUserName(user, 'User');
            const registered = user.created_at
              ? new Date(user.created_at).toLocaleDateString()
              : 'Unknown';

            return (
              <li
                key={user.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PendingUserAvatar user={user} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">{displayName}</p>
                    <p className="truncate text-sm text-gray-600">{user.email || 'No email'}</p>
                    <p className="truncate text-xs text-gray-500">
                      {user.phone || 'No phone'}
                      <span aria-hidden="true"> · </span>
                      <span className="sr-only">Registered </span>
                      {registered}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:flex-shrink-0 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => handleApprove(user.id)}
                    className="admin-btn min-h-11 flex-1 sm:flex-none"
                    aria-label={`Approve ${displayName}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserToReject(user)}
                    className="admin-btn-danger min-h-11 flex-1 sm:flex-none"
                    aria-label={`Reject ${displayName}`}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
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
