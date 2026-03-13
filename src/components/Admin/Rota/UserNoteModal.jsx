import React from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';

const UserNoteModal = ({ note, employee, date, onClose, onConfirm }) => {
  // Format the date for display
  const formattedDate = format(new Date(date), 'dd/MM/yyyy');

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-rota-modal-border px-5 py-4">
          <h3 className="text-xl font-semibold text-rota-text-primary">User Note</h3>
          <button 
            onClick={onClose}
            className="text-rota-text-muted transition hover:text-rota-text-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-rota-alert-error-border bg-rota-alert-error-bg p-4">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0 text-rota-alert-error-text" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-semibold text-rota-alert-error-text">Important note for {formattedDate}</p>
                <p className="mt-1 text-sm text-rota-alert-error-text">
                  {employee.first_name} {employee.last_name} left the following note:
                </p>
              </div>
            </div>
          </div>
          
          <div className="rounded-lg border border-rota-modal-border bg-rota-day-other-bg-from p-4">
            <p className="whitespace-pre-wrap text-sm text-rota-text-primary">{note}</p>
          </div>
          
          <div className="rounded-lg border border-rota-modal-border bg-rota-day-other-bg-from p-3">
            <p className="text-sm text-rota-text-muted">
              This note may indicate availability constraints or special circumstances. Please consider it before assigning the employee to this shift.
            </p>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 border-t border-rota-modal-border bg-rota-day-other-bg-from px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border-2 border-rota-btn-outline-border px-4 py-2 text-rota-btn-outline-text hover:bg-rota-day-other-bg-from"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md border-2 border-rota-text-primary bg-rota-modal-bg px-4 py-2 text-rota-text-primary hover:bg-rota-day-other-bg-from"
          >
            Assign Anyway
          </button>
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