import React from 'react';
import PropTypes from 'prop-types';

export default function CheckItemRow({ label, value, onChange, notes, onNotesChange }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="flex-1 text-sm font-medium text-charcoal min-w-0">
        {label}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange('ok')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
            value === 'ok'
              ? 'bg-green-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'
          }`}
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => onChange('repair_needed')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
            value === 'repair_needed'
              ? 'bg-red-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          Repair
        </button>
      </div>
      {value === 'repair_needed' && (
        <input
          type="text"
          value={notes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Describe the issue..."
          className="w-full sm:w-48 text-sm border border-red-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-red-300 focus:border-red-300 bg-red-50"
        />
      )}
    </div>
  );
}

CheckItemRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  notes: PropTypes.string,
  onNotesChange: PropTypes.func.isRequired,
};
