import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import UserEditForm from './UserEditForm';
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
          <h3 className="text-lg font-semibold text-gray-900">
            Filter & Sort
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
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'all' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'day' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'afternoon' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              shiftFilter === 'night' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              sortBy === 'name' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              sortBy === 'score' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              sortOrder === 'asc' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
            
            <label className={`flex items-center justify-center py-2 px-3 border rounded-lg cursor-pointer transition-colors text-sm ${
              sortOrder === 'desc' 
              ? 'bg-charcoal text-white border-charcoal' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
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
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-charcoal text-white hover:bg-charcoal/90 transition-colors"
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
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
  
  // Bottom sheet state for mobile user selection
  const [selectedUser, setSelectedUser] = useState(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [bottomSheetLastLogin, setBottomSheetLastLogin] = useState(null);
  const [loadingLastLogin, setLoadingLastLogin] = useState(false);
  
  // Desktop dropdown menu state
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const dropdownRef = useRef(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
      }
    };
    
    if (openDropdownId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownId]);
  
  // Log when users data changes
  useEffect(() => {
    console.log('UserList received updated users data:', users);
  }, [users]);
  
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
        const email = (user.email || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        
        return firstName.includes(query) || 
               lastName.includes(query) || 
               fullName.includes(query) ||
               email.includes(query);
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
  
  const openEditModal = (user) => {
    setUserToEdit(user);
    setShowEditModal(true);
  };
  
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
  };
  
  const closeEditModal = () => {
    setShowEditModal(false);
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
        console.log('Refreshing user list after delete');
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
      console.log('Refreshing user list while preserving filters');
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
  
  // Bottom sheet handlers
  const openBottomSheet = async (user) => {
    setSelectedUser(user);
    setShowBottomSheet(true);
    setLoadingLastLogin(true);
    try {
      const { data, error } = await supabase.rpc('get_user_last_login', { uid: user.id });
      if (error) throw error;
      setBottomSheetLastLogin(data);
    } catch (err) {
      console.error('Error fetching last login:', err);
      setBottomSheetLastLogin(null);
    } finally {
      setLoadingLastLogin(false);
    }
  };
  
  const closeBottomSheet = () => {
    setShowBottomSheet(false);
    setSelectedUser(null);
    setBottomSheetLastLogin(null);
  };
  
  // Handle actions from bottom sheet
  const handleBottomSheetInfo = () => {
    if (selectedUser) {
      closeBottomSheet();
      openInfoModal(selectedUser);
    }
  };
  
  const handleBottomSheetEdit = () => {
    if (selectedUser) {
      closeBottomSheet();
      openEditModal(selectedUser);
    }
  };
  
  const handleBottomSheetDelete = () => {
    if (selectedUser) {
      closeBottomSheet();
      openDeleteModal(selectedUser);
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
            <div className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Delete User
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
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  Continue
                </button>
              ) : (
                <button
            type="button"
                  onClick={handleDeleteUser}
                  disabled={confirmationInput.toLowerCase() !== 'delete'}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg font-medium focus:outline-none transition-colors ${
                    confirmationInput.toLowerCase() === 'delete'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal text-gray-900 placeholder-gray-400"
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
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="text-gray-600 text-sm whitespace-nowrap">
            {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} {filters.shift !== 'all' ? `(${filters.shift} shift)` : ''}
          </div>
          <button
            onClick={openFilterModal}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Filter & Sort
          </button>
        </div>
      </div>

      {/* Mobile list view (visible on small screens) - Clean minimal style */}
      <div className="md:hidden bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredUsers.map((user, index) => (
          <button
            key={user.id}
            type="button"
            onClick={() => openBottomSheet(user)}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
              index !== filteredUsers.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            {/* Avatar with status dot */}
            <div className="flex-shrink-0 h-10 w-10 relative">
              {user.avatar_url ? (
                <img className="h-10 w-10 rounded-full object-cover" src={user.avatar_url} alt="" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-charcoal text-sm font-semibold">
                    {user.first_name?.charAt(0) || '?'}
                  </span>
                </div>
              )}
              {/* Status dot */}
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${user.is_active === false ? 'bg-gray-300' : 'bg-green-500'}`}></div>
            </div>
            
            {/* Name only */}
            <div className="flex-1 min-w-0">
              <span className="text-charcoal font-semibold text-[15px] truncate block">
                {user.first_name || ''} {user.last_name || ''}
              </span>
            </div>
            
            {/* Chevron */}
            <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
        
        {filteredUsers.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500">
            No users found
          </div>
        )}
      </div>

      {/* Desktop list view (hidden on small screens) - Table style with columns */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div className="w-10"></div>
          <div className="w-44">Name</div>
          <div className="w-24">Shift</div>
          <div className="w-28">Agency</div>
          <div className="hidden lg:block w-20">Start</div>
          <div className="hidden xl:block w-24">Location</div>
          <div className="w-16 text-center">Score</div>
          <div className="flex-1"></div>
      </div>

        {/* Data rows */}
        {filteredUsers.map((user, index) => (
          <div
            key={user.id}
            className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors ${
              index !== filteredUsers.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            {/* Avatar */}
            <div className="w-10 flex-shrink-0 relative">
                {user.avatar_url ? (
                <img className="h-10 w-10 rounded-full object-cover" src={user.avatar_url} alt="" />
                ) : (
                <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <span className="text-charcoal text-sm font-semibold">
                      {user.first_name?.charAt(0) || '?'}
                    </span>
                  </div>
                )}
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${user.is_active === false ? 'bg-gray-300' : 'bg-green-500'}`}></div>
              </div>
            
            {/* Name */}
            <div className="w-44 min-w-0">
              <span className="text-charcoal font-semibold text-sm truncate block">
                  {user.first_name || ''} {user.last_name || ''}
              </span>
                </div>
            
            {/* Shift */}
            <div className="w-24">
              {getShiftBadge(user.shift_preference) ? (
                <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold ${getShiftBadge(user.shift_preference).className}`}>
                  {getShiftBadge(user.shift_preference).label}
                </span>
              ) : (
                <span className="text-gray-300 text-sm">–</span>
                  )}
                </div>
            
            {/* Agency */}
            <div className="w-28">
              {user.agency_name ? (
                <span className="inline-block px-2 py-0.5 text-[10px] font-medium text-gray-500 border border-gray-300 rounded-full">
                  {user.agency_name}
                </span>
              ) : (
                <span className="text-gray-300 text-sm">–</span>
              )}
              </div>
            
            {/* Start Time - visible on lg+ */}
            <div className="hidden lg:block w-20">
              {user.custom_start_time ? (
                <span className="text-gray-600 text-sm">{user.custom_start_time.slice(0, 5)}</span>
              ) : (
                <span className="text-gray-300 text-sm">–</span>
              )}
            </div>
            
            {/* Location - visible on xl+ */}
            <div className="hidden xl:block w-24">
              {user.preferred_location ? (
                <span className="text-gray-600 text-sm truncate block">{user.preferred_location}</span>
              ) : (
                <span className="text-gray-300 text-sm">–</span>
              )}
            </div>
            
            {/* Score */}
            <div className="w-16 text-center">
              <span className="inline-block px-3 py-1 bg-gray-100 rounded-md text-charcoal text-sm font-bold">
                  {user.performance_score || '–'}
              </span>
            </div>
            
            {/* Actions */}
            <div className="flex-1 flex items-center justify-end gap-2">
              <button 
                type="button"
                onClick={() => openEditModal(user)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-charcoal text-white hover:bg-black transition-colors"
              >
                Edit
              </button>
              
              {/* Dropdown menu */}
              <div className="relative" ref={openDropdownId === user.id ? dropdownRef : null}>
              <button 
                type="button"
                  onClick={() => setOpenDropdownId(openDropdownId === user.id ? null : user.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
                
                {/* Dropdown content */}
                {openDropdownId === user.id && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDropdownId(null);
                        openInfoModal(user);
                }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Info
              </button>
              <button 
                type="button"
                      onClick={() => {
                        setOpenDropdownId(null);
                  openDeleteModal(user);
                }}
                disabled={processingUser === user.id}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {processingUser === user.id ? 'Deleting...' : 'Delete'}
              </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {filteredUsers.length === 0 && (
          <div className="px-5 py-8 text-center text-gray-500">
            No users found
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
      
      {/* Edit User Modal */}
      {showEditModal && userToEdit && (
        createPortal(
        <UserEditForm 
          user={userToEdit} 
          onClose={closeEditModal} 
            onSuccess={(updatedUser) => {
              console.log('User updated successfully:', updatedUser);
              
              // Use our custom refresh function to preserve filters
              handleRefresh();
              
              // Close the modal
            closeEditModal();
          }} 
          />,
          document.body
        )
      )}

      {/* Info Modal */}
      {infoModalOpen && (
        <Modal isOpen={infoModalOpen} onClose={closeInfoModal}>
            <div className="bg-black px-5 py-4 border-b border-gray-900">
              <h3 className="text-lg font-bold text-white">User Information</h3>
            </div>
            <div className="px-5 py-5">
              {infoUser && (
                <div className="space-y-3">
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Name:</span>
                    <span className="text-charcoal font-medium">{infoUser.first_name} {infoUser.last_name}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-semibold text-gray-600 w-24 text-sm">Email:</span>
                    <span className="text-charcoal">{infoUser.email}</span>
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
                <button onClick={closeInfoModal} className="px-5 py-2.5 rounded-lg bg-black text-white font-semibold hover:bg-gray-900 transition-colors">Close</button>
              </div>
            </div>
        </Modal>
      )}
      
      {/* Mobile Bottom Sheet for user actions */}
      <BottomSheet isOpen={showBottomSheet} onClose={closeBottomSheet}>
        {selectedUser && (
          <div className="px-5 pb-8">
            {/* User Header - Centered */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-20 w-20 relative mb-3">
                {selectedUser.avatar_url ? (
                  <img className="h-20 w-20 rounded-full object-cover" src={selectedUser.avatar_url} alt="" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-charcoal text-2xl font-semibold">
                      {selectedUser.first_name?.charAt(0) || '?'}
                    </span>
                  </div>
                )}
                <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-white ${selectedUser.is_active === false ? 'bg-gray-300' : 'bg-green-500'}`}></div>
              </div>
              {/* Show in one line if short, two lines if long */}
              {((selectedUser.first_name || '').length + (selectedUser.last_name || '').length) <= 20 ? (
                <div className="text-charcoal font-bold text-2xl">
                  {selectedUser.first_name || ''} {selectedUser.last_name || ''}
                </div>
              ) : (
                <>
                  <div className="text-charcoal font-bold text-2xl">
                    {selectedUser.first_name || ''}
                  </div>
                  <div className="text-charcoal font-bold text-2xl">
                    {selectedUser.last_name || ''}
                  </div>
                </>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleBottomSheetEdit}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-base font-medium bg-charcoal text-white hover:bg-black transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit User
              </button>
              
              <button
                type="button"
                onClick={handleBottomSheetDelete}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-base font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete User
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

// Add propTypes for UserList
UserList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
};