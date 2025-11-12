import React from 'react';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

export default function AvailabilityDialog({ date, initialData, onSave, onClose }) {
  const [status, setStatus] = useState('available');
  const [comment, setComment] = useState('');
  
  // When the dialog opens with initial data, set the form values
  useEffect(() => {
    if (initialData) {
      setStatus(initialData.status || 'available');
      setComment(initialData.comment || '');
    } else {
      // Reset form if no initial data
      setStatus('available');
      setComment('');
    }
  }, [initialData]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    onSave({
      date: format(date, 'yyyy-MM-dd'),
      status,
      comment
    });
    
    onClose();
  };

  // Get day of week for the selected date
  const dayOfWeek = format(date, 'EEEE'); // Full day name (Monday, Tuesday, etc.)
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mx-auto my-auto border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-bold leading-tight text-charcoal">
              Set Availability for {format(date, 'MMM d, yyyy')}
            </h2>
            <p className="text-gray-600 text-sm font-medium">{dayOfWeek}</p>
          </div>
          <button
            type="button"
            className="text-gray-400 hover:text-charcoal hover:bg-gray-100 p-1.5 rounded-lg"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-charcoal font-medium mb-3">
              Availability Status
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setStatus('available')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center font-medium transition-all ${
                  status === 'available' 
                    ? 'bg-green-500 text-white shadow-md border-2 border-green-600 scale-105' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-300'
                }`}
              >
                Available
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('unavailable')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center font-medium transition-all ${
                  status === 'unavailable' 
                    ? 'bg-red-500 text-white shadow-md border-2 border-red-600 scale-105' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                }`}
              >
                Unavailable
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('holiday')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center font-medium transition-all ${
                  status === 'holiday' 
                    ? 'bg-blue-500 text-white shadow-md border-2 border-blue-600 scale-105' 
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                }`}
              >
                Holiday
              </button>
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-charcoal font-medium mb-2" htmlFor="comment">
              Comments (optional)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-2 focus:ring-black/20 text-charcoal placeholder-gray-400"
              rows="3"
              placeholder="Add any notes about this day..."
            ></textarea>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-black rounded-lg text-charcoal bg-transparent hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AvailabilityDialog.propTypes = {
  date: PropTypes.instanceOf(Date).isRequired,
  initialData: PropTypes.shape({
    status: PropTypes.string,
    comment: PropTypes.string
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}; 