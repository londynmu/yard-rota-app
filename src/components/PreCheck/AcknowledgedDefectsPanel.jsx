import React from 'react';
import PropTypes from 'prop-types';

export default function AcknowledgedDefectsPanel({ defects }) {
  if (!defects?.length) return null;

  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Known to VMU – no action needed
      </p>
      {defects.map((def) => (
        <div key={def.id} className="mt-1">
          <p className="text-sm">
            On {def.date}, {def.reporterName} reported: {def.description}
          </p>
          {def.imageUrls?.length > 0 && (
            <div className="mt-2 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
              <img
                src={def.imageUrls[0]}
                alt="Known defect"
                className="w-full max-w-full h-auto max-h-[40vh] object-contain"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

AcknowledgedDefectsPanel.propTypes = {
  defects: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string,
    reporterName: PropTypes.string,
    date: PropTypes.string,
    imageUrls: PropTypes.arrayOf(PropTypes.string),
  })),
};
