import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../lib/supabaseClient';

const SlotCard = ({ 
  slot, 
  handleOpenAssignModal, 
  handleDeleteSlot, 
  handleOpenEditModal,
  handleToggleSlotAvailability,
  isAdmin 
}) => {
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(slot.status === 'available');
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  
  // Check if slot has assigned employees array
  const assignedCount = slot.assigned_employees ? slot.assigned_employees.length : 0;
  const fillPercentage = (assignedCount / slot.capacity) * 100;
  
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

  // Handle toggling slot availability
  const toggleAvailability = async (e) => {
    e.stopPropagation();
    
    if (isTogglingAvailability) {
      console.log('[SlotCard] Already processing a toggle request, ignoring');
      return;
    }
    
    console.log('[SlotCard] Toggle availability clicked, current status:', isAvailable);
    console.log('[SlotCard] Slot data:', slot);
    
    setIsTogglingAvailability(true);
    
    try {
      // Call function from RotaManager.jsx
      await handleToggleSlotAvailability(slot.id, !isAvailable);
      
      // Let parent component update the slot status
      // We don't update local state here because the slot prop will be updated
      // and trigger the useEffect for slot.status changes
      console.log('[SlotCard] Availability toggle successful');
    } catch (error) {
      console.error('[SlotCard] Error toggling availability:', error);
      // Don't update local state on error
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  return (
    <div
      onClick={() => handleOpenAssignModal(slot)}
      className={`bg-gradient-to-r from-black/60 to-black/70 backdrop-blur-sm hover:from-black/70 hover:to-black/80 rounded-lg p-4 border border-white/20 shadow-xl cursor-pointer transition group relative`}
    >
      <div className="absolute top-0 left-0 h-1 bg-white/30" style={{ width: `${fillPercentage}%` }}></div>
      
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-white font-bold">{slot.location}</h3>
          <div className="flex items-center mt-1">
            <div className="bg-black/50 border border-white/20 text-white px-3 py-1.5 rounded-md text-sm font-medium">
              {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {/* Shift type and capacity icons */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            slot.shift_type === 'day' ? 'bg-amber-500/30 text-amber-200 border border-amber-400/30' :
            slot.shift_type === 'afternoon' ? 'bg-orange-500/30 text-orange-200 border border-orange-400/30' :
            'bg-blue-600/40 text-blue-200 border border-blue-400/30'
          }`}>
            {slot.shift_type.charAt(0).toUpperCase() + slot.shift_type.slice(1)}
          </span>
          
          <div className="text-xs bg-black/50 text-white border border-white/20 px-2 py-0.5 rounded-full">
            <span className="font-medium">{assignedCount}</span>
            <span className="mx-1">/</span>
            <span>{slot.capacity}</span>
          </div>
          
          {/* Display available badge if slot is available for self-service */}
          {isAvailable && (
            <div className="text-xs bg-green-600/40 text-green-200 border border-green-400/30 px-2 py-0.5 rounded-full font-medium">
              Available
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Remove duplicate time display since we have it prominently at the top */}
          
          {/* Action buttons - only show if user is admin */}
          {isAdmin && (
            <div className="opacity-100 flex space-x-1 transition-opacity duration-200">
              {/* Toggle availability button */}
              <button
                onClick={toggleAvailability}
                disabled={isTogglingAvailability}
                className={`p-1 rounded-full ${
                  isTogglingAvailability 
                    ? 'bg-gray-500/20 text-gray-300 cursor-not-allowed' 
                    : isAvailable 
                      ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                      : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                }`}
                title={isAvailable ? "Remove from available shifts" : "Mark as available for self-service"}
              >
                {isTogglingAvailability ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : isAvailable ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
              
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
                className="p-1 rounded-full bg-white/10 text-white hover:bg-white/20"
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
                  handleDeleteSlot(slot.id);
                }}
                className="p-1 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500/30"
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
      <div className="mt-3">
        <div className="flex flex-col space-y-2">
          {loading ? (
            <div className="animate-pulse bg-white/10 h-6 rounded"></div>
          ) : assignedUsers.length > 0 ? (
            assignedUsers.map(user => (
              <div key={user.id} className="flex items-center space-x-2 py-1 px-2 rounded bg-white/5">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs">
                    {user.first_name?.[0]}{user.last_name?.[0]}
                  </div>
                )}
                <span className="text-sm text-white">{user.first_name} {user.last_name}</span>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/50 italic">No employees assigned</div>
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
  handleToggleSlotAvailability: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired
};

export default SlotCard; 