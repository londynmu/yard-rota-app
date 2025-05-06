import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

export default function Notification({ 
  isVisible, 
  message, 
  type = 'success', 
  onClose,
  autoClose = true,
  autoCloseTime = 3000
}) {
  useEffect(() => {
    if (isVisible && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseTime);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoClose, autoCloseTime, onClose]);
  
  if (!isVisible || !message) return null;
  
  return ReactDOM.createPortal(
    <div className="fixed bottom-5 left-0 right-0 flex justify-center items-center z-50 px-4">
      <div 
        className={`
          py-3 px-5 rounded-lg shadow-lg max-w-md w-full flex items-center justify-between 
          animate-fade-in-up backdrop-blur-sm
          ${type === 'success' 
            ? 'bg-green-500/90 text-white border border-green-400/50' 
            : 'bg-red-500/90 text-white border border-red-400/50'}
        `}
      >
        <span>{message}</span>
        <button 
          onClick={onClose}
          className="ml-3 text-white/80 hover:text-white transition-colors"
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  );
}

Notification.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  message: PropTypes.string,
  type: PropTypes.oneOf(['success', 'error']),
  onClose: PropTypes.func.isRequired,
  autoClose: PropTypes.bool,
  autoCloseTime: PropTypes.number
};

Notification.defaultProps = {
  message: '',
  type: 'success',
  autoClose: true,
  autoCloseTime: 3000
}; 