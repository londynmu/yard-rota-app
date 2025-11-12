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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-xl font-semibold text-charcoal">Edit Slot</h2>
          <button
            onClick={onClose}
            className="text-gray-500 transition hover:text-charcoal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">Location</label>
            <select
              name="location"
              value={editedSlot.location}
              onChange={handleInputChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="">Select a location</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.name}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">Start Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={editedSlot.start_time.substring(0, 5)}
                  readOnly 
                  className="w-full cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, (time) => setEditedSlot({...editedSlot, start_time: time}))}
                />
                <button 
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, (time) => setEditedSlot({...editedSlot, start_time: time}))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">End Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={editedSlot.end_time.substring(0, 5)}
                  readOnly 
                  className="w-full cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, (time) => setEditedSlot({...editedSlot, end_time: time}))}
                />
                <button 
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, (time) => setEditedSlot({...editedSlot, end_time: time}))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">Shift Type</label>
            <select
              name="shift_type"
              value={editedSlot.shift_type}
              onChange={handleInputChange}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="day">Day</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-charcoal">Capacity (Staff needed)</label>
            <div className="flex w-full items-center overflow-hidden rounded-lg border border-gray-300">
              <button
                type="button"
                onClick={() => {
                  if (editedSlot.capacity > 1) {
                    setEditedSlot({...editedSlot, capacity: editedSlot.capacity - 1});
                  }
                }}
                className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-3 text-charcoal transition hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex-1 bg-white py-3 text-center text-lg font-semibold text-charcoal">
                {editedSlot.capacity}
              </div>
              <button
                type="button"
                onClick={() => setEditedSlot({...editedSlot, capacity: editedSlot.capacity + 1})}
                className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-3 text-charcoal transition hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-charcoal hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-black px-4 py-2 text-white transition hover:bg-gray-800"
              disabled={isSaving}
            >
              {isSaving ? (
                <div className="flex items-center justify-center">
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
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