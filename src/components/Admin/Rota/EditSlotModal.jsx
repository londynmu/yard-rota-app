import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

const EditSlotModal = ({ slot, onClose, onUpdate, onDelete, locations, onOpenTimePicker }) => {
  const [editedSlot, setEditedSlot] = useState({
    location: slot.location,
    start_time: slot.start_time,
    end_time: slot.end_time,
    capacity: slot.capacity
  });
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleSave = () => {
    onUpdate(slot.id, editedSlot);
    onClose();
  };

  const handleDelete = () => {
    setShowConfirmDelete(true);
  };

  const confirmDelete = () => {
    onDelete(slot.id);
    onClose();
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    // Convert 24h format to 12h format
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Confirmation Modal
  const DeleteConfirmationModal = () => {
    return createPortal(
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10000]">
        <div className="bg-black/80 border border-white/30 rounded-lg max-w-md w-[90%] m-4">
          <div className="p-5 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            
            <h3 className="text-xl font-medium text-white mb-2">Delete Confirmation</h3>
            <p className="text-white/80 mb-6">
              Are you sure you want to delete this slot?<br />
              <span className="text-white/60 text-sm">This action cannot be undone.</span>
            </p>
            
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white hover:bg-white/10 transition-colors min-w-[100px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600/40 border border-red-400/30 rounded-md text-white hover:bg-red-600/60 transition-colors min-w-[100px]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-black/80 border border-white/30 rounded-lg max-w-md w-[95%] m-4">
        <div className="p-4 border-b border-white/20 flex justify-between items-center">
          <h3 className="text-xl font-medium text-white">Edit Slot</h3>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white"
          >
            <span className="sr-only">Close</span>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-white mb-1">Location</label>
            <select
              value={editedSlot.location}
              onChange={(e) => setEditedSlot({...editedSlot, location: e.target.value})}
              className="w-full bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
            >
              {locations.map(location => (
                <option key={location.id} value={location.name} className="bg-gray-900 text-white">
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white mb-1">Start Time</label>
              <button 
                onClick={() => onOpenTimePicker('start', editedSlot.start_time, (time) => setEditedSlot({...editedSlot, start_time: time}))}
                className="w-full flex items-center justify-between bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
              >
                <span>{formatTime(editedSlot.start_time)}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
            
            <div>
              <label className="block text-white mb-1">End Time</label>
              <button 
                onClick={() => onOpenTimePicker('end', editedSlot.end_time, (time) => setEditedSlot({...editedSlot, end_time: time}))}
                className="w-full flex items-center justify-between bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
              >
                <span>{formatTime(editedSlot.end_time)}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-white mb-1">Capacity (staff needed)</label>
            <div className="flex items-center bg-gray-900 border border-white/20 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setEditedSlot({...editedSlot, capacity: Math.max(1, editedSlot.capacity - 1)})}
                className="px-3 py-2 hover:bg-gray-800 focus:outline-none text-white"
                aria-label="Decrease capacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={editedSlot.capacity}
                onChange={(e) => {
                  const value = e.target.value === '' ? 1 : parseInt(e.target.value) || 1;
                  setEditedSlot({...editedSlot, capacity: value});
                }}
                className="w-full bg-gray-900 text-white py-2 focus:outline-none focus:bg-gray-800 text-center border-x border-white/20"
              />
              
              <button
                type="button"
                onClick={() => setEditedSlot({...editedSlot, capacity: editedSlot.capacity + 1})}
                className="px-3 py-2 hover:bg-gray-800 focus:outline-none text-white"
                aria-label="Increase capacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="flex justify-between space-x-3 mt-6">
            <button
              onClick={handleDelete}
              className="px-3 py-2 bg-red-500/20 border border-red-400/30 rounded-md text-red-200 hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-3 py-2 border border-white/20 rounded-md text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-2 bg-blue-600/30 border border-blue-400/30 rounded-md text-white hover:bg-blue-600/40 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modalContent, document.body)}
      {showConfirmDelete && <DeleteConfirmationModal />}
    </>
  );
};

EditSlotModal.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    capacity: PropTypes.number.isRequired
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  locations: PropTypes.array.isRequired,
  onOpenTimePicker: PropTypes.func.isRequired
};

export default EditSlotModal; 