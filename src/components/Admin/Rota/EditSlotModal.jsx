import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

const EditSlotModal = ({ isOpen, onClose, slot, onUpdate, onShowTimePicker, locations }) => {
  const [editedSlot, setEditedSlot] = useState({
    location: slot?.location || '',
    start_time: slot?.start_time || '09:00',
    end_time: slot?.end_time || '17:00',
    capacity: slot?.capacity || 1,
    shift_type: slot?.shift_type || 'day',
    task: slot?.task || ''
  });
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isAvailable, setIsAvailable] = useState(slot?.status === 'available');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Update isAvailable when slot changes
  useEffect(() => {
    if (slot) {
      setIsAvailable(slot.status === 'available');
    }
  }, [slot]);

  // Update form data when slot changes
  useEffect(() => {
    if (slot) {
      setEditedSlot({
        location: slot.location || '',
        start_time: slot.start_time || '09:00',
        end_time: slot.end_time || '17:00',
        capacity: slot.capacity || 1,
        shift_type: slot.shift_type || 'day',
        task: slot.task || ''
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
        status: isAvailable ? 'available' : null // Update status based on isAvailable toggle
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Shift</h3>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <select
                name="location"
                value={editedSlot.location}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {!isCurrentLocationActive && editedSlot.location && (
                  <option value={editedSlot.location}>{editedSlot.location} (inactive)</option>
                )}
                {locations.map(loc => (
                  <option key={loc.name} value={loc.name}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Time
                </label>
                <div
                  onClick={() => onShowTimePicker('start_time', editedSlot.start_time, time => handleTimeChange('start_time', time))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm cursor-pointer hover:bg-gray-50"
                >
                  {editedSlot.start_time.substring(0, 5)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Time
                </label>
                <div
                  onClick={() => onShowTimePicker('end_time', editedSlot.end_time, time => handleTimeChange('end_time', time))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm cursor-pointer hover:bg-gray-50"
                >
                  {editedSlot.end_time.substring(0, 5)}
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Shift Type
              </label>
              <select
                name="shift_type"
                value={editedSlot.shift_type}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="day">Day</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Capacity
              </label>
              <input
                type="number"
                name="capacity"
                value={editedSlot.capacity}
                onChange={handleInputChange}
                min="1"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Task/Notes (Optional)
              </label>
              <textarea
                name="task"
                value={editedSlot.task || ''}
                onChange={handleInputChange}
                rows="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter any task details or notes..."
              />
            </div>
            
            <div className="flex items-center mt-4">
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAvailable}
                    onChange={() => setIsAvailable(!isAvailable)}
                  />
                  <div className={`block w-10 h-6 rounded-full ${isAvailable ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${isAvailable ? 'transform translate-x-4' : ''}`}></div>
                </div>
                <div className="ml-3 text-gray-700 dark:text-gray-300 font-medium">
                  Available for self-service
                </div>
              </label>
            </div>
            
            {isAvailable && (
              <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm">
                This shift will be visible to all employees who can claim it themselves.
                {slot?.user_id && <div className="mt-2 font-bold">Note: Making this available will remove the currently assigned employee.</div>}
              </div>
            )}

            <div className="flex justify-between space-x-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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