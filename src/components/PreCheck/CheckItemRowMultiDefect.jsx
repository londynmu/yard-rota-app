import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import ImageUpload from './ImageUpload';

const NEW_DEFECT_KEY = '::new';

export default function CheckItemRowMultiDefect({
  itemKey,
  item,
  defects,
  checkItems,
  onCheckChange,
  onLinkDefect,
  onNotesChange,
  onMarkResolved,
  onImagesChange,
  markedResolvedDamageIds,
  onReload,
  cardId,
  storageKey,
}) {
  const notesTextareaRef = useRef(null);

  const blurActive = () => {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  };

  const isPendingResolved = (defId) => markedResolvedDamageIds.includes(defId);

  const newDefectStateKey = `${itemKey}${NEW_DEFECT_KEY}`;
  const showNewDefectForm = Boolean(checkItems[newDefectStateKey]?.status === 'repair_needed');

  const allDefectsResolved = defects.every(d => isPendingResolved(d.id));
  const hasAnySameProblem = defects.some(d => {
    const sk = `${itemKey}::${d.id}`;
    const ci = checkItems[sk];
    return ci?.status === 'repair_needed' && ci?.linkedDamageId === d.id;
  });
  const showReloadInHeader = Boolean(onReload) && (allDefectsResolved || hasAnySameProblem || showNewDefectForm);

  const handleNewDefectClick = () => {
    blurActive();
    onCheckChange(newDefectStateKey, 'repair_needed');
    onLinkDefect(newDefectStateKey, null);
  };

  const handleLinkDefect = (stateKey, damageId) => {
    blurActive();
    onLinkDefect(stateKey, damageId);
    if (damageId) onCheckChange(stateKey, 'repair_needed');
  };

  useEffect(() => {
    const el = notesTextareaRef.current;
    if (!el || !showNewDefectForm) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [checkItems[newDefectStateKey]?.notes, showNewDefectForm]);

  const cardHasIssue = hasAnySameProblem || showNewDefectForm;
  const cardBg = cardHasIssue ? 'bg-red-50/50' : (allDefectsResolved ? 'bg-green-50' : 'bg-white');
  const cardBorder = cardHasIssue ? 'border-red-200' : (allDefectsResolved ? 'border-green-200' : 'border-gray-200');

  const isCompleted = allDefectsResolved;

  return (
    <div
      id={cardId || `check-item-${itemKey}`}
      className={`rounded-xl border-2 ${cardBorder} ${cardBg} overflow-hidden shadow-sm`}
    >
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-charcoal">{item.label}</h3>
            {item.tooltip && (
              <p className="text-sm text-gray-600 leading-snug mt-1">{item.tooltip}</p>
            )}
          </div>
          {showReloadInHeader && onReload && (
            <button
              type="button"
              onClick={() => onReload(itemKey)}
              className="p-2 rounded-full text-charcoal hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Reload"
              aria-label="Reload"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>

        <div
          className={`transition-all duration-300 ease-out overflow-hidden ${isCompleted ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}
        >
        {defects.map((def) => {
          const stateKey = `${itemKey}::${def.id}`;
          const ci = checkItems[stateKey] || {};
          const isFixed = isPendingResolved(def.id);
          const isSameProblem = ci.status === 'repair_needed' && ci.linkedDamageId === def.id;

          return (
            <div
              key={def.id}
              className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900"
            >
              <p className="text-sm text-amber-800">
                On {def.date}, {def.reporterName} reported: {def.description}
              </p>
              {def.imageUrls?.length > 0 && (
                <div className="mt-2 rounded-lg overflow-hidden bg-amber-100/50 border border-amber-200">
                  <img
                    src={def.imageUrls[0]}
                    alt="Defect"
                    className="w-full max-w-full h-auto max-h-[40vh] object-contain"
                  />
                </div>
              )}
              <div className="flex gap-2 mt-2">
                {isFixed ? (
                  <span className="inline-flex flex-1 justify-center items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-100 text-green-800 border border-green-200">
                    Fixed (on submit)
                  </span>
                ) : isSameProblem ? (
                  <span className="inline-flex flex-1 justify-center items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 text-white border border-amber-500">
                    Same problem
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        blurActive();
                        onMarkResolved(def.id, itemKey);
                      }}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200 hover:bg-green-200 transition-colors"
                    >
                      Fixed?
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        blurActive();
                        handleLinkDefect(stateKey, def.id);
                      }}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors"
                    >
                      Same problem
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {showNewDefectForm && (
          <div className="mt-3 space-y-2">
            <textarea
              ref={notesTextareaRef}
              value={checkItems[newDefectStateKey]?.notes || ''}
              onChange={(e) => onNotesChange(newDefectStateKey, e.target.value)}
              onInput={(e) => {
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
              }}
              placeholder="What's wrong? (required)"
              rows={4}
              className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-red-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-300 focus:border-red-300 bg-white resize-y min-h-[6rem] max-h-[300px]"
            />
            {onImagesChange && (
              <ImageUpload
                images={checkItems[newDefectStateKey]?.images || []}
                onImagesChange={(imgs) => onImagesChange(newDefectStateKey, imgs)}
                maxImages={2}
                storageKey={storageKey || `pending_photos_item_${itemKey}__new`}
                hideGallery={true}
              />
            )}
          </div>
        )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2 flex flex-col gap-2 border-t border-gray-100">
        {!showNewDefectForm && (
          <button
            type="button"
            onClick={handleNewDefectClick}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold border-2 bg-red-100 text-red-800 border-red-200 hover:bg-red-200 transition-colors"
          >
            Add new defect?
          </button>
        )}
        {showNewDefectForm && (
          <p className="text-xs text-amber-700 italic">Describe the new defect above and add photos if needed</p>
        )}
      </div>
    </div>
  );
}

CheckItemRowMultiDefect.propTypes = {
  itemKey: PropTypes.string.isRequired,
  item: PropTypes.shape({
    key: PropTypes.string,
    label: PropTypes.string.isRequired,
    tooltip: PropTypes.string,
  }).isRequired,
  defects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string,
    reporterName: PropTypes.string,
    date: PropTypes.string,
    imageUrls: PropTypes.arrayOf(PropTypes.string),
  })).isRequired,
  checkItems: PropTypes.object.isRequired,
  onCheckChange: PropTypes.func.isRequired,
  onLinkDefect: PropTypes.func.isRequired,
  onNotesChange: PropTypes.func.isRequired,
  onMarkResolved: PropTypes.func.isRequired,
  onImagesChange: PropTypes.func,
  markedResolvedDamageIds: PropTypes.arrayOf(PropTypes.string),
  onReload: PropTypes.func,
  cardId: PropTypes.string,
  storageKey: PropTypes.string,
};
