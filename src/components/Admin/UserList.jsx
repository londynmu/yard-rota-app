import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import UserEditForm from './UserEditForm';

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
      className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center"
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
        className="bg-black/70 backdrop-blur-xl rounded-xl shadow-2xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto border-2 border-white/30"
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
      <div className="bg-gradient-to-r from-blue-900/80 to-purple-900/80 px-6 py-4 border-b border-white/20 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-bold text-white drop-shadow-md">
                Filter & Sort Users
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-white/70 transition-colors"
            aria-label="Close"
          >
            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="px-6 py-4">
        {/* Shift Filter */}
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">Filter by Shift</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              shiftFilter === 'all' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
            
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              shiftFilter === 'day' 
              ? 'bg-yellow-500/40 border-yellow-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
            
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              shiftFilter === 'afternoon' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
            
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              shiftFilter === 'night' 
              ? 'bg-indigo-500/40 border-indigo-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">Sort By</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              sortBy === 'name' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
            
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              sortBy === 'score' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">Sort Order</h4>
          <div className="grid grid-cols-2 gap-2">
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              sortOrder === 'asc' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
            
            <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
              sortOrder === 'desc' 
              ? 'bg-blue-500/40 border-blue-400/50 text-white' 
              : 'border-white/20 hover:bg-white/5 text-white/80'
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
      
      <div className="bg-black/40 px-6 py-4 flex justify-between border-t border-white/20">
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/30 rounded-lg font-medium text-white hover:bg-white/20 focus:outline-none transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleApplyFilters}
          className="px-4 py-2 bg-blue-500/40 backdrop-blur-xl border border-blue-400/40 rounded-lg font-medium text-white hover:bg-blue-500/60 focus:outline-none transition-colors"
        >
          Apply Filters
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
  
  // Filtered and sorted users
  const [filteredUsers, setFilteredUsers] = useState([]);
  
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
  }, [users, filters]);
  
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
      
      // Simplified: Always delete from profiles
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userToDelete.id);
        
      if (error) {
        throw error;
      }
      
      // Refresh the user list
      if (onRefresh) {
        console.log('Refreshing user list after delete');
        onRefresh();
      }
      
    } catch (error) {
      console.error('Error deleting user:', error);
      setError(`Failed to delete user: ${error.message}`);
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
  
  // Get background color based on performance score
  const getScoreBackgroundColor = (score) => {
    if (!score) return 'rgba(75, 85, 99, 0.6)'; // Default gray for no score
    
    // Create a rainbow gradient effect based on score
    if (score >= 90) return 'rgba(16, 185, 129, 0.7)'; // Emerald green (90-99)
    if (score >= 80) return 'rgba(52, 211, 153, 0.7)'; // Light green (80-89)
    if (score >= 70) return 'rgba(167, 243, 208, 0.8)'; // Mint green (70-79)
    if (score >= 60) return 'rgba(250, 204, 21, 0.7)'; // Yellow (60-69)
    if (score >= 50) return 'rgba(251, 146, 60, 0.7)'; // Orange (50-59)
    if (score >= 40) return 'rgba(251, 113, 133, 0.7)'; // Pink/salmon (40-49)
    if (score >= 30) return 'rgba(244, 63, 94, 0.7)'; // Rose/light red (30-39)
    if (score >= 20) return 'rgba(225, 29, 72, 0.7)'; // Medium red (20-29)
    return 'rgba(185, 28, 28, 0.7)'; // Dark red (1-19)
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
            <div className="bg-gradient-to-r from-red-900/80 to-red-600/80 px-6 py-4 border-b border-white/20 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-bold text-white drop-shadow-md">
                      Delete Confirmation
                    </h3>
                  </div>
                </div>
                <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeDeleteModal();
            }}
                  className="text-white hover:text-white/70 transition-colors"
                  aria-label="Close"
                >
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-6 py-4">
              {confirmationStep === 1 ? (
                <div>
                  <p className="text-white mb-4">
                    Are you sure you want to delete this user?
                  </p>
                  <p className="text-white font-medium text-lg">
                    {userToDelete?.first_name} {userToDelete?.last_name}
                  </p>
                  <div className="bg-red-500/30 backdrop-blur-xl border-l-4 border-red-400/70 text-red-100 p-4 mb-4 rounded-r-md shadow-md">
                    <p className="font-medium">Warning</p>
                    <p className="text-sm">This action cannot be undone. All user data will be permanently removed.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-white mb-4">
                    <span className="font-medium">Final confirmation required.</span> Please type <span className="font-bold text-red-300">delete</span> to confirm:
                  </p>
                  <input
                    ref={confirmInputRef}
                    type="text"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 backdrop-blur-xl border border-white/30 rounded-lg focus:outline-none focus:border-white/50 focus:ring-2 focus:ring-white/20 mb-4 text-white"
                    placeholder="Type 'delete' to confirm"
                  />
                </div>
              )}
            </div>
            <div className="bg-black/40 px-6 py-4 flex justify-between border-t border-white/20">
              <button
          type="button"
          onClick={closeDeleteModal}
                className="px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/30 rounded-lg font-medium text-white hover:bg-white/20 focus:outline-none transition-colors"
              >
                Cancel
              </button>
              {confirmationStep === 1 ? (
                <button
            type="button"
                  onClick={handleFirstConfirmation}
                  className="px-4 py-2 bg-red-500/40 backdrop-blur-xl border border-red-400/40 rounded-lg font-medium text-white hover:bg-red-500/60 focus:outline-none transition-colors"
                >
                  Continue
                </button>
              ) : (
                <button
            type="button"
                  onClick={handleDeleteUser}
                  disabled={confirmationInput.toLowerCase() !== 'delete'}
                  className={`px-4 py-2 border rounded-lg font-medium text-white focus:outline-none transition-colors ${
                    confirmationInput.toLowerCase() === 'delete'
                      ? 'bg-red-500/50 hover:bg-red-500/70 border-red-400/50'
                      : 'bg-gray-500/30 border-white/10 cursor-not-allowed'
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white drop-shadow-md">User Management</h1>
        <div className="flex space-x-2">
          <button
            onClick={openFilterModal}
            className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-md text-white hover:bg-white/20 transition-colors flex items-center shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            Filter & Sort
          </button>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-md text-white hover:bg-white/20 transition-colors shadow-lg"
            aria-label="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mb-4 flex justify-between items-center">
        <div className="text-white/80 text-sm">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} {filters.shift !== 'all' ? `(${filters.shift} shift)` : ''}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-gradient-to-r from-blue-900/80 to-purple-900/80 backdrop-blur-xl sticky top-0 z-10 shadow-md">
            <tr>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Team Member</th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Shift</th>
              <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Score</th>
              <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-black/30 backdrop-blur-md">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-white/10 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      {user.avatar_url ? (
                        <img className="h-10 w-10 rounded-full border-2 border-white/30 shadow-md" src={user.avatar_url} alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center border-2 border-white/30 shadow-md">
                          <span className="text-white font-medium">
                            {user.first_name?.charAt(0) || '?'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-white">
                        {user.first_name || ''} {user.last_name || ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border 
                    ${user.shift_preference === 'day' ? 'bg-yellow-500/40 text-yellow-100 border-yellow-400/40' : 
                    user.shift_preference === 'afternoon' ? 'bg-blue-500/40 text-blue-100 border-blue-400/40' : 
                    user.shift_preference === 'night' ? 'bg-indigo-500/40 text-indigo-100 border-indigo-400/40' : 
                    'bg-white/10 text-white border-white/30'}`}>
                    {user.shift_preference || 'Not set'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <span 
                    className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border
                      ${user.is_active === false ? 'bg-red-500/40 text-red-100 border-red-400/40' : 
                      'bg-green-500/40 text-green-100 border-green-400/40'}`}
                  >
                    {user.is_active === false ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <div 
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-bold w-14 h-14" 
                    style={{
                      background: `radial-gradient(circle, ${getScoreBackgroundColor(user.performance_score)} 70%, rgba(0, 0, 0, 0.3) 100%)`,
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2), inset 0 0 10px rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <div className="text-white text-base font-bold">
                      {user.performance_score || '–'}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                  <button 
                    type="button"
                    className="px-3 py-1 bg-blue-500/40 backdrop-blur-md border border-blue-400/40 rounded-lg text-white hover:bg-blue-500/60 transition-colors mr-2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openEditModal(user);
                    }}
                  >
                    Edit
                  </button>
                  <button 
                    type="button"
                    className="px-3 py-1 bg-red-500/40 backdrop-blur-md border border-red-400/40 rounded-lg text-white hover:bg-red-500/60 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDeleteModal(user);
                    }}
                    disabled={processingUser === user.id}
                  >
                    {processingUser === user.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </>
  );
}

// Add propTypes for UserList
UserList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
};