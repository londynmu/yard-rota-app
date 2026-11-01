import React from 'react';
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';

export default function AvailabilityEditModal({ date, user, initialData, onSave, onClose }) {
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
  
  // Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    onSave({
      date: format(date, 'yyyy-MM-dd'),
      status,
      comment,
      userId: user.id
    });
    
    onClose();
  };

  // Get day of week for the selected date
  const dayOfWeek = format(date, 'EEEE'); // Full day name (Monday, Tuesday, etc.)
  
  // Create portal content
  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4"
      style={{ 
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10000,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div 
        className="admin-modal-panel mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="admin-modal-header flex justify-between items-start">
          <div className="flex-1 pr-4">
            <h2 className="text-sm font-semibold text-charcoal mb-1">
              Edit Availability
            </h2>
            <p className="text-gray-600 text-sm font-medium">
              {user.first_name && user.last_name 
                ? `${user.first_name} ${user.last_name}`
                : user.name || user.email}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {format(date, 'MMM d, yyyy')} - {dayOfWeek}
            </p>
          </div>
          <button
            type="button"
            className="admin-icon-btn flex-shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-5">
            <label className="block text-gray-700 font-semibold mb-3 text-sm">
              Availability Status
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setStatus('available')}
                className={`rounded-xl py-3 px-2 flex justify-center items-center font-semibold transition-all ${
                  status === 'available' 
                    ? 'bg-green-500 text-white shadow-lg ring-2 ring-green-400 ring-offset-2' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200 border-2 border-green-300'
                }`}
              >
                Available
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('unavailable')}
                className={`rounded-xl py-3 px-2 flex justify-center items-center font-semibold transition-all ${
                  status === 'unavailable' 
                    ? 'bg-red-500 text-white shadow-lg ring-2 ring-red-400 ring-offset-2' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200 border-2 border-red-300'
                }`}
              >
                Unavailable
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('holiday')}
                className={`rounded-xl py-3 px-2 flex justify-center items-center font-semibold transition-all ${
                  status === 'holiday' 
                    ? 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-400 ring-offset-2' 
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-2 border-blue-300'
                }`}
              >
                Holiday
              </button>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2 text-sm" htmlFor="comment">
              Comments (optional)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="admin-input resize-none"
              rows="3"
              placeholder="Add any notes about this day..."
            ></textarea>
          </div>
          
          <div className="admin-modal-footer !px-0 !pb-0 !border-0">
            <button
              type="button"
              onClick={onClose}
              className="admin-btn-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  
  // Use createPortal to render the modal directly to the body
  return createPortal(modalContent, document.body);
}

AvailabilityEditModal.propTypes = {
  date: PropTypes.instanceOf(Date).isRequired,
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    email: PropTypes.string
  }).isRequired,
  initialData: PropTypes.shape({
    status: PropTypes.string,
    comment: PropTypes.string
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}; 