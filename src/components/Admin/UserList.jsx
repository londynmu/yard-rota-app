import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import UserEditForm from './UserEditForm';
import AddViolationModal from './AddViolationModal';
import { formatDistanceToNow } from 'date-fns';

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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto border border-gray-100"
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
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-charcoal">
            Filter and sort
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div className="px-5 py-4">
        {/* Shift Filter */}
        <div className="mb-5">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Filter by Shift</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'all' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'day' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'afternoon' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'night' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              sortBy === 'name' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              sortBy === 'score' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              sortOrder === 'asc' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
            
            <label className={`flex items-center justify-center py-2 px-3 border-2 rounded-lg cursor-pointer transition-colors text-sm ${
              sortOrder === 'desc' 
              ? 'border-charcoal bg-white text-charcoal' 
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}>
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
      
      <div className="bg-white px-5 py-3 flex justify-between gap-3 border-t border-gray-200">
        <button
          type="button"
          onClick={handleReset}
          className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApplyFilters}
          className="flex-1 px-4 py-2 text-sm rounded-lg border-2 border-charcoal bg-white text-charcoal hover:bg-gray-50 transition-colors"
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

export default function UserList({ users, onRefresh }) {
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
  
  // Add violation modal (from UserList)
  const [addViolationOpen, setAddViolationOpen] = useState(false);
  const [addViolationUserId, setAddViolationUserId] = useState(null);
  // Expanded user card (one at a time, like VMU)
  const [expandedUserId, setExpandedUserId] = useState(null);
  
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

      // If user has an avatar, delete it from storage
      if (userData?.avatar_url) {
        const avatarPath = userData.avatar_url.split('/').slice(-2).join('/'); // Get 'avatars/filename.ext'
        const { error: storageError } = await supabase.storage
          .from('avatars')
          .remove([avatarPath]);

        if (storageError) {
          console.error('Error deleting avatar:', storageError);
          // Continue with user deletion even if avatar deletion fails
        }
      }
      
      // Delete user's notifications first (to avoid foreign key constraint)
      const { error: notificationsError } = await supabase
        .from('notifications')
        .delete()
        .eq('recipient_id', userToDelete.id);
        
      if (notificationsError) {
        console.error('Error deleting notifications:', notificationsError);
        // Continue with user deletion even if notification deletion fails
      }
      
      // Delete from profiles table - this will cascade to other tables due to foreign key constraints
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userToDelete.id);
        
      if (profileError) {
        throw profileError;
      }

      // Deactivate the user in auth.users (we can't delete directly, but we can deactivate)
      const { error: deactivateError } = await supabase.auth.updateUser({
        data: { 
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: 'admin'
        }
      });

      if (deactivateError) {
        throw deactivateError;
      }
      
      // Refresh the user list
      if (onRefresh) {
        onRefresh();
      }
      
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(`Failed to delete user: ${error.message}`);
      
      // Reopen the modal if there was an error
      setShowDeleteModal(true);
    } finally {
      setProcessingUser(null);
    }
  };
  
  const openFilterModal = () => {
    setShowFilterModal(true);
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
  
  const openInfoModal = async (user) => {
    setInfoUser(user);
    setInfoModalOpen(true);
    try {
      const { data, error } = await supabase.rpc('get_user_last_login', { uid: user.id });
      if (error) throw error;
      setLastLogin(data);
    } catch (err) {
      console.error('Error fetching last login:', err);
      setLastLogin(null);
    }
  };

  const closeInfoModal = () => {
    setInfoModalOpen(false);
    setInfoUser(null);
    setLastLogin(null);
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
            <div className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-red-800">
                    Delete user
                  </h3>
                </div>
                <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeDeleteModal();
            }}
                  className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
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
                    <p className="text-xs mt-1">This action cannot be undone. All user data will be permanently removed.</p>
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
                    className="w-full px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-charcoal focus:ring-2 focus:ring-charcoal/20 text-gray-900 text-sm"
                    placeholder="Type 'delete' to confirm"
                  />
                </div>
              )}
            </div>
            <div className="bg-white px-5 py-3 flex gap-3 border-t border-gray-200">
              <button
          type="button"
          onClick={closeDeleteModal}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {confirmationStep === 1 ? (
                <button
            type="button"
                  onClick={handleFirstConfirmation}
                  className="flex-1 px-4 py-2 text-sm rounded-lg border-2 border-red-500 bg-white text-red-600 hover:bg-red-50 transition-colors font-medium"
                >
                  Continue
                </button>
              ) : (
                <button
            type="button"
                  onClick={handleDeleteUser}
                  disabled={confirmationInput.toLowerCase() !== 'delete'}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg font-medium focus:outline-none transition-colors border-2 ${
                    confirmationInput.toLowerCase() === 'delete'
                      ? 'border-red-500 bg-white text-red-600 hover:bg-red-50'
                      : 'border-gray-200 bg-white text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Delete User
                </button>
              )}
            </div>
    </>
  );
  
  return (
    <>
      {/* Search – at the very top, no container */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2 md:flex-nowrap mb-4">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 md:py-1.5 text-sm border border-gray-200 rounded-xl md:rounded-lg bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
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
      </div>

      {/* One card per user – colored like VMU, expandable */}
      <div className="space-y-3">
        {filteredUsers.map((user) => {
          const isExpanded = expandedUserId === user.id;
          const isActive = user.is_active !== false;
          const cardStyle = isActive
            ? 'border border-green-200 bg-green-50/50'
            : 'border border-amber-200 bg-amber-50/50';
          const headerStyle = isActive
            ? 'bg-green-50 hover:bg-green-100/80'
            : 'bg-amber-50 hover:bg-amber-100/80';

          return (
            <div
              key={user.id}
              className={`rounded-xl overflow-hidden shadow-sm transition-shadow ${cardStyle} ${isExpanded ? 'shadow-md' : ''}`}
            >
              {/* Clickable header – toggles expand */}
              <button
                type="button"
                onClick={() => setExpandedUserId(prev => (prev === user.id ? null : user.id))}
                className={`w-full px-4 py-3 text-left flex items-center gap-3 ${headerStyle} transition-opacity`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 h-10 w-10 relative">
                  {user.avatar_url ? (
                    <img className="h-10 w-10 rounded-full object-cover" src={user.avatar_url} alt="" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-white/80 flex items-center justify-center">
                      <span className="text-charcoal text-sm font-semibold">
                        {user.first_name?.charAt(0) || '?'}
                      </span>
                    </div>
                  )}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${user.is_active === false ? 'bg-gray-300' : 'bg-green-500'}`} />
                </div>

                {/* Name */}
                <span className="text-charcoal font-semibold text-sm truncate">
                  {user.first_name || ''} {user.last_name || ''}
                </span>
                {user.last_activity_at && (
                  <span className="text-gray-500 text-xs ml-auto flex-shrink-0">
                    {formatDistanceToNow(new Date(user.last_activity_at), { addSuffix: true })}
                  </span>
                )}
              </button>

              {/* Expanded content – same fields as Edit form (inline) + actions */}
              {isExpanded && (
                <>
                  <div className="border-t border-gray-200 bg-white">
                    <UserEditForm
                      user={user}
                      inline
                      onClose={() => setExpandedUserId(null)}
                      onSuccess={(updates) => {
                        handleRefresh();
                        if (updates && updates.id === user.id) setExpandedUserId(null);
                      }}
                    />
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 flex flex-nowrap gap-2 sm:gap-3 items-stretch w-full md:justify-end md:items-center">
                    <button
                      type="submit"
                      form="user-edit-inline-form"
                      className="flex-1 min-w-0 md:flex-none px-2 py-2.5 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-lg border-2 border-charcoal bg-white text-charcoal hover:bg-gray-50 transition-colors text-center"
                    >
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddViolationUserId(user.id); setAddViolationOpen(true); }}
                      className="flex-1 min-w-0 md:flex-none px-2 py-2.5 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-lg border-2 border-gray-300 bg-white text-charcoal hover:bg-gray-50 transition-colors text-center"
                    >
                      Add violation
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(user)}
                      disabled={processingUser === user.id}
                      className="flex-1 min-w-0 md:flex-none px-2 py-2.5 sm:px-3 sm:py-1.5 text-xs font-semibold rounded-lg border-2 border-red-500 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 text-center"
                    >
                      {processingUser === user.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
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
            <div className="bg-red-50 px-5 py-4 border-b border-red-200/60">
              <h3 className="text-lg font-semibold text-red-800">User information</h3>
            </div>
            <div className="px-5 py-5">
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
                <button onClick={closeInfoModal} className="px-5 py-2.5 rounded-lg border-2 border-charcoal bg-white text-charcoal font-semibold hover:bg-gray-50 transition-colors">Close</button>
              </div>
            </div>
        </Modal>
      )}
      
      <AddViolationModal
        open={addViolationOpen}
        onClose={() => {
          setAddViolationOpen(false);
          setAddViolationUserId(null);
        }}
        initialUserId={addViolationUserId}
        users={users}
      />
    </>
  );
}

// Add propTypes for UserList
UserList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
};