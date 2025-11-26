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
    switch (shiftType) {
      case 'day':
        return 'bg-blue-500';
      case 'afternoon':
        return 'bg-indigo-500';
      case 'night':
        return 'bg-slate-500';
      default:
        return 'bg-gray-400';
    }
  };

  const stateStyles = isSlotFull
    ? {
        borderClass: 'border-green-300',
        statusBadge: 'bg-green-100 text-green-700 border border-green-200',
        progressBar: 'bg-green-500',
        capacityBadge: 'bg-green-50 text-green-700 border border-green-200'
      }
    : fillPercentage === 0
    ? {
        borderClass: 'border-red-300',
        statusBadge: 'bg-red-100 text-red-700 border border-red-200',
        progressBar: 'bg-red-500',
        capacityBadge: 'bg-red-50 text-red-700 border border-red-200'
      }
    : {
        borderClass: 'border-yellow-300',
        statusBadge: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
        progressBar: 'bg-yellow-500',
        capacityBadge: 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      };

  const statusInfo = isSlotFull
    ? { text: 'Full' }
    : fillPercentage === 0
    ? { text: 'Empty' }
    : { text: 'Partial' };

  // Delete confirmation dialog
  const DeleteConfirmationModal = () => {
    if (!showDeleteConfirm) return null;
    
    const modalContent = (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
          <h3 className="mb-3 text-xl font-bold text-charcoal">Confirm Delete</h3>
          <p className="mb-5 text-gray-600">
            Are you sure you want to delete this slot?
            {assignedCount > 0 && (
              <span className="mt-2 block text-sm font-semibold text-red-600">
                This slot has {assignedCount} assigned employee{assignedCount !== 1 ? 's' : ''}.
              </span>
            )}
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-charcoal hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                handleDeleteSlot(slot.id);
                setShowDeleteConfirm(false);
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 transition-colors"
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
      className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition hover:shadow-lg cursor-pointer h-full flex flex-col ${stateStyles.borderClass}`}
    >
      {/* Delete confirmation modal */}
      <DeleteConfirmationModal />
      
      {/* Pionowy pasek oznaczający typ zmiany */}
      <div className={`absolute top-0 left-0 h-full w-1.5 ${getShiftIndicatorColor(slot.shift_type)}`}></div>
      
      {/* HEADER: Czas + Capacity */}
      <div className="flex items-center justify-between px-4 py-3 pl-5 border-b border-gray-100">
        {/* Time - duży i wyraźny */}
        <span className="text-lg font-black text-charcoal">
          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
        </span>
        
        {/* Capacity - po prawej */}
        <span className={`text-lg font-black ${
          isSlotFull ? 'text-green-600' :
          fillPercentage === 0 ? 'text-red-600' :
          'text-yellow-600'
        }`}>
          {assignedCount}/{slot.capacity}
        </span>
      </div>
      
      {/* BODY: Employees list - flex-grow wypycha footer na dół */}
      <div className="px-4 py-3 pl-5 flex-grow">
        {loading ? (
          <div className="h-5 animate-pulse rounded bg-gray-200 w-32"></div>
        ) : assignedUsers.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {assignedUsers.map(user => (
              <div key={user.id} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  isSlotFull ? 'bg-green-500' :
                  fillPercentage === 0 ? 'bg-red-500' :
                  'bg-yellow-500'
                }`}></span>
                <span className="text-sm font-medium text-gray-800">
                  {user.first_name} {user.last_name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">No employees assigned</span>
          </div>
        )}
      </div>
      
      {/* FOOTER: Action buttons - zawsze na dole */}
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 pl-5 border-t border-gray-100 bg-gray-50/50 mt-auto">
          {/* Edit button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof handleOpenEditModal === 'function') {
                handleOpenEditModal(slot);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-all"
            title="Edit shift"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </button>
          
          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-400 transition-all"
            title="Delete shift"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
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