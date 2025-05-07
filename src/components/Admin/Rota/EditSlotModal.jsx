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

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      
      // Validate the form
      if (!editedSlot.location) {
        setError('Please select a location');
        setIsSaving(false);
        return;
      }
      
      // Prepare data for update
      const dataToUpdate = {
        ...editedSlot,
        status: slot?.status // Zachowaj istniejący status
      };
      
      await onUpdate(slot.id, dataToUpdate);
      onClose();
    } catch (error) {
      console.error('Error updating slot:', error);
      setError(`Failed to update: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedSlot(prev => ({
      ...prev,
      [name]: name === 'capacity' ? parseInt(value, 10) : value
    }));
  };

  const handleTimeChange = (field, time) => {
    setEditedSlot(prev => ({
      ...prev,
      [field]: time
    }));
  };

  // Sprawdź, czy obecna lokalizacja slotu jest nadal aktywna
  const isCurrentLocationActive = locations.some(loc => loc.name === editedSlot.location);

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-white/20">
          <h3 className="text-xl font-medium text-white">Edit Shift</h3>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-white text-black p-3 rounded-md shadow-sm border border-gray-300">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="font-medium">{error}</p>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-white mb-1">
                Location
              </label>
              <select
                name="location"
                value={editedSlot.location}
                onChange={handleInputChange}
                className="w-full bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
              >
                {!isCurrentLocationActive && editedSlot.location && (
                  <option value={editedSlot.location} className="bg-gray-900 text-white">{editedSlot.location} (inactive)</option>
                )}
                {locations.map(loc => (
                  <option key={loc.name} value={loc.name} className="bg-gray-900 text-white">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white mb-1">
                  Start Time
                </label>
                <button
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, time => handleTimeChange('start_time', time))}
                  className="w-full flex items-center justify-between bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
                >
                  <span>{editedSlot.start_time.substring(0, 5)}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
              
              <div>
                <label className="block text-white mb-1">
                  End Time
                </label>
                <button
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, time => handleTimeChange('end_time', time))}
                  className="w-full flex items-center justify-between bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
                >
                  <span>{editedSlot.end_time.substring(0, 5)}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-white mb-1">
                Shift Type
              </label>
              <select
                name="shift_type"
                value={editedSlot.shift_type}
                onChange={handleInputChange}
                className="w-full bg-gray-900 text-white border border-white/20 rounded-md px-3 py-2 focus:outline-none focus:border-white/50"
              >
                <option value="day" className="bg-gray-900 text-white">Day</option>
                <option value="afternoon" className="bg-gray-900 text-white">Afternoon</option>
                <option value="night" className="bg-gray-900 text-white">Night</option>
              </select>
            </div>
            
            <div>
              <label className="block text-white mb-1">
                Capacity
              </label>
              <div className="flex items-center bg-gray-800 rounded-lg border border-white/20 overflow-hidden w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (editedSlot.capacity > 1) {
                      setEditedSlot(prev => ({
                        ...prev,
                        capacity: prev.capacity - 1
                      }));
                    }
                  }}
                  className="px-4 py-3 text-white hover:bg-gray-700 flex-1 flex justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <div className="py-3 bg-gray-900 text-white text-center flex-1 font-medium text-lg">
                  {editedSlot.capacity}
                </div>
                <button
                  type="button"
                  onClick={() => setEditedSlot(prev => ({
                    ...prev,
                    capacity: prev.capacity + 1
                  }))}
                  className="px-4 py-3 text-white hover:bg-gray-700 flex-1 flex justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex justify-between space-x-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 text-white border border-white/20 rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return isOpen ? createPortal(modalContent, document.body) : null;
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