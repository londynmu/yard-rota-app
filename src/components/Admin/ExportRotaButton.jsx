import React, { useState } from 'react';
import ExportRota from './ExportRota';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const ExportRotaButton = ({
  iconOnly = false,
  weekStart = null,
  pendingCount = 0,
  initialTab = 'weekly',
  onBaselineChanged = null,
  className = '',
  label = 'Send to agency',
}) => {
  const [showModal, setShowModal] = useState(false);

  const openExportModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const resolvedTab = pendingCount > 0 ? 'additional' : initialTab;
  const exportTitle = pendingCount > 0
    ? `${label} (${pendingCount} additional bookings)`
    : label;

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={openExportModal}
          className={`h-full w-full flex items-center justify-center text-rota-text-primary hover:opacity-70 transition-opacity ${className}`}
          title={exportTitle}
          aria-label={exportTitle}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={openExportModal}
          className={`admin-btn h-11 gap-2 !px-4 !text-sm ${className}`}
          title={exportTitle}
          aria-label={exportTitle}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>{label}</span>
        </button>
      )}

      {showModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <div className="relative mx-auto my-auto flex h-[min(90vh,40.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg shadow-2xl">
            <div className="absolute right-4 top-4 z-10">
              <button
                type="button"
                onClick={closeModal}
                className="text-rota-text-muted transition hover:text-rota-text-primary focus:outline-none"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
              <ExportRota
                initialTab={resolvedTab}
                initialStartDate={weekStart}
                onBaselineChanged={onBaselineChanged}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

ExportRotaButton.propTypes = {
  iconOnly: PropTypes.bool,
  weekStart: PropTypes.instanceOf(Date),
  pendingCount: PropTypes.number,
  initialTab: PropTypes.oneOf(['weekly', 'additional']),
  onBaselineChanged: PropTypes.func,
  className: PropTypes.string,
  label: PropTypes.string,
};

ExportRotaButton.defaultProps = {
  iconOnly: false,
  weekStart: null,
  pendingCount: 0,
  initialTab: 'weekly',
  onBaselineChanged: null,
  className: '',
  label: 'Send to agency',
};

export default ExportRotaButton;
