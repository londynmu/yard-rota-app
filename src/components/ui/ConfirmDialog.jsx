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
        <h3 className="text-xl font-semibold mb-2 text-rota-text-primary">{title}</h3>
        <p className="text-rota-text-muted mb-6">{message}</p>
        
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border-2 border-rota-btn-outline-border bg-white text-rota-btn-outline-text hover:bg-rota-day-other-bg-from transition-colors order-2 sm:order-1"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-lg border-2 transition-colors order-1 sm:order-2 ${
              isDestructive
                ? 'border-rota-btn-destructive-border bg-white text-rota-btn-destructive-text hover:bg-rota-btn-destructive-hover-bg'
                : 'border-rota-text-primary bg-white text-rota-text-primary hover:bg-rota-day-other-bg-from'
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