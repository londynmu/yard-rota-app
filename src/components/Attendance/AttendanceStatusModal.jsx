import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';

/**
 * Modal to mark attendance for a slot: No show / Sick / Late / Clear (Present).
 * Call onSave(null) for Clear.
 */
function AttendanceStatusModal({ open, onClose, slot, currentStatus, onSave, saving }) {
  if (!open || !slot) return null;

  const name = slot.profiles
    ? `${slot.profiles.first_name || ''} ${slot.profiles.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';
  const dateStr = slot.date ? format(new Date(slot.date), 'EEEE, d MMM yyyy') : '';
  const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
  const timeStr = slot.start_time && slot.end_time
    ? `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`
    : '';

  const options = [
    { value: 'no_show', label: 'No show' },
    { value: 'sick', label: 'Sick' },
    { value: 'late', label: 'Late' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-charcoal">Mark attendance</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-charcoal font-semibold mb-1">{name}</p>
        {dateStr && <p className="text-sm text-gray-600 mb-1">{dateStr}</p>}
        {timeStr && <p className="text-sm text-gray-600 mb-4">{timeStr}</p>}

        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => onSave(opt.value)}
              className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                currentStatus === opt.value
                  ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                  : 'text-charcoal hover:bg-gray-100 border-gray-300'
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(null)}
            className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
              !currentStatus
                ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                : 'text-charcoal hover:bg-gray-100 border-gray-300'
            } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            Clear (Present)
          </button>
        </div>
      </div>
    </div>
  );
}

AttendanceStatusModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  slot: PropTypes.shape({
    id: PropTypes.string,
    date: PropTypes.string,
    shift_type: PropTypes.string,
    start_time: PropTypes.string,
    end_time: PropTypes.string,
    profiles: PropTypes.shape({
      first_name: PropTypes.string,
      last_name: PropTypes.string,
    }),
  }),
  currentStatus: PropTypes.oneOf(['no_show', 'sick', 'late']),
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};

AttendanceStatusModal.defaultProps = {
  slot: null,
  currentStatus: null,
  saving: false,
};

export default AttendanceStatusModal;
