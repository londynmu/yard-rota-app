import React from 'react';
import PropTypes from 'prop-types';
import ImageUpload from './ImageUpload';

export default function CheckItemRow({ itemKey, label, tooltip, allowNa, value, onChange, notes, onNotesChange, images, onImagesChange }) {
  const blurActive = () => {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  };

  const handleMarkIssue = () => {
    blurActive();
    onChange(value === 'repair_needed' ? 'ok' : 'repair_needed');
  };

  const handleMarkOk = () => {
    blurActive();
    onChange('ok');
  };

  const handleMarkNa = () => {
    blurActive();
    onChange(value === 'na' ? '' : 'na');
  };

  return (
    <div id={itemKey ? `check-item-${itemKey}` : undefined} className={`border-b border-gray-100 last:border-b-0 ${
      value === 'repair_needed' ? 'bg-red-50/50' : value === 'na' ? 'bg-slate-50/50' : ''
    }`}>
      {/* Row: Label ... N/A Warning OK */}
      <div className="flex items-center gap-3 py-3 px-2">
        {/* Label (left) */}
        <div className="flex-1 min-w-0">
          <span className={`text-base font-semibold ${
            value === 'ok' ? 'text-green-700'
              : value === 'repair_needed' ? 'text-red-700'
              : value === 'na' ? 'text-slate-400 line-through'
              : 'text-charcoal'
          }`}>
            {label}
          </span>
          {tooltip && value !== 'na' && (
            <p className="text-xs text-gray-400 leading-snug mt-0.5">{tooltip}</p>
          )}
        </div>

        {/* N/A button (only if allowed) */}
        {allowNa && (
          <button
            type="button"
            onClick={handleMarkNa}
            className={`px-2 py-1.5 text-xs font-bold rounded-lg flex-shrink-0 transition-all ${
              value === 'na'
                ? 'bg-slate-500 text-white'
                : 'bg-gray-100 text-gray-400 hover:bg-slate-100 hover:text-slate-500'
            }`}
          >
            N/A
          </button>
        )}

        {/* Issue / Warning button */}
        <button
          type="button"
          onClick={handleMarkIssue}
          disabled={value === 'na'}
          className={`w-10 h-10 mr-4 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            value === 'repair_needed'
              ? 'bg-red-500 text-white'
              : value === 'na'
              ? 'bg-gray-50 text-gray-200 cursor-not-allowed'
              : 'bg-gray-100 text-gray-300 hover:bg-red-50 hover:text-red-400'
          }`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </button>

        {/* OK / Check button */}
        <button
          type="button"
          onClick={handleMarkOk}
          disabled={value === 'na'}
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
            value === 'ok'
              ? 'bg-green-500 text-white'
              : value === 'na'
              ? 'bg-gray-50 text-gray-200 cursor-not-allowed'
              : 'bg-gray-100 text-gray-300 hover:bg-green-50 hover:text-green-400'
          }`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>

      {/* Issue details always visible when repair_needed */}
      {value === 'repair_needed' && (
        <div className="px-2 pb-3 space-y-2">
          <input
            type="text"
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="What's wrong? (required)"
            className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-300 focus:border-red-300 bg-white"
          />
          {onImagesChange && (
            <ImageUpload
              images={images || []}
              onImagesChange={onImagesChange}
              maxImages={2}
              storageKey={itemKey ? `pending_photos_item_${itemKey}` : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

CheckItemRow.propTypes = {
  itemKey: PropTypes.string,
  label: PropTypes.string.isRequired,
  tooltip: PropTypes.string,
  allowNa: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  notes: PropTypes.string,
  onNotesChange: PropTypes.func.isRequired,
  images: PropTypes.array,
  onImagesChange: PropTypes.func,
};
