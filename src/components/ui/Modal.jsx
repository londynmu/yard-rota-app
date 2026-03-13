import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

export default function Modal({ isOpen, onClose, children, className = "" }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}></div>
      <div className={`relative z-10 bg-rota-modal-bg rounded-xl shadow-lg border border-rota-modal-border p-5 max-w-lg w-full overflow-hidden ${className}`}>
        {children}
      </div>
    </div>,
    document.body
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

Modal.defaultProps = {
  className: ""
}; 