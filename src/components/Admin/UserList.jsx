import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ui/ToastContext';
import { useAdminStatus } from '../../hooks/useAdminStatus';
import UserEditForm from './UserEditForm';
import UserViolationsPanel from './UserViolationsPanel';
import UserAssessmentsPanel from './UserAssessmentsPanel';
import { isReassessmentEligibleRole } from '../../utils/reassessmentDefaults';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';
import { parseAvatarStorageRef, normalizeAvatarStorageUrl } from '../../utils/avatarUrl';
import { whatsAppReadyLabel } from '../../utils/phoneE164';

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'vmu') return 'VMU';
  if (role === 'transport_manager') return 'Transport manager';
  return 'User';
}

function WhatsAppReadyChip({ user }) {
  const label = whatsAppReadyLabel(user);
  const className =
    label === 'WA ready'
      ? 'bg-green-100 text-green-800'
      : label === 'no consent'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      title="WhatsApp PreCheck reminder readiness"
    >
      {label}
    </span>
  );
}

WhatsAppReadyChip.propTypes = {
  user: PropTypes.shape({
    phone_e164: PropTypes.string,
    whatsapp_opt_in: PropTypes.bool,
  }).isRequired,
};

function UserAvatar({ user }) {
  return (
    <div className="relative h-10 w-10 flex-shrink-0">
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <span className="text-sm font-semibold text-charcoal">
            {user.first_name?.charAt(0) || '?'}
          </span>
        </div>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
          user.is_active === false ? 'bg-gray-300' : 'bg-green-500'
        }`}
      />
    </div>
  );
}

// Create a modal portal component
const Modal = ({ isOpen, onClose, children }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Create a portal to render the modal outside the normal DOM hierarchy
  return createPortal(
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      style={{ 
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10000,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        className="admin-modal-panel mx-auto max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

// Add propTypes for Modal
Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

// Bottom Sheet component for mobile user details
const BottomSheet = ({ isOpen, onClose, children }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/50 z-[10000]"
      onClick={onClose}
    >
      {/* Bottom Sheet Container */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up"
        style={{
          animation: 'slideUp 0.3s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="sticky top-0 bg-white pt-3 pb-2 flex justify-center rounded-t-2xl">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

// Add propTypes for BottomSheet
BottomSheet.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default function UserList({ users, onRefresh, focusUserId, focusTab, onFocusConsumed }) {
  const [processingUser, setProcessingUser] = useState(null);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [confirmationStep, setConfirmationStep] = useState(1);
  const [confirmationInput, setConfirmationInput] = useState('');
  const confirmInputRef = useRef(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('last_login');

  // Last Login info
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoUser, setInfoUser] = useState(null);
  const [lastLogin, setLastLogin] = useState(null);

  // Expanded user card (one at a time) + Details | Violations tabs
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userPanel, setUserPanel] = useState('details');
  const [formDirty, setFormDirty] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const pendingNavRef = useRef(null); // { type: 'collapse' | 'expand' | 'tab', userId?, tab? }
  const [violationCountByUser, setViolationCountByUser] = useState({});
  const [assessmentCountByUser, setAssessmentCountByUser] = useState({});
  // Role update in progress (for dropdown loading state)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState(null);
  const toast = useToast();
  const { isAdmin } = useAdminStatus();
  
  const visibleUsers = useMemo(() => {
    let result = users;
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = users.filter((user) => {
        const firstName = (user.first_name || '').toLowerCase();
        const lastName = (user.last_name || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        return firstName.includes(query) || lastName.includes(query) || fullName.includes(query);
      });
    }

    const sorted = [...result];
    if (sortBy === 'last_login') {
      sorted.sort((a, b) => {
        const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        if (aTime === bTime) {
          return (a.last_name || '').localeCompare(b.last_name || '');
        }
        // Newest login first; never-logged users (0) sink to the bottom
        return bTime - aTime;
      });
    } else {
      sorted.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    }
    return sorted;
  }, [users, searchQuery, sortBy]);

  // Focus on confirmation input when step changes to 2
  useEffect(() => {
    if (confirmationStep === 2 && confirmInputRef.current) {
      setTimeout(() => {
        if (confirmInputRef.current) {
          confirmInputRef.current.focus();
        }
      }, 100);
    }
  }, [confirmationStep]);

  // Deep-link from Attendance / Dashboard: expand user + target tab.
  // Clear search so a narrowed list cannot hide the target card.
  useEffect(() => {
    if (!focusUserId) return;
    setSearchQuery('');
    setExpandedUserId(focusUserId);
    let tab =
      focusTab === 'violations' || focusTab === 'assessments' ? focusTab : 'details';
    const target = users.find((u) => u.id === focusUserId);
    if (tab === 'assessments' && target && !isReassessmentEligibleRole(target.role)) {
      tab = 'details';
    }
    setUserPanel(tab);
    setFormDirty(false);
    onFocusConsumed?.();
  }, [focusUserId, focusTab, onFocusConsumed, users]);

  const applyPendingNav = () => {
    const pending = pendingNavRef.current;
    pendingNavRef.current = null;
    setFormDirty(false);
    if (!pending) return;
    if (pending.type === 'collapse') {
      setExpandedUserId(null);
      setUserPanel('details');
    } else if (pending.type === 'expand') {
      setExpandedUserId(pending.userId);
      setUserPanel(pending.tab || 'details');
    } else if (pending.type === 'tab') {
      setUserPanel(pending.tab);
    }
  };

  const requestExpandToggle = (userId) => {
    const isSame = expandedUserId === userId;
    if (formDirty && expandedUserId) {
      pendingNavRef.current = isSame
        ? { type: 'collapse' }
        : { type: 'expand', userId, tab: 'details' };
      setUnsavedDialogOpen(true);
      return;
    }
    if (isSame) {
      setExpandedUserId(null);
      setUserPanel('details');
      setFormDirty(false);
    } else {
      setExpandedUserId(userId);
      setUserPanel('details');
      setFormDirty(false);
    }
  };

  const requestPanelChange = (nextTab) => {
    if (nextTab === userPanel) return;
    if (formDirty && userPanel === 'details') {
      pendingNavRef.current = { type: 'tab', tab: nextTab };
      setUnsavedDialogOpen(true);
      return;
    }
    setUserPanel(nextTab);
  };

  const requestExpandToggleRef = useRef(requestExpandToggle);
  requestExpandToggleRef.current = requestExpandToggle;

  useEffect(() => {
    if (!expandedUserId) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (showDeleteModal || unsavedDialogOpen) return;
      requestExpandToggleRef.current?.(expandedUserId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedUserId, showDeleteModal, unsavedDialogOpen]);

  useEffect(() => {
    if (!expandedUserId) return;
    document.getElementById(`admin-user-row-${expandedUserId}`)?.scrollIntoView({ block: 'nearest' });
  }, [expandedUserId, visibleUsers]);
  
  const openDeleteModal = (user) => {
    setUserToDelete(user);
    setConfirmationStep(1);
    setConfirmationInput('');
    setShowDeleteModal(true);
  };
  
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
  };
  
  const handleFirstConfirmation = () => {
    setConfirmationStep(2);
  };
  
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    try {
      setProcessingUser(userToDelete.id);
      setError(null);
      closeDeleteModal();

      // First get the user's avatar URL to delete it later
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userToDelete.id)
        .single();

      if (userError) {
        throw userError;
      }

      // Anonymises the account server-side; PreCheck and safety records are kept.
      const { error: deleteError } = await supabase.rpc('delete_user', {
        user_id: userToDelete.id,
      });

      if (deleteError) {
        if (deleteError.message?.includes('USE_SELF_DELETE')) {
          throw new Error('Use Delete account on your Profile page to delete your own account.');
        }
        throw deleteError;
      }

      // Remove the old avatar only once the account is anonymised
      if (userData?.avatar_url) {
        const ref = parseAvatarStorageRef(userData.avatar_url);
        if (ref) {
          const { error: storageError } = await supabase.storage
            .from(ref.bucket)
            .remove([ref.objectPath]);

          if (storageError) {
            console.error('Error deleting avatar:', storageError);
          }
        }
      }
      
      // Refresh the user list
      if (onRefresh) {
        onRefresh();
      }

      setExpandedUserId((current) => (current === userToDelete.id ? null : current));
      setUserPanel('details');
      setFormDirty(false);
      
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(`Failed to delete user: ${error.message}`);
      
      // Reopen the modal if there was an error
      setShowDeleteModal(true);
    } finally {
      setProcessingUser(null);
    }
  };
  
  const handleRefresh = async () => {
    if (onRefresh) {
      await onRefresh();
    }
  };

  // Get shift badge style
  const getShiftBadge = (shift) => {
    const shiftLower = (shift || '').toLowerCase();
    const shiftCapitalized = shift ? shift.charAt(0).toUpperCase() + shift.slice(1) : null;
    
    switch (shiftLower) {
      case 'day':
        return { label: shiftCapitalized, className: 'bg-amber-100 text-amber-700 rounded-full' };
      case 'afternoon':
        return { label: shiftCapitalized, className: 'bg-blue-100 text-blue-700 rounded-full' };
      case 'night':
        return { label: shiftCapitalized, className: 'bg-indigo-100 text-indigo-700 rounded-full' };
      default:
        return null;
    }
  };
  
  const closeInfoModal = () => {
    setInfoModalOpen(false);
    setInfoUser(null);
    setLastLogin(null);
  };

  const handleRoleChange = async (user, newRoleValue) => {
    if (!isAdmin) return;
    const role = newRoleValue === '' ? null : newRoleValue;
    setRoleUpdatingUserId(user.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Role updated');
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Error updating role:', err);
      toast.error(err?.message || 'Failed to update role');
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  if (error) {
    return (
      <div className="bg-red-500/40 backdrop-blur-xl text-red-100 px-4 py-3 rounded-md mb-4 border border-red-400/50 shadow-lg">
        {error}
      </div>
    );
  }
  
  // Delete Modal Content
  const deleteModalContent = (
    <>
            <div className="admin-modal-header sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-red-800">
                    Delete user
                  </h3>
                </div>
                <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeDeleteModal();
            }}
                  className="admin-icon-btn min-h-11 min-w-11"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-4 py-4">
              {confirmationStep === 1 ? (
                <div>
                  <p className="text-gray-700 mb-3 text-sm">
                    Are you sure you want to delete this user?
                  </p>
                  <p className="text-gray-900 font-semibold text-base mb-4">
                    {userToDelete?.first_name} {userToDelete?.last_name}
                  </p>
                  <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg">
                    <p className="font-medium text-sm">⚠️ Warning</p>
                    <p className="text-xs mt-1">
                      Their name, email, photo, availability and sign-in are removed. PreCheck and safety records stay as
                      &quot;Deleted user&quot;. This cannot be undone.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 mb-3 text-sm">
                    <span className="font-medium">Final confirmation required.</span> Please type <span className="font-semibold text-red-600">delete</span> to confirm:
                  </p>
                  <label htmlFor="admin-user-delete-confirm" className="sr-only">
                    Type delete to confirm
                  </label>
                  <input
                    ref={confirmInputRef}
                    id="admin-user-delete-confirm"
                    type="text"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    className="admin-input min-h-11"
                    placeholder="Type 'delete' to confirm"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
            <div className="admin-modal-footer !justify-stretch gap-3">
              <button
          type="button"
          onClick={closeDeleteModal}
                className="admin-btn min-h-11 flex-1"
              >
                Cancel
              </button>
              {confirmationStep === 1 ? (
                <button
            type="button"
                  onClick={handleFirstConfirmation}
                  className="admin-btn-danger min-h-11 flex-1"
                >
                  Continue
                </button>
              ) : (
                <button
            type="button"
                  onClick={handleDeleteUser}
                  disabled={confirmationInput.toLowerCase() !== 'delete'}
                  className="admin-btn-danger min-h-11 flex-1"
                >
                  Delete User
                </button>
              )}
            </div>
    </>
  );
  
  const selectedUser = users.find((user) => user.id === expandedUserId) || null;
  const selectedViolationCount = selectedUser
    ? violationCountByUser[selectedUser.id]
    : undefined;
  const selectedAssessmentCount = selectedUser
    ? assessmentCountByUser[selectedUser.id]
    : undefined;

  return (
    <div className="flex h-full min-h-0 w-full flex-col md:flex-row md:gap-4">
    <div className={`mr-auto flex h-full min-h-0 w-full min-w-0 flex-col ${selectedUser ? 'md:mr-0 md:min-w-0 md:flex-1 md:basis-0' : 'max-w-lg'}`}>
      <div className="mb-4 flex shrink-0 flex-col gap-3 bg-offwhite sm:flex-row sm:items-center sm:gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="admin-users-search" className="sr-only">
            Search users by name
          </label>
          <input
            id="admin-users-search"
            type="search"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input min-h-11 pl-9"
            autoComplete="off"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <label htmlFor="admin-users-sort" className="sr-only">
          Sort users
        </label>
        <select
          id="admin-users-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="admin-input min-h-11 w-full shrink-0 sm:w-auto sm:min-w-[13rem]"
        >
          <option value="last_login">Last login (newest)</option>
          <option value="name">Name (A–Z)</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain" aria-label="Users">
        {visibleUsers.map((user) => {
          const isSelected = expandedUserId === user.id;
          const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';

          return (
            <button
              key={user.id}
              id={`admin-user-row-${user.id}`}
              type="button"
              onClick={() => requestExpandToggle(user.id)}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={displayName}
              className={`admin-section-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 motion-reduce:transition-none [content-visibility:auto] [contain-intrinsic-size:auto_65px] ${
                isSelected ? 'ring-2 ring-charcoal/20' : ''
              }`}
            >
              <UserAvatar user={user} />
              <span className="min-w-0 truncate text-sm font-semibold text-charcoal">
                {user.first_name || ''} {user.last_name || ''}
              </span>
              <WhatsAppReadyChip user={user} />
              {user.last_activity_at && (
                <span className="ml-auto flex-shrink-0 text-xs text-gray-500">
                  {formatDistanceToNow(new Date(user.last_activity_at), { addSuffix: true })}
                </span>
              )}
            </button>
          );
        })}

        {visibleUsers.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting your search.</p>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal (portal) */}
      <Modal isOpen={showDeleteModal} onClose={closeDeleteModal}>
        {deleteModalContent}
      </Modal>
      
      {/* Info Modal */}
      {infoModalOpen && (
        <Modal isOpen={infoModalOpen} onClose={closeInfoModal}>
            <div className="admin-modal-header">
              <h3 className="admin-section-title">User information</h3>
            </div>
            <div className="px-4 py-4">
              {infoUser && (
                <div className="space-y-3">
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Name:</span>
                    <span className="text-charcoal font-medium">{infoUser.first_name} {infoUser.last_name}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">User ID:</span>
                    <span className="text-charcoal font-mono text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200">{infoUser.id}</span>
                  </div>
                  {infoUser.yard_system_id && (
                    <div className="flex items-start">
                      <span className="font-semibold text-gray-600 w-24 text-sm">Yard ID:</span>
                      <span className="text-charcoal font-semibold">{infoUser.yard_system_id}</span>
                    </div>
                  )}
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Shift:</span>
                    {getShiftBadge(infoUser.shift_preference) ? (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getShiftBadge(infoUser.shift_preference).className}`}>
                        {getShiftBadge(infoUser.shift_preference).label}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </div>
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Agency:</span>
                    <span className="text-charcoal">{infoUser.agency_name || 'Direct'}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Score:</span>
                    <span className="text-charcoal font-semibold">{infoUser.performance_score || '–'}</span>
                  </div>
                  {lastLogin ? (
                    <div className="flex items-start pt-2 border-t border-gray-100">
                      <span className="font-semibold text-gray-600 w-24 text-sm">Last login:</span>
                      <div className="flex-1">
                        <div className="text-charcoal">{new Date(lastLogin).toLocaleString()}</div>
                        <div className="text-gray-500 text-xs mt-1">{formatDistanceToNow(new Date(lastLogin), { addSuffix: true })}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm pt-2 border-t border-gray-100">Last login information not available</p>
                  )}
                </div>
              )}
              <div className="text-right mt-5 pt-4 border-t border-gray-200">
                <button onClick={closeInfoModal} className="admin-btn">Close</button>
              </div>
            </div>
        </Modal>
      )}
      
      <ConfirmDialog
        isOpen={unsavedDialogOpen}
        onClose={() => {
          setUnsavedDialogOpen(false);
          pendingNavRef.current = null;
        }}
        onConfirm={applyPendingNav}
        title="Unsaved changes"
        message="You have unsaved changes. Discard them?"
        confirmText="Discard"
        cancelText="Keep editing"
        isDestructive
        overlayClassName="z-[10001]"
      />
    </div>
    {selectedUser && (
      <div
        className="fixed right-0 top-[72px] z-[60] flex h-[calc(100dvh-72px)] w-full min-w-0 flex-col border-l border-gray-200 bg-white shadow-xl md:static md:z-auto md:h-full md:min-h-0 md:w-auto md:flex-1 md:basis-0 md:overflow-hidden md:rounded-xl md:border md:shadow-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-drawer-title"
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <UserAvatar user={selectedUser} />
          <h2 id="admin-user-drawer-title" className="min-w-0 flex-1 truncate text-base font-semibold text-charcoal">
            {selectedUser.first_name || ''} {selectedUser.last_name || ''}
          </h2>
          {isAdmin ? (
            <select
              id="admin-user-role"
              aria-label={`Role for ${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`}
              value={selectedUser.role || ''}
              onChange={(e) => handleRoleChange(selectedUser, e.target.value)}
              disabled={roleUpdatingUserId === selectedUser.id}
              className="admin-input min-h-11 !w-auto shrink-0 disabled:opacity-60"
            >
              <option value="">User</option>
              <option value="admin">Admin</option>
              <option value="vmu">VMU</option>
              <option value="transport_manager">Transport manager</option>
            </select>
          ) : (
            <span className="shrink-0 text-sm text-charcoal">{roleLabel(selectedUser.role)}</span>
          )}
        </div>

        <div className="flex gap-5 border-b border-gray-200 px-5" role="tablist" aria-label="User panels">
          <button
            type="button"
            role="tab"
            id="admin-user-tab-details"
            aria-selected={userPanel === 'details'}
            aria-controls="admin-user-panel-details"
            onClick={() => requestPanelChange('details')}
            className={`inline-flex min-h-11 items-center border-b-2 -mb-px py-2.5 text-sm font-medium ${
              userPanel === 'details' ? 'border-charcoal text-charcoal' : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            role="tab"
            id="admin-user-tab-violations"
            aria-selected={userPanel === 'violations'}
            aria-controls="admin-user-panel-violations"
            onClick={() => requestPanelChange('violations')}
            className={`inline-flex min-h-11 items-center border-b-2 -mb-px py-2.5 text-sm font-medium ${
              userPanel === 'violations' ? 'border-charcoal text-charcoal' : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            Violations
            {typeof selectedViolationCount === 'number' && selectedViolationCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-200 px-1 text-xs font-bold text-charcoal">
                {selectedViolationCount}
              </span>
            )}
          </button>
          {isReassessmentEligibleRole(selectedUser.role) && (
            <button
              type="button"
              role="tab"
              id="admin-user-tab-assessments"
              aria-selected={userPanel === 'assessments'}
              aria-controls="admin-user-panel-assessments"
              onClick={() => requestPanelChange('assessments')}
              className={`inline-flex min-h-11 items-center border-b-2 -mb-px py-2.5 text-sm font-medium ${
                userPanel === 'assessments' ? 'border-charcoal text-charcoal' : 'border-transparent text-gray-500 hover:text-charcoal'
              }`}
            >
              Assessments
              {typeof selectedAssessmentCount === 'number' && selectedAssessmentCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-200 px-1 text-xs font-bold text-charcoal">
                  {selectedAssessmentCount}
                </span>
              )}
            </button>
          )}
        </div>

        <div className={`border-b border-gray-200 px-5 py-3 ${userPanel === 'details' ? '' : 'hidden'}`}>
          <div id="admin-user-visibility-slot" className="flex items-center" />
        </div>

        <div className={`min-h-0 flex-1 ${userPanel === 'violations' || userPanel === 'assessments' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          <div
            id="admin-user-panel-details"
            role="tabpanel"
            aria-labelledby="admin-user-tab-details"
            hidden={userPanel !== 'details'}
            className={userPanel === 'details' ? 'px-5 py-5' : 'hidden'}
          >
            <UserEditForm
              key={selectedUser.id}
              user={selectedUser}
              inline
              onDirtyChange={setFormDirty}
              onClose={() => requestExpandToggle(selectedUser.id)}
              onSuccess={() => {
                handleRefresh();
                setFormDirty(false);
              }}
            />
          </div>
          {userPanel === 'violations' && (
            <div
              id="admin-user-panel-violations"
              role="tabpanel"
              aria-labelledby="admin-user-tab-violations"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <UserViolationsPanel
                userId={selectedUser.id}
                users={users}
                onCountChange={(count) => {
                  setViolationCountByUser((prev) => ({ ...prev, [selectedUser.id]: count }));
                }}
              />
            </div>
          )}
          {userPanel === 'assessments' && (
            <div
              id="admin-user-panel-assessments"
              role="tabpanel"
              aria-labelledby="admin-user-tab-assessments"
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <UserAssessmentsPanel
                user={selectedUser}
                onCountChange={(count) => {
                  setAssessmentCountByUser((prev) => ({ ...prev, [selectedUser.id]: count }));
                }}
              />
            </div>
          )}
        </div>

        {userPanel === 'details' && (
          <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
            <button
              type="button"
              onClick={() => openDeleteModal(selectedUser)}
              disabled={processingUser === selectedUser.id}
              className="admin-btn-danger min-h-11"
            >
              {processingUser === selectedUser.id ? 'Deleting…' : 'Delete user'}
            </button>
            <button type="submit" form="user-edit-inline-form" className="admin-btn min-h-11">
              Save changes
            </button>
          </div>
        )}
      </div>
    )}
    </div>
  );
}

UserList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
  focusUserId: PropTypes.string,
  focusTab: PropTypes.oneOf(['details', 'violations', 'assessments']),
  onFocusConsumed: PropTypes.func,
};