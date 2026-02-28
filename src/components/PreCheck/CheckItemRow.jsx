import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ImageUpload from './ImageUpload';

export default function CheckItemRow({ itemKey, label, tooltip, allowNa, value, onChange, notes, onNotesChange, images, onImagesChange, knownDefects = [], linkedDamageId, onLinkDefect }) {
  const [showConfirmOk, setShowConfirmOk] = useState(false);

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
    if (knownDefects.length > 0) {
      setShowConfirmOk(true);
      return;
    }
    onChange('ok');
  };

  const handleMarkNa = () => {
    blurActive();
    if (!allowNa) return;
    onChange(value === 'na' ? '' : 'na');
  };

  const cardBg =
    value === 'repair_needed' ? 'bg-red-50/50'
      : value === 'na' ? 'bg-slate-50/50'
      : 'bg-white';
  const cardBorder =
    value === 'repair_needed' ? 'border-red-200'
      : value === 'na' ? 'border-slate-200'
      : 'border-gray-200';

  return (
    <div
      id={itemKey ? `check-item-${itemKey}` : undefined}
      className={`rounded-xl border-2 ${cardBorder} ${cardBg} overflow-hidden shadow-sm`}
    >
      {/* Card content – top to bottom */}
      <div className="px-4 pt-4 pb-2">
        {/* 1. Label at top */}
        <h3
          className={`text-base font-semibold ${
            value === 'ok' ? 'text-green-700'
              : value === 'repair_needed' ? 'text-red-700'
              : value === 'na' ? 'text-slate-400 line-through'
              : 'text-charcoal'
          }`}
        >
          {label}
        </h3>

        {/* 2. Tooltip – what to check */}
        {tooltip && value !== 'na' && (
          <p className="text-xs text-gray-500 leading-snug mt-1">{tooltip}</p>
        )}

        {/* 3. Known defect (if any) */}
        {knownDefects.length > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <p className="font-semibold mb-1">Known defect – VMU is aware</p>
            {knownDefects.map((def) => (
              <p key={def.id} className="text-amber-800">
                On {def.date}, {def.reporterName} reported: {def.description}
              </p>
            ))}
          </div>
        )}

        {/* 4. Confirm OK when known defect – resolved? */}
        {showConfirmOk && knownDefects.length > 0 && value !== 'repair_needed' && (
          <div className="mt-3 px-3 py-3 rounded-lg bg-amber-50 border border-amber-300 text-xs">
            <p className="font-semibold text-amber-900 mb-2">
              A defect was previously reported for this item. Has it been resolved or no longer exists?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setShowConfirmOk(false); onChange('ok'); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700"
              >
                Yes – resolved / no longer exists
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmOk(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 5. Issue details when repair_needed */}
        {value === 'repair_needed' && (
          <div className="mt-3 space-y-2">
            {knownDefects.length > 0 && onLinkDefect && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">Same problem?</p>
                <div className="flex gap-3">
                  {knownDefects.length === 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onLinkDefect(linkedDamageId === knownDefects[0].id ? null : knownDefects[0].id)}
                        className={`flex-1 min-w-0 py-3 px-4 rounded-xl text-sm font-semibold transition-all border-2 ${
                          linkedDamageId === knownDefects[0].id
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        Yes – still exists
                      </button>
                      <button
                        type="button"
                        onClick={() => onLinkDefect(null)}
                        className={`flex-1 min-w-0 py-3 px-4 rounded-xl text-sm font-semibold transition-all border-2 ${
                          !linkedDamageId
                            ? 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        No – different problem
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {knownDefects.map((def) => (
                          <button
                            key={def.id}
                            type="button"
                            onClick={() => onLinkDefect(linkedDamageId === def.id ? null : def.id)}
                            className={`flex-1 min-w-0 py-2.5 px-3 rounded-xl text-sm font-medium border-2 ${
                              linkedDamageId === def.id ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            Still: {def.description.slice(0, 28)}{def.description.length > 28 ? '…' : ''}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => onLinkDefect(null)}
                        className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold border-2 ${
                          !linkedDamageId ? 'bg-red-100 text-red-800 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        New problem
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {!linkedDamageId && (
              <>
                <input
                  type="text"
                  value={notes || ''}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="What's wrong? (required)"
                  className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-red-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-300 focus:border-red-300 bg-white"
                />
                {onImagesChange && (
                  <ImageUpload
                    images={images || []}
                    onImagesChange={onImagesChange}
                    maxImages={2}
                    storageKey={itemKey ? `pending_photos_item_${itemKey}` : undefined}
                  />
                )}
              </>
            )}
            {linkedDamageId && (
              <p className="text-xs text-amber-700 italic">Same defect confirmed – no new report needed</p>
            )}
          </div>
        )}
      </div>

      {/* 6. Bottom: always 3 buttons – Warning (left), N/A (center), OK (right) */}
      <div className="px-4 pb-4 pt-2 flex items-center justify-between gap-2 border-t border-gray-100">
        {/* Issue / Warning – left */}
        <button
          type="button"
          onClick={handleMarkIssue}
          disabled={value === 'na'}
          className={`flex-1 min-w-0 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold transition-all overflow-hidden ${
            value === 'repair_needed'
              ? 'bg-red-500 text-white'
              : value === 'na'
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="truncate">Issue</span>
        </button>

        {/* N/A – center (grayed when not allowed) */}
        <button
          type="button"
          onClick={handleMarkNa}
          disabled={!allowNa}
          className={`flex-1 min-w-0 py-2.5 rounded-lg flex items-center justify-center text-sm font-semibold transition-all overflow-hidden ${
            allowNa
              ? value === 'na'
                ? 'bg-slate-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-slate-100 hover:text-slate-600'
              : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-60'
          }`}
        >
          <span className="truncate">N/A</span>
        </button>

        {/* OK – right */}
        <button
          type="button"
          onClick={handleMarkOk}
          disabled={value === 'na'}
          className={`flex-1 min-w-0 py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-sm font-semibold transition-all overflow-hidden ${
            value === 'ok'
              ? 'bg-green-500 text-white'
              : value === 'na'
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="truncate">OK</span>
        </button>
      </div>
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
  knownDefects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string,
    reporterName: PropTypes.string,
    date: PropTypes.string,
  })),
  linkedDamageId: PropTypes.string,
  onLinkDefect: PropTypes.func,
};
