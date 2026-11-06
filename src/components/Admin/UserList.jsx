import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ui/ToastContext';
import { useAdminStatus } from '../../hooks/useAdminStatus';
import UserEditForm from './UserEditForm';
import UserViolationsPanel from './UserViolationsPanel';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatDistanceToNow } from 'date-fns';
import { parseAvatarStorageRef, normalizeAvatarStorageUrl } from '../../utils/avatarUrl';

function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'vmu') return 'VMU';
  if (role === 'transport_manager') return 'Transport manager';
  return 'User';
}

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

// Filter Modal Component
const FilterModal = ({ isOpen, onClose, filters, onApplyFilters, onResetAllFilters }) => {
  const [shiftFilter, setShiftFilter] = useState(filters.shift || 'all');
  const [sortBy, setSortBy] = useState(filters.sortBy || 'name');
  const [sortOrder, setSortOrder] = useState(filters.sortOrder || 'asc');

  // Keep draft controls in sync with applied filters (e.g. deep-link reset to shift=all)
  useEffect(() => {
    if (!isOpen) return;
    setShiftFilter(filters.shift || 'all');
    setSortBy(filters.sortBy || 'name');
    setSortOrder(filters.sortOrder || 'asc');
  }, [isOpen, filters.shift, filters.sortBy, filters.sortOrder]);
  
  const handleApplyFilters = () => {
    onApplyFilters({
      shift: shiftFilter,
      sortBy: sortBy,
      sortOrder: sortOrder
    });
    onClose();
  };
  
  const handleReset = () => {
    setShiftFilter('all');
    setSortBy('name');
    setSortOrder('asc');
    if (onResetAllFilters) {
      onResetAllFilters();
    } else {
      onApplyFilters({
        shift: 'all',
        sortBy: 'name',
        sortOrder: 'asc'
      });
    }
    onClose();
  };
  
  const chipClass = (active) =>
    `admin-chip cursor-pointer w-full ${active ? 'admin-chip-active' : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="admin-modal-header sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-charcoal">
            Filter and sort
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="admin-icon-btn"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div className="px-4 py-4">
        {/* Shift Filter */}
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Filter by Shift</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className={chipClass(shiftFilter === 'all')}>
              <input
                type="radio"
                name="shiftFilter"
                value="all"
                checked={shiftFilter === 'all'}
                onChange={() => setShiftFilter('all')}
                className="sr-only"
              />
              <span>All</span>
            </label>
            
            <label className={chipClass(shiftFilter === 'day')}>
              <input
                type="radio"
                name="shiftFilter"
                value="day"
                checked={shiftFilter === 'day'}
                onChange={() => setShiftFilter('day')}
                className="sr-only"
              />
              <span>Day</span>
            </label>
            
            <label className={chipClass(shiftFilter === 'afternoon')}>
              <input
                type="radio"
                name="shiftFilter"
                value="afternoon"
                checked={shiftFilter === 'afternoon'}
                onChange={() => setShiftFilter('afternoon')}
                className="sr-only"
              />
              <span>Afternoon</span>
            </label>
            
            <label className={chipClass(shiftFilter === 'night')}>
              <input
                type="radio"
                name="shiftFilter"
                value="night"
                checked={shiftFilter === 'night'}
                onChange={() => setShiftFilter('night')}
                className="sr-only"
              />
              <span>Night</span>
            </label>
          </div>
        </div>
        
        {/* Sort Options */}
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Sort By</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={chipClass(sortBy === 'name')}>
              <input
                type="radio"
                name="sortBy"
                value="name"
                checked={sortBy === 'name'}
                onChange={() => setSortBy('name')}
                className="sr-only"
              />
              <span>Last Name</span>
            </label>
            
            <label className={chipClass(sortBy === 'score')}>
              <input
                type="radio"
                name="sortBy"
                value="score"
                checked={sortBy === 'score'}
                onChange={() => setSortBy('score')}
                className="sr-only"
              />
              <span>Performance Score</span>
            </label>
          </div>
        </div>
        
        {/* Sort Order */}
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Order</h4>
          <div className="admin-seg-track w-full grid grid-cols-2 !h-auto p-0.5">
            <label className={`admin-seg-item cursor-pointer w-full ${sortOrder === 'asc' ? 'admin-seg-item-active' : ''}`}>
              <input
                type="radio"
                name="sortOrder"
                value="asc"
                checked={sortOrder === 'asc'}
                onChange={() => setSortOrder('asc')}
                className="sr-only"
              />
              <span>Ascending</span>
            </label>
            
            <label className={`admin-seg-item cursor-pointer w-full ${sortOrder === 'desc' ? 'admin-seg-item-active' : ''}`}>
              <input
                type="radio"
                name="sortOrder"
                value="desc"
                checked={sortOrder === 'desc'}
                onChange={() => setSortOrder('desc')}
                className="sr-only"
              />
              <span>Descending</span>
            </label>
          </div>
        </div>
      </div>
      
      <div className="admin-modal-footer !justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="admin-btn-muted flex-1"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApplyFilters}
          className="admin-btn flex-1"
        >
          Apply
        </button>
      </div>
    </Modal>
  );
};

// Add propTypes for FilterModal
FilterModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  filters: PropTypes.shape({
    shift: PropTypes.string,
    sortBy: PropTypes.string,
    sortOrder: PropTypes.string
  }).isRequired,
  onApplyFilters: PropTypes.func.isRequired,
  onResetAllFilters: PropTypes.func.isRequired,
};

export default function UserList({ users, onRefresh, focusUserId, focusTab, onFocusConsumed }) {
  const [processingUser, setProcessingUser] = useState(null);
  const [error, setError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [confirmationStep, setConfirmationStep] = useState(1);
  const [confirmationInput, setConfirmationInput] = useState('');
  const confirmInputRef = useRef(null);
  
  // Initialize filter state from localStorage or default values
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState(() => {
    const savedFilters = localStorage.getItem('userListFilters');
    return savedFilters ? JSON.parse(savedFilters) : {
      shift: 'all',
      sortBy: 'name',
      sortOrder: 'asc'
    };
  });
  
  // Search query state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtered and sorted users
  const [filteredUsers, setFilteredUsers] = useState([]);
  
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
  // Role update in progress (for dropdown loading state)
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState(null);
  const toast = useToast();
  const { isAdmin } = useAdminStatus();
  
  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('userListFilters', JSON.stringify(filters));
  }, [filters]);
  
  // Apply filters and sorting when users or filters change
  useEffect(() => {
    let result = [...users];
    
    // Apply search filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(user => {
        const firstName = (user.first_name || '').toLowerCase();
        const lastName = (user.last_name || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        return firstName.includes(query) || lastName.includes(query) || fullName.includes(query);
      });
    }
    
    // Apply shift filter
    if (filters.shift !== 'all') {
      result = result.filter(user => user.shift_preference === filters.shift);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      if (filters.sortBy === 'name') {
        const lastNameA = a.last_name || '';
        const lastNameB = b.last_name || '';
        
        if (filters.sortOrder === 'asc') {
          return lastNameA.localeCompare(lastNameB);
        } else {
          return lastNameB.localeCompare(lastNameA);
        }
      } else { // score
        const scoreA = a.performance_score || 0;
        const scoreB = b.performance_score || 0;
        
        if (filters.sortOrder === 'asc') {
          return scoreA - scoreB;
        } else {
          return scoreB - scoreA;
        }
      }
    });
    
    setFilteredUsers(result);
  }, [users, filters, searchQuery]);
  
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

  // Deep-link from Black list: expand user + Violations tab.
  // Reset shift filter + search so a filtered list cannot hide the target card.
  useEffect(() => {
    if (!focusUserId) return;
    setFilters((prev) => ({ ...prev, shift: 'all' }));
    setSearchQuery('');
    setExpandedUserId(focusUserId);
    setUserPanel(focusTab === 'violations' ? 'violations' : 'details');
    setFormDirty(false);
    onFocusConsumed?.();
  }, [focusUserId, focusTab, onFocusConsumed]);

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
  }, [expandedUserId, filteredUsers]);
  
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
  
  const closeFilterModal = () => {
    setShowFilterModal(false);
  };
  
  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
  };
  
  // Custom refresh function that preserves filter settings
  const handleRefresh = async () => {
    if (onRefresh) {
      await onRefresh();
    }
  };
  
  // Reset all filters and clear from localStorage
  const handleResetAllFilters = () => {
    const defaultFilters = {
      shift: 'all',
      sortBy: 'name',
      sortOrder: 'asc'
    };
    setFilters(defaultFilters);
    localStorage.removeItem('userListFilters');
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
                  className="admin-icon-btn"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <input
                    ref={confirmInputRef}
                    type="text"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    className="admin-input"
                    placeholder="Type 'delete' to confirm"
                  />
                </div>
              )}
            </div>
            <div className="admin-modal-footer !justify-stretch gap-3">
              <button
          type="button"
          onClick={closeDeleteModal}
                className="admin-btn flex-1"
              >
                Cancel
              </button>
              {confirmationStep === 1 ? (
                <button
            type="button"
                  onClick={handleFirstConfirmation}
                  className="admin-btn-danger flex-1"
                >
                  Continue
                </button>
              ) : (
                <button
            type="button"
                  onClick={handleDeleteUser}
                  disabled={confirmationInput.toLowerCase() !== 'delete'}
                  className="admin-btn-danger flex-1"
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
    : 0;

  return (
    <div>
    <div className="mr-auto flex h-[calc(100dvh-72px-2rem-4.75rem)] w-full max-w-lg flex-col md:h-[calc(100dvh-72px-3rem)] lg:h-[calc(100dvh-72px-4rem)]">
      <div className="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:gap-2 md:flex-nowrap">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="admin-input pl-9"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="button"
          onClick={() => setShowFilterModal(true)}
          className="admin-btn shrink-0"
        >
          Filter
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {filteredUsers.map((user) => {
          const isSelected = expandedUserId === user.id;

          return (
            <button
              key={user.id}
              id={`admin-user-row-${user.id}`}
              type="button"
              onClick={() => requestExpandToggle(user.id)}
              aria-current={isSelected ? 'true' : undefined}
              className={`admin-section-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                isSelected ? 'ring-2 ring-charcoal/20' : ''
              }`}
            >
              <UserAvatar user={user} />
              <span className="min-w-0 truncate text-sm font-semibold text-charcoal">
                {user.first_name || ''} {user.last_name || ''}
              </span>
              {user.last_activity_at && (
                <span className="ml-auto flex-shrink-0 text-xs text-gray-500">
                  {formatDistanceToNow(new Date(user.last_activity_at), { addSuffix: true })}
                </span>
              )}
            </button>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting search or filters.</p>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal (portal) */}
      <Modal isOpen={showDeleteModal} onClose={closeDeleteModal}>
        {deleteModalContent}
      </Modal>
      
      {/* Filter Modal */}
      <FilterModal 
        isOpen={showFilterModal}
        onClose={closeFilterModal}
        filters={filters}
        onApplyFilters={handleApplyFilters}
        onResetAllFilters={handleResetAllFilters}
      />
      
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
    {selectedUser && createPortal(
      <div
        className="fixed right-0 top-[72px] z-[60] flex h-[calc(100dvh-72px)] w-full flex-col border-l border-gray-200 bg-white shadow-xl lg:left-[calc(5rem+2rem+32rem+0.75rem)] lg:w-auto"
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
              className="admin-input !w-auto shrink-0 disabled:opacity-60"
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

        <div className="flex gap-5 border-b border-gray-200 px-5">
          <button
            type="button"
            onClick={() => requestPanelChange('details')}
            className={`inline-flex items-center border-b-2 -mb-px py-2.5 text-sm font-medium ${
              userPanel === 'details' ? 'border-charcoal text-charcoal' : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => requestPanelChange('violations')}
            className={`inline-flex items-center border-b-2 -mb-px py-2.5 text-sm font-medium ${
              userPanel === 'violations' ? 'border-charcoal text-charcoal' : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            Violations
            {typeof selectedViolationCount === 'number' && selectedViolationCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gray-200 px-1 text-[10px] font-bold text-charcoal">
                {selectedViolationCount}
              </span>
            )}
          </button>
        </div>

        <div className={`border-b border-gray-200 px-5 py-3 ${userPanel === 'details' ? '' : 'hidden'}`}>
          <div id="admin-user-visibility-slot" className="flex items-center" />
        </div>

        <div className={`min-h-0 flex-1 ${userPanel === 'violations' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          <div className={userPanel === 'details' ? 'px-5 py-5' : 'hidden'}>
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
            <UserViolationsPanel
              userId={selectedUser.id}
              users={users}
              onCountChange={(count) => {
                setViolationCountByUser((prev) => ({ ...prev, [selectedUser.id]: count }));
              }}
            />
          )}
        </div>

        {userPanel === 'details' && (
          <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
            <button
              type="button"
              onClick={() => openDeleteModal(selectedUser)}
              disabled={processingUser === selectedUser.id}
              className="admin-btn-danger"
            >
              {processingUser === selectedUser.id ? 'Deleting…' : 'Delete user'}
            </button>
            <button type="submit" form="user-edit-inline-form" className="admin-btn">
              Save changes
            </button>
          </div>
        )}
      </div>,
      document.body
    )}
    </div>
  );
}

UserList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
  focusUserId: PropTypes.string,
  focusTab: PropTypes.oneOf(['details', 'violations']),
  onFocusConsumed: PropTypes.func,
};