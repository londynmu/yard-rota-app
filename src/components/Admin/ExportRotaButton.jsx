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
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden">
      <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto mx-auto my-auto border border-slate-700/40">
        <div className="absolute top-4 right-4">
          <button 
            onClick={closeModal}
            className="text-white/80 hover:text-white focus:outline-none"
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
        className="w-full h-full flex items-center justify-center"
        title="Export Schedule"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-4 w-4 mr-1" 
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