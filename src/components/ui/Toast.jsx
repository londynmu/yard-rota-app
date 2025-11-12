import React from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const Toast = ({ message, type, onClose }) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-white border-l-4 border-green-500 text-charcoal';
      case 'error':
        return 'bg-white border-l-4 border-red-500 text-charcoal';
      case 'warning':
        return 'bg-white border-l-4 border-yellow-500 text-charcoal';
      case 'info':
      default:
        return 'bg-white border-l-4 border-blue-500 text-charcoal';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const content = (
    <div className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10" />
      {/* Toast */}
      <div className={`relative pointer-events-auto px-6 py-4 rounded-lg shadow-lg border border-gray-200 animate-fade-scale ${getTypeStyles()}`}>
        <div className="flex items-center space-x-3">
          {getIcon()}
          <span className="text-base font-medium whitespace-pre-wrap">{message}</span>
          <button
            onClick={onClose}
            className="ml-2 text-gray-400 hover:text-charcoal transition-colors"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

Toast.propTypes = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  onClose: PropTypes.func.isRequired
};

Toast.defaultProps = {
  type: 'info'
};

export default Toast; 