import React from 'react';
import PropTypes from 'prop-types';

export default function PerformItemRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer group">
      <div className="relative flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className={`w-6 h-6 rounded-md border-2 transition-all flex items-center justify-center ${
          checked 
            ? 'bg-green-500 border-green-500' 
            : 'border-gray-300 group-hover:border-gray-400'
        }`}>
          {checked && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className={`text-sm font-medium transition-colors ${
        checked ? 'text-green-700' : 'text-charcoal'
      }`}>
        {label}
      </span>
    </label>
  );
}

PerformItemRow.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};
