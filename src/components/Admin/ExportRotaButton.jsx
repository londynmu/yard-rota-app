import React, { useState } from 'react';
import ExportRota from './ExportRota';
import { createPortal } from 'react-dom';

const ExportRotaButton = () => {
  const [showModal, setShowModal] = useState(false);

  const openExportModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const ModalContent = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/70 p-4">
      <div className="relative mx-auto my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="absolute right-4 top-4">
          <button 
            onClick={closeModal}
            className="text-gray-500 transition hover:text-charcoal focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-1">
          <ExportRota onClose={closeModal} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={openExportModal}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-charcoal transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:w-auto"
        title="Export Schedule"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-4 w-4" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
          />
        </svg>
        <span className="text-sm">Export</span>
      </button>

      {showModal && createPortal(<ModalContent />, document.body)}
    </>
  );
};

export default ExportRotaButton; 