import React from 'react';
import Modal from './Modal';
import PropTypes from 'prop-types';

export default function ConfirmDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "OK", 
  cancelText = "Cancel",
  isDestructive = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center sm:text-left">
        <h3 className="text-xl font-semibold mb-2 text-charcoal dark:text-white">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-black dark:border-white rounded-lg text-charcoal dark:text-white transition-colors order-2 sm:order-1"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg transition-colors order-1 sm:order-2 ${
              isDestructive 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-black'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  confirmText: PropTypes.string,
  cancelText: PropTypes.string,
  isDestructive: PropTypes.bool
};

ConfirmDialog.defaultProps = {
  confirmText: "OK",
  cancelText: "Cancel",
  isDestructive: false
}; 