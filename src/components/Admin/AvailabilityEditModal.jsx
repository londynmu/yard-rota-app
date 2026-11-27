import React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';

export default function AvailabilityEditModal({ date, user, initialData, onSave, onClose }) {
  const [status, setStatus] = useState('available');
  const [comment, setComment] = useState('');
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    if (initialData) {
      setStatus(initialData.status || 'available');
      setComment(initialData.comment || '');
    } else {
      setStatus('available');
      setComment('');
    }
  }, [initialData]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();

    onSave({
      date: format(date, 'yyyy-MM-dd'),
      status,
      comment,
      userId: user.id,
    });

    onClose();
  };

  const dayOfWeek = format(date, 'EEEE');
  const displayName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : user.name || user.email || 'User';

  const statusButtonClass = (value, activeClass, idleClass) =>
    `inline-flex min-h-11 items-center justify-center rounded-xl px-2 py-3 text-sm font-semibold transition-all motion-reduce:transition-none ${
      status === value ? activeClass : idleClass
    }`;

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-auto bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="admin-modal-panel mx-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <h2 id={titleId} className="mb-1 text-sm font-semibold text-charcoal">
              Edit Availability
            </h2>
            <p className="text-sm font-medium text-gray-600">{displayName}</p>
            <p className="mt-1 text-sm text-gray-500">
              {format(date, 'MMM d, yyyy')} - {dayOfWeek}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="admin-icon-btn min-h-11 min-w-11 flex-shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <fieldset className="mb-5">
            <legend className="mb-3 block text-sm font-semibold text-gray-700">
              Availability Status
            </legend>
            <div className="grid grid-cols-3 gap-3" role="group" aria-label="Availability status">
              <button
                type="button"
                aria-pressed={status === 'available'}
                onClick={() => setStatus('available')}
                className={statusButtonClass(
                  'available',
                  'bg-green-500 text-white shadow-lg ring-2 ring-green-400 ring-offset-2',
                  'border-2 border-green-300 bg-green-100 text-green-700 hover:bg-green-200',
                )}
              >
                Available
              </button>

              <button
                type="button"
                aria-pressed={status === 'unavailable'}
                onClick={() => setStatus('unavailable')}
                className={statusButtonClass(
                  'unavailable',
                  'bg-red-500 text-white shadow-lg ring-2 ring-red-400 ring-offset-2',
                  'border-2 border-red-300 bg-red-100 text-red-700 hover:bg-red-200',
                )}
              >
                Unavailable
              </button>

              <button
                type="button"
                aria-pressed={status === 'holiday'}
                onClick={() => setStatus('holiday')}
                className={statusButtonClass(
                  'holiday',
                  'bg-blue-500 text-white shadow-lg ring-2 ring-blue-400 ring-offset-2',
                  'border-2 border-blue-300 bg-blue-100 text-blue-700 hover:bg-blue-200',
                )}
              >
                Holiday
              </button>
            </div>
          </fieldset>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-semibold text-gray-700" htmlFor="availability-comment">
              Comments (optional)
            </label>
            <textarea
              id="availability-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="admin-input min-h-[5.5rem] resize-none"
              rows="3"
              placeholder="Add any notes about this day..."
            />
          </div>

          <div className="admin-modal-footer !border-0 !px-0 !pb-0">
            <button
              type="button"
              onClick={onClose}
              className="admin-btn-muted min-h-11"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn min-h-11"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

AvailabilityEditModal.propTypes = {
  date: PropTypes.instanceOf(Date).isRequired,
  user: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    email: PropTypes.string,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
  }).isRequired,
  initialData: PropTypes.shape({
    status: PropTypes.string,
    comment: PropTypes.string,
  }),
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
