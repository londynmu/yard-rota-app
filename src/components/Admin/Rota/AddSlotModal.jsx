import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

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
        date: selectedDate
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl border border-slate-700/40 overflow-hidden w-full max-w-xl mx-auto">
        <div className="p-6 flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-charcoal">Add New Slot</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-charcoal transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Komunikat o błędzie w modalu */}
          {error && (
            <div className="mb-4 p-3 bg-white text-black rounded-md shadow-sm border border-gray-300">
              <div className="flex items-start">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-medium">{error}</p>
                  {error.includes('already exists') && (
                    <p className="text-sm mt-1 text-gray-700">Try changing the time or location.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-charcoal mb-1">Date</label>
            <div className="relative bg-white/10 border border-slate-700/50 rounded overflow-hidden flex items-center">
              <div className="py-2 px-3 text-charcoal bg-slate-800/50 flex-grow">{selectedDate.substring(0, 10)}</div>
            </div>
          </div>
          
          <div>
            <label className="block text-charcoal mb-1">Location</label>
            <select
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a location</option>
              {locations.map(location => (
                <option key={location.id} value={location.name}>{location.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-charcoal mb-1">Start Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.start_time} 
                  readOnly 
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal cursor-pointer pr-10 focus:outline-none"
                  onClick={() => onOpenTimePicker('start_time', formData.start_time, time => handleTimeChange('start_time', time))}
                />
                <button 
                  onClick={() => onOpenTimePicker('start_time', formData.start_time, time => handleTimeChange('start_time', time))}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-charcoal/70 hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-charcoal mb-1">End Time</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.end_time} 
                  readOnly 
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal cursor-pointer pr-10 focus:outline-none"
                  onClick={() => onOpenTimePicker('end_time', formData.end_time, time => handleTimeChange('end_time', time))}
                />
                <button 
                  onClick={() => onOpenTimePicker('end_time', formData.end_time, time => handleTimeChange('end_time', time))}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-charcoal/70 hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-charcoal mb-1">Shift Type</label>
            <select
              value={formData.shift_type}
              onChange={(e) => setFormData({...formData, shift_type: e.target.value})}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="day">Day</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
            </select>
          </div>
          
          <div>
            <label className="block text-charcoal mb-1">Capacity (Staff needed)</label>
            <div className="flex items-center bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden w-full">
              <button
                type="button"
                onClick={() => {
                  if (formData.capacity > 1) {
                    setFormData({...formData, capacity: formData.capacity - 1});
                  }
                }}
                className="flex-1 h-10 bg-slate-900/50 text-charcoal flex items-center justify-center hover:bg-slate-700/70"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex-1 h-10 flex items-center justify-center text-charcoal font-bold">
                {formData.capacity}
              </div>
              <button
                type="button"
                onClick={() => setFormData({...formData, capacity: formData.capacity + 1})}
                className="flex-1 h-10 bg-slate-900/50 text-charcoal flex items-center justify-center hover:bg-slate-700/70"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-charcoal mb-1">Task/Notes (Optional)</label>
            <textarea
              value={formData.task}
              onChange={(e) => setFormData({...formData, task: e.target.value})}
              rows="2"
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-charcoal focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter any task details or notes..."
            />
          </div>
          
          <div className="flex justify-between space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800/80 text-charcoal rounded border border-slate-700/50 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600/80 text-charcoal rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-charcoal" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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