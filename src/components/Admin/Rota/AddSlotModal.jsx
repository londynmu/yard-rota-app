import React, { useState } from 'react';
import PropTypes from 'prop-types';

const AddSlotModal = ({ isOpen, onClose, onAdd, onOpenTimePicker, locations, selectedDate }) => {
  const [formData, setFormData] = useState({
    shift_type: 'day',
    location: locations.length > 0 ? locations[0].name : '',
    start_time: '05:45',
    end_time: '18:00',
    capacity: 1,
    task: '',
  });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'capacity' ? parseInt(value, 10) : value
    }));
  };

  const handleTimeChange = (field, time) => {
    setFormData(prev => ({
      ...prev,
      [field]: time
    }));
  };

  const handleAdd = async () => {
    try {
      setError(null);
      
      // Validation checks
      if (!formData.location) {
        setError('Please select a location');
        return;
      }

      // Create data to send
      const dataToAdd = {
        ...formData,
        date: selectedDate,
        status: isAvailable ? 'available' : null // Add status based on toggle
      };
      
      setIsSubmitting(true);
      await onAdd(dataToAdd);
      onClose();
    } catch (error) {
      console.error('Error adding slot:', error);
      setError(`Failed to add: ${error.message || 'Unknown error'}`);
      setIsSubmitting(false);
    }
  };

  return isOpen ? (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center overflow-y-auto">
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Add New Slot</h3>
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
                value={formData.location}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
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
                  onClick={() => onOpenTimePicker('start_time', formData.start_time, time => handleTimeChange('start_time', time))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm cursor-pointer hover:bg-gray-50"
                >
                  {formData.start_time.substring(0, 5)}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Time
                </label>
                <div
                  onClick={() => onOpenTimePicker('end_time', formData.end_time, time => handleTimeChange('end_time', time))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm cursor-pointer hover:bg-gray-50"
                >
                  {formData.end_time.substring(0, 5)}
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Shift Type
              </label>
              <select
                name="shift_type"
                value={formData.shift_type}
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
                value={formData.capacity}
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
                value={formData.task}
                onChange={handleInputChange}
                rows="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter any task details or notes..."
              />
            </div>
            
            {/* Available for self-service toggle */}
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
            
            {/* Explanation text */}
            {isAvailable && (
              <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm">
                This slot will be visible to all employees, who can claim it themselves.
              </div>
            )}
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </span>
            ) : 'Add Slot'}
          </button>
        </div>
      </div>
    </div>
  ) : null;
};

AddSlotModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  onOpenTimePicker: PropTypes.func.isRequired,
  locations: PropTypes.array.isRequired,
  selectedDate: PropTypes.string.isRequired
};

export default AddSlotModal; 