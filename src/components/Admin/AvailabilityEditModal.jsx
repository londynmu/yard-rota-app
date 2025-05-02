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
      className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[10000]"
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
        className="bg-black/70 backdrop-blur-xl rounded-xl shadow-2xl p-6 w-full max-w-sm mx-auto border-2 border-white/30 animate-fadeIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-bold leading-tight text-white drop-shadow-md">
              Edit Availability for {user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
            </h2>
            <p className="text-white/90 text-sm font-medium">{format(date, 'MMM d, yyyy')} - {dayOfWeek}</p>
          </div>
          <button
            type="button"
            className="text-white/80 hover:text-white transition-colors hover:bg-white/10 p-1.5 rounded-full"
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
            <label className="block text-white font-medium mb-3">
              Availability Status
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setStatus('available')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center text-white font-medium transition-all ${
                  status === 'available' 
                    ? 'bg-green-500/80 shadow-lg shadow-green-500/30 border-2 border-green-400/50 scale-105' 
                    : 'bg-green-500/50 hover:bg-green-500/70 border border-green-400/30 hover:scale-102'
                }`}
              >
                Available
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('unavailable')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center text-white font-medium transition-all ${
                  status === 'unavailable' 
                    ? 'bg-red-500/80 shadow-lg shadow-red-500/30 border-2 border-red-400/50 scale-105' 
                    : 'bg-red-500/50 hover:bg-red-500/70 border border-red-400/30 hover:scale-102'
                }`}
              >
                Unavailable
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('holiday')}
                className={`rounded-lg py-3 px-2 flex justify-center items-center text-white font-medium transition-all ${
                  status === 'holiday' 
                    ? 'bg-blue-500/80 shadow-lg shadow-blue-500/30 border-2 border-blue-400/50 scale-105' 
                    : 'bg-blue-500/50 hover:bg-blue-500/70 border border-blue-400/30 hover:scale-102'
                }`}
              >
                Holiday
              </button>
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-white font-medium mb-2" htmlFor="comment">
              Comments (optional)
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 text-white placeholder-white/50"
              rows="3"
              placeholder="Add any notes about this day..."
            ></textarea>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-white/30 rounded-lg text-white hover:bg-white/20 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-500/80 border border-blue-400/40 text-white rounded-lg hover:bg-blue-500/90 transition-all shadow-md hover:shadow-blue-500/30 active:scale-95"
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