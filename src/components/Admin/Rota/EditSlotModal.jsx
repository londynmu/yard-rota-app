import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

const EditSlotModal = ({ isOpen, onClose, slot, onUpdate, onShowTimePicker, locations }) => {
  console.log('[EditSlotModal] Rendering. Props received:', { isOpen, slot, locations });

  const [editedSlot, setEditedSlot] = useState({
    location: slot?.location || '',
    start_time: slot?.start_time || '09:00',
    end_time: slot?.end_time || '17:00',
    capacity: slot?.capacity || 1,
    shift_type: slot?.shift_type || 'day'
  });
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update form data when slot changes
  useEffect(() => {
    if (slot) {
      setEditedSlot({
        location: slot.location || '',
        start_time: slot.start_time || '09:00',
        end_time: slot.end_time || '17:00',
        capacity: slot.capacity || 1,
        shift_type: slot.shift_type || 'day'
      });
    }
  }, [slot]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedSlot(prevData => ({
      ...prevData,
      [name]: name === 'capacity' ? parseInt(value, 10) : value
    }));
  };

  const handleSave = async () => {
    console.log('[EditSlotModal] handleSave called');
    
    if (!editedSlot.location) {
      setError('Please select a location');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onUpdate(slot.id, editedSlot);
      onClose();
    } catch (err) {
      console.error('[EditSlotModal] Error updating slot:', err);
      setError(err.message || 'Failed to update shift');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl border border-slate-700/40 overflow-hidden w-full max-w-xl mx-auto">
        <div className="p-6 flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-charcoal dark:text-white">Edit Slot</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-charcoal dark:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-white text-black rounded-md shadow-sm border border-gray-300">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-charcoal dark:text-white mb-1">Location</label>
            <select
              name="location"
              value={editedSlot.location}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a location</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-charcoal dark:text-white mb-1">Start Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={editedSlot.start_time.substring(0, 5)}
                  readOnly 
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal dark:text-white cursor-pointer pr-10 focus:outline-none"
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, (time) => setEditedSlot({...editedSlot, start_time: time}))}
                />
                <button 
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, (time) => setEditedSlot({...editedSlot, start_time: time}))}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-charcoal dark:text-white/70 hover:text-charcoal dark:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-charcoal dark:text-white mb-1">End Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={editedSlot.end_time.substring(0, 5)}
                  readOnly 
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal dark:text-white cursor-pointer pr-10 focus:outline-none"
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, (time) => setEditedSlot({...editedSlot, end_time: time}))}
                />
                <button 
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, (time) => setEditedSlot({...editedSlot, end_time: time}))}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-charcoal dark:text-white/70 hover:text-charcoal dark:text-white"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-charcoal dark:text-white mb-1">Shift Type</label>
            <select
              name="shift_type"
              value={editedSlot.shift_type}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="day">Day</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
            </select>
          </div>
          
          <div>
            <label className="block text-charcoal dark:text-white mb-1">Capacity (Staff needed)</label>
            <div className="flex items-center bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden w-full">
              <button
                type="button"
                onClick={() => {
                  if (editedSlot.capacity > 1) {
                    setEditedSlot({...editedSlot, capacity: editedSlot.capacity - 1});
                  }
                }}
                className="flex-1 h-10 bg-slate-900/50 text-charcoal dark:text-white flex items-center justify-center hover:bg-slate-700/70"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex-1 h-10 flex items-center justify-center text-charcoal dark:text-white font-bold">
                {editedSlot.capacity}
              </div>
              <button
                type="button"
                onClick={() => setEditedSlot({...editedSlot, capacity: editedSlot.capacity + 1})}
                className="flex-1 h-10 bg-slate-900/50 text-charcoal dark:text-white flex items-center justify-center hover:bg-slate-700/70"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="flex justify-between space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800/80 text-charcoal dark:text-white rounded border border-slate-700/50 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600/80 text-charcoal dark:text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all"
              disabled={isSaving}
            >
              {isSaving ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </div>
              ) : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

EditSlotModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  slot: PropTypes.object,
  onUpdate: PropTypes.func.isRequired,
  onShowTimePicker: PropTypes.func.isRequired,
  locations: PropTypes.array.isRequired
};

export default EditSlotModal; 