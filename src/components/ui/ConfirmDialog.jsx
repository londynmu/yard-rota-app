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
  isDestructive = false,
  overlayClassName = "z-50",
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} overlayClassName={overlayClassName}>
      <div className="text-center sm:text-left">
        <h3 className="text-xl font-semibold mb-2 text-rota-text-primary">{title}</h3>
        <p className="text-rota-text-muted mb-6">{message}</p>
        
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="order-2 inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-rota-btn-outline-border bg-white px-4 py-2 text-rota-btn-outline-text transition-colors hover:bg-rota-day-other-bg-from motion-reduce:transition-none sm:order-1"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`order-1 inline-flex min-h-11 items-center justify-center rounded-lg border-2 px-4 py-2 transition-colors motion-reduce:transition-none sm:order-2 ${
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
  isDestructive: PropTypes.bool,
  overlayClassName: PropTypes.string
};

ConfirmDialog.defaultProps = {
  confirmText: "OK",
  cancelText: "Cancel",
  isDestructive: false,
  overlayClassName: "z-50"
}; 