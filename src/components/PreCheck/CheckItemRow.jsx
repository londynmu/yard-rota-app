import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageUpload from './ImageUpload';

export default function CheckItemRow({ label, tooltip, value, onChange, notes, onNotesChange, images, onImagesChange }) {
  const [expanded, setExpanded] = useState(false);

  const handleMarkIssue = () => {
    if (value === 'repair_needed') {
      // Toggle off - clear issue
      onChange('ok');
      setExpanded(false);
    } else {
      onChange('repair_needed');
      setExpanded(true);
    }
  };

  const handleMarkOk = () => {
    onChange('ok');
    setExpanded(false);
  };

  return (
    <div className={`border-b border-gray-100 last:border-b-0 ${value === 'repair_needed' ? 'bg-red-50/50' : ''}`}>
      {/* Compact row: Label ... Warning OK */}
      <div className="flex items-center gap-2 py-2 px-1">
        {/* Label (left) */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${
            value === 'ok' ? 'text-green-700' : value === 'repair_needed' ? 'text-red-700' : 'text-charcoal'
          }`}>
            {label}
          </span>
          {tooltip && (
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{tooltip}</p>
          )}
        </div>

        {/* Issue / Warning button */}
        <button
          type="button"
          onClick={handleMarkIssue}
          className={`w-8 h-8 mr-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            value === 'repair_needed'
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 text-gray-300 hover:bg-red-50 hover:text-red-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </button>

        {/* OK / Check button */}
        <button
          type="button"
          onClick={handleMarkOk}
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            value === 'ok'
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 text-gray-300 hover:bg-green-50 hover:text-green-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      {/* Expanded issue details */}
      {value === 'repair_needed' && expanded && (
        <div className="px-2 pb-3 space-y-2">
          <input
            type="text"
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="What's wrong? (optional)"
            className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-300 focus:border-red-300 bg-white"
          />
          {onImagesChange && (
            <ImageUpload
              images={images || []}
              onImagesChange={onImagesChange}
              maxImages={2}
            />
          )}
        </div>
      )}

      {/* Collapsed issue indicator */}
      {value === 'repair_needed' && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-2 pb-2 text-left"
        >
          <div className="flex items-center gap-2 text-xs text-red-600">
            {notes && <span className="truncate">{notes}</span>}
            {images?.length > 0 && <span>{images.length} photo(s)</span>}
            {!notes && !images?.length && <span className="text-red-400">Tap to add details...</span>}
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}

CheckItemRow.propTypes = {
  label: PropTypes.string.isRequired,
  tooltip: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  notes: PropTypes.string,
  onNotesChange: PropTypes.func.isRequired,
  images: PropTypes.array,
  onImagesChange: PropTypes.func,
};
