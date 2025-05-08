import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../lib/supabaseClient';
import { createPortal } from 'react-dom';

const SlotCard = ({ 
  slot, 
  handleOpenAssignModal, 
  handleDeleteSlot, 
  handleOpenEditModal,
  isAdmin 
}) => {
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(slot.status === 'available');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Check if slot has assigned employees array
  const assignedCount = slot.assigned_employees ? slot.assigned_employees.length : 0;
  const fillPercentage = (assignedCount / slot.capacity) * 100;
  const isSlotFull = assignedCount >= slot.capacity;
  
  useEffect(() => {
    const fetchUsers = async () => {
      if (!slot.assigned_employees || slot.assigned_employees.length === 0) {
        setAssignedUsers([]);
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', slot.assigned_employees);
          
        if (error) throw error;
        setAssignedUsers(data || []);
      } catch (err) {
        console.error('Error fetching assigned users:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, [slot.assigned_employees]);

  // Update isAvailable when slot status changes
  useEffect(() => {
    console.log(`[SlotCard ${slot.id}] slot.status changed:`, slot.status);
    setIsAvailable(slot.status === 'available');
  }, [slot.status]);
  
  // Log slot status changes
  useEffect(() => {
    console.log(`[SlotCard ${slot.id}] Current status: slot.status=${slot.status}, isAvailable=${isAvailable}`);
  }, [slot.status, isAvailable, slot.id]);

  const formatTime = (timeString) => {
    return timeString.substring(0, 5); // HH:MM format
  };

  // Funkcja określająca kolor bocznego znacznika w zależności od typu zmiany
  const getShiftIndicatorColor = (shiftType) => {
    switch(shiftType) {
      case 'day':
        return 'bg-blue-700/40';
      case 'afternoon':
        return 'bg-indigo-700/40';
      case 'night':
        return 'bg-slate-600/40';
      default:
        return 'bg-gray-600/40';
    }
  };

  // Determine border color based on slot fullness
  const getBorderColor = () => {
    if (isSlotFull) {
      return 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]';
    } else if (fillPercentage === 0) {
      return 'border-red-500/70 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse-red';
    } else {
      return 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)] animate-pulse-yellow';
    }
  };

  // Get status text and color for the status badge
  const getStatusInfo = () => {
    if (isSlotFull) {
      return { text: 'Full', bgColor: 'bg-green-500/30', textColor: 'text-green-200' };
    } else if (fillPercentage === 0) {
      return { text: 'Empty', bgColor: 'bg-red-500/30', textColor: 'text-red-200' };
    } else {
      return { text: 'Partial', bgColor: 'bg-yellow-500/30', textColor: 'text-yellow-200' };
    }
  };

  const statusInfo = getStatusInfo();

  // Delete confirmation dialog
  const DeleteConfirmationModal = () => {
    if (!showDeleteConfirm) return null;
    
    const modalContent = (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-5 w-full max-w-md animate-fade-scale">
          <h3 className="text-xl font-bold text-white mb-3">Confirm Delete</h3>
          <p className="text-white/90 mb-5">
            Are you sure you want to delete this slot?
            {assignedCount > 0 && (
              <span className="block mt-2 text-red-300 font-medium">
                This slot has {assignedCount} assigned employee{assignedCount !== 1 ? 's' : ''}.
              </span>
            )}
          </p>
          <div className="flex space-x-3 justify-end">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                handleDeleteSlot(slot.id);
                setShowDeleteConfirm(false);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
    return createPortal(modalContent, document.body);
  };

  return (
    <div
      onClick={() => handleOpenAssignModal(slot)}
      className={`bg-gradient-to-r from-slate-900/80 to-slate-800/80 backdrop-blur-sm hover:from-slate-800/90 hover:to-slate-700/90 rounded-lg p-4 ${getBorderColor()} shadow-xl cursor-pointer transition group relative overflow-hidden`}
    >
      {/* Delete confirmation modal */}
      <DeleteConfirmationModal />
      
      {/* Status badge in top right corner */}
      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${statusInfo.bgColor} ${statusInfo.textColor} border border-slate-700/40`}>
        {statusInfo.text}
      </div>

      {/* Pionowy pasek oznaczający typ zmiany */}
      <div className={`absolute top-0 left-0 w-1.5 h-full ${getShiftIndicatorColor(slot.shift_type)}`}></div>
      
      {/* Pasek wypełnienia */}
      <div className={`absolute top-0 left-0 h-1.5 ${isSlotFull ? 'bg-green-500/70' : fillPercentage === 0 ? 'bg-red-500/70' : 'bg-yellow-500/70'}`} style={{ width: `${fillPercentage}%` }}></div>
      
      <div className="flex justify-between items-start mb-3 pl-2">
        <div>
          <h3 className="text-white font-bold">{slot.location}</h3>
          <div className="flex items-center mt-1">
            <div className="bg-slate-800/70 border border-slate-600/30 text-white px-3 py-1.5 rounded-md text-sm font-medium">
              {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between pl-2">
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {/* Shift type and capacity icons */}
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-800/80 text-slate-200 border border-slate-600/30">
            {slot.shift_type.charAt(0).toUpperCase() + slot.shift_type.slice(1)}
          </span>
          
          <div className={`text-xs ${isSlotFull ? 'bg-green-900/50 border-green-600/50' : fillPercentage === 0 ? 'bg-red-900/50 border-red-600/50' : 'bg-yellow-900/50 border-yellow-600/50'} text-white border px-2 py-0.5 rounded-full`}>
            <span className="font-medium">{assignedCount}</span>
            <span className="mx-1">/</span>
            <span>{slot.capacity}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Action buttons - only show if user is admin */}
          {isAdmin && (
            <div className="opacity-100 flex space-x-1 transition-opacity duration-200">
              {/* Edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[SlotCard] Edit button clicked, slot data:', slot);
                  console.log('[SlotCard] typeof handleOpenEditModal:', typeof handleOpenEditModal, handleOpenEditModal);
                  if (typeof handleOpenEditModal === 'function') {
                    handleOpenEditModal(slot);
                  } else {
                    console.error('[SlotCard] handleOpenEditModal is NOT a function!');
                  }
                }}
                className="p-1 rounded-full bg-slate-700/50 text-slate-300 hover:bg-slate-600/60"
                title="Edit shift"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              
              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="p-1 rounded-full bg-slate-800/50 text-red-300/80 hover:bg-slate-700/60"
                title="Delete shift"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Assigned employees section */}
      <div className="mt-3 pl-2">
        <div className="flex flex-col space-y-2">
          {loading ? (
            <div className="animate-pulse bg-slate-700/40 h-6 rounded"></div>
          ) : assignedUsers.length > 0 ? (
            assignedUsers.map(user => (
              <div key={user.id} className="flex items-center space-x-2 py-1 px-2 rounded bg-slate-800/40 border border-slate-700/30">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                )}
                <span className="text-sm text-white">{user.first_name} {user.last_name}</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-red-300 font-medium bg-red-500/10 border border-red-600/20 rounded py-1.5 px-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              No employees assigned
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

SlotCard.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    shift_type: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    capacity: PropTypes.number.isRequired,
    assigned_employees: PropTypes.array.isRequired,
    status: PropTypes.string
  }).isRequired,
  handleOpenAssignModal: PropTypes.func.isRequired,
  handleDeleteSlot: PropTypes.func.isRequired,
  handleOpenEditModal: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired
};

export default SlotCard; 