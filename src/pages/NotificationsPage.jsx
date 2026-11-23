import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useNotifications } from '../lib/NotificationContext';
import { useToast } from '../components/ui/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MissingPrecheckReminder from '../components/User/MissingPrecheckReminder';
import usePendingApprovals from '../hooks/usePendingApprovals';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';
import { formatUserName, getUserInitials } from '../utils/userName';

const OUTLINE_BUTTON_CLASS =
  'flex-1 sm:flex-none px-4 py-2 rounded-lg border-2 bg-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function SectionCard({ title, count, children, action }) {
  return (
    <section className="card-modern">
      <div className="px-5 py-3.5 flex items-center justify-between gap-2 bg-gradient-to-r from-slate-50 via-blue-50 to-slate-50 border-b border-slate-200/60">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <div className="flex items-center gap-2">
          {count > 0 && <span className="text-xs text-slate-500 tabular-nums">{count}</span>}
          {action}
        </div>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </section>
  );
}

SectionCard.propTypes = {
  title: PropTypes.string.isRequired,
  count: PropTypes.number,
  children: PropTypes.node,
  action: PropTypes.node,
};

function PendingUserCard({ person, busy, onApprove, onReject }) {
  const avatarUrl = person.avatar_url ? normalizeAvatarStorageUrl(person.avatar_url) || person.avatar_url : null;
  const name = formatUserName(person);
  const registered = person.created_at ? new Date(person.created_at).toLocaleDateString('en-GB') : null;

  return (
    <div className="rounded-xl border border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50/50 px-4 py-3 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-11 w-11 shrink-0 rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} width={44} height={44} decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-charcoal">{getUserInitials(person)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-charcoal truncate">{name}</p>
          <p className="text-xs text-slate-600 truncate">{person.email || 'No email'}</p>
          <p className="text-xs text-slate-500 truncate">
            {person.phone || 'No phone'}
            {registered && ` · Registered ${registered}`}
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className={`${OUTLINE_BUTTON_CLASS} border-red-500 text-red-600 hover:bg-red-50`}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className={`${OUTLINE_BUTTON_CLASS} border-emerald-500 text-emerald-700 hover:bg-emerald-50`}
        >
          Approve
        </button>
      </div>
    </div>
  );
}

PendingUserCard.propTypes = {
  person: PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    email: PropTypes.string,
    phone: PropTypes.string,
    avatar_url: PropTypes.string,
    created_at: PropTypes.string,
  }).isRequired,
  busy: PropTypes.bool,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

function PendingUsersSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200/60 px-4 py-3 flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-56 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InboxCard({ item }) {
  const created = item.created_at
    ? new Date(item.created_at).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        item.is_read
          ? 'border-slate-200/60 bg-white/70'
          : 'border-blue-200/70 bg-gradient-to-r from-slate-50 to-blue-50/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-charcoal">{item.title || 'Notification'}</p>
        {!item.is_read && (
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
            New
          </span>
        )}
      </div>
      {item.message ? (
        <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{item.message}</p>
      ) : null}
      {created ? <p className="mt-2 text-[11px] text-slate-500">{created}</p> : null}
    </div>
  );
}

InboxCard.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string,
    title: PropTypes.string,
    message: PropTypes.string,
    is_read: PropTypes.bool,
    created_at: PropTypes.string,
  }).isRequired,
};

/** Shared notification hub: push inbox for everyone; join requests + missing took pre-checks for admins. */
export default function NotificationsPage() {
  const toast = useToast();
  const {
    isAdmin,
    missingPrechecks = [],
    inboxNotifications = [],
    unreadInboxCount = 0,
    markInboxRead,
  } = useNotifications() || {};
  const { pendingUsers, loading, error, approve, reject, reload } = usePendingApprovals();
  const [busyUserId, setBusyUserId] = useState(null);
  const [userToReject, setUserToReject] = useState(null);
  const [markingRead, setMarkingRead] = useState(false);

  const runAction = async (person, action, successMessage, errorMessage) => {
    setBusyUserId(person.id);
    try {
      await action(person.id);
      toast.success(successMessage);
    } catch (err) {
      console.error(errorMessage, err);
      toast.error(errorMessage);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleApprove = (person) =>
    runAction(person, approve, `${formatUserName(person)} approved.`, 'Could not approve the user. Please try again.');

  const handleReject = (person) =>
    runAction(person, reject, `${formatUserName(person)} rejected.`, 'Could not reject the user. Please try again.');

  const handleMarkAllRead = async () => {
    const unreadIds = inboxNotifications.filter((row) => !row.is_read).map((row) => row.id);
    if (unreadIds.length === 0) return;
    setMarkingRead(true);
    try {
      await markInboxRead?.(unreadIds);
      toast.success('Notifications marked as read.');
    } catch (err) {
      console.error(err);
      toast.error('Notifications could not be updated.');
    } finally {
      setMarkingRead(false);
    }
  };

  const showApprovals = isAdmin && (loading || Boolean(error) || pendingUsers.length > 0);
  const showMissing = isAdmin && missingPrechecks.length > 0;
  const showInbox = inboxNotifications.length > 0;
  const allCaughtUp = !showApprovals && !showMissing && !showInbox;

  return (
    <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-6">
      <div className="page-content-inner">
        <h1 className="hidden md:block text-2xl font-bold tracking-tight text-charcoal">Notifications</h1>

        {showApprovals && (
          <SectionCard title="Waiting for approval" count={pendingUsers.length}>
            {loading && <PendingUsersSkeleton />}
            {!loading && error && (
              <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="shrink-0 px-3 py-1.5 rounded-lg border-2 border-red-500 bg-white text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && pendingUsers.map((person) => (
              <PendingUserCard
                key={person.id}
                person={person}
                busy={busyUserId === person.id}
                onApprove={() => handleApprove(person)}
                onReject={() => setUserToReject(person)}
              />
            ))}
          </SectionCard>
        )}

        {showMissing && (
          <SectionCard title="Missing took pre-checks" count={missingPrechecks.length}>
            <MissingPrecheckReminder people={missingPrechecks} />
          </SectionCard>
        )}

        {showInbox && (
          <SectionCard
            title="Recent notifications"
            count={inboxNotifications.length}
            action={
              unreadInboxCount > 0 ? (
                <button
                  type="button"
                  disabled={markingRead}
                  onClick={handleMarkAllRead}
                  className="shrink-0 px-3 py-1.5 rounded-lg border-2 border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Mark all read
                </button>
              ) : null
            }
          >
            {inboxNotifications.map((item) => (
              <InboxCard key={item.id} item={item} />
            ))}
          </SectionCard>
        )}

        {allCaughtUp && (
          <div className="card-modern px-6 py-10 text-center">
            <p className="text-base font-semibold text-charcoal">You&apos;re all caught up.</p>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                ? 'New sign-ups, missing took pre-checks, and push notifications will show up here.'
                : 'Recent push notifications will show up here.'}
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(userToReject)}
        onClose={() => setUserToReject(null)}
        onConfirm={() => handleReject(userToReject)}
        title="Reject user"
        message={`Are you sure you want to reject ${formatUserName(userToReject, 'this user')}?`}
        confirmText="Reject"
        isDestructive
      />
    </div>
  );
}
