import React from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';

const UserNoteModal = ({ note, employee, date, onClose, onConfirm }) => {
  // Format the date for display
  const formattedDate = format(new Date(date), 'dd/MM/yyyy');

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999]">
      <div className="bg-gray-900 border border-gray-700/30 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-medium text-white">User Note</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-4 mb-4">
            <div className="flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-white font-medium">Important Note for {formattedDate}</p>
                <p className="text-gray-300 text-sm mt-1">
                  {employee.first_name} {employee.last_name} has left a note for this day:
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-md p-4 mb-5">
            <p className="text-white whitespace-pre-wrap">{note}</p>
          </div>
          
          <div className="bg-gray-800/30 border border-gray-700/30 rounded-md p-3 mb-5">
            <p className="text-gray-300 text-sm">
              This note may indicate availability constraints or special circumstances.
              Please consider this information before assigning the employee to a shift.
            </p>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 text-white rounded-md border border-gray-700 hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Assign Anyway
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

UserNoteModal.propTypes = {
  note: PropTypes.string.isRequired,
  employee: PropTypes.shape({
    id: PropTypes.string.isRequired,
    first_name: PropTypes.string.isRequired,
    last_name: PropTypes.string.isRequired
  }).isRequired,
  date: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired
};

export default UserNoteModal; 