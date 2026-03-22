import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

function AvailabilityDialog({ date, initialData, onSave, onClose }) {
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
    <div className="fixed inset-0 bg-rota-modal-overlay flex items-center justify-center z-50 p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="glass-card w-full max-w-sm mx-auto my-auto p-6 shadow-strong"
      >
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-xl font-bold leading-tight text-charcoal">
              Set Availability for {dayOfWeek}
            </h2>
            <p className="text-rota-text-muted text-sm font-medium mt-1">{format(date, 'd MMM yyyy')}</p>
          </div>
          <button
            type="button"
            className="text-rota-text-muted-light hover:text-charcoal hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
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
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setStatus('available')}
                className={`rounded-xl py-3 px-4 flex justify-center items-center font-medium transition-all border-2 ${
                  status === 'available'
                    ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-sm'
                    : 'border-emerald-300/70 bg-white text-emerald-800 hover:bg-emerald-50/50'
                }`}
              >
                Available
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('unavailable')}
                className={`rounded-xl py-3 px-4 flex justify-center items-center font-medium transition-all border-2 ${
                  status === 'unavailable'
                    ? 'border-red-500 bg-red-50/80 text-red-900 shadow-sm'
                    : 'border-red-300/70 bg-white text-red-800 hover:bg-red-50/50'
                }`}
              >
                Unavailable
              </button>
              
              <button
                type="button"
                onClick={() => setStatus('holiday')}
                className={`rounded-xl py-3 px-4 flex justify-center items-center font-medium transition-all border-2 ${
                  status === 'holiday'
                    ? 'border-blue-600 bg-sky-50/90 text-blue-900 shadow-sm'
                    : 'border-blue-300/70 bg-white text-blue-800 hover:bg-sky-50/50'
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
              className="w-full px-3 py-2 bg-white border border-rota-input-border rounded-lg focus:outline-none focus:border-rota-input-focus-border focus:ring-2 focus:ring-[rgba(59,130,246,0.2)] text-charcoal placeholder-gray-400"
              rows="3"
              placeholder="Add any notes about this day..."
            ></textarea>
          </div>
          
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <motion.button
              type="button"
              onClick={onClose}
              whileTap={{ scale: 0.97 }}
              className="btn-secondary order-2 sm:order-1"
            >
              Cancel
            </motion.button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              className="btn-primary order-1 sm:order-2"
            >
              Save
            </motion.button>
          </div>
        </form>
      </motion.div>
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

// Memoize component to prevent unnecessary re-renders
// Uses custom comparison to handle Date objects properly
export default React.memo(AvailabilityDialog, (prevProps, nextProps) => {
  return (
    prevProps.date?.getTime() === nextProps.date?.getTime() &&
    prevProps.initialData === nextProps.initialData &&
    prevProps.onSave === nextProps.onSave &&
    prevProps.onClose === nextProps.onClose
  );
}); 