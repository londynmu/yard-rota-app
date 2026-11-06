import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import RotaWhatsAppSendPanel from './RotaWhatsAppSendPanel';

/**
 * Toolbar WhatsApp send control — same portal-modal pattern as ExportRotaButton.
 */
export default function RotaWhatsAppSendButton({ weekStart }) {
  const [showModal, setShowModal] = useState(false);

  const openModal = () => setShowModal(true);
  const closeModal = () => setShowModal(false);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="h-full w-full flex items-center justify-center text-rota-text-primary hover:opacity-70 transition-opacity"
        title="Send rota on WhatsApp"
        aria-label="Send rota on WhatsApp"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.92L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </button>

      {showModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <div className="relative mx-auto my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-rota-modal-border bg-rota-modal-bg shadow-2xl">
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
            <div className="p-4 sm:p-6">
              <RotaWhatsAppSendPanel weekStart={weekStart} onClose={closeModal} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

RotaWhatsAppSendButton.propTypes = {
  weekStart: PropTypes.oneOfType([
    PropTypes.instanceOf(Date),
    PropTypes.string,
  ]).isRequired,
};
