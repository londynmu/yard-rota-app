import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function Modal({
  isOpen,
  onClose,
  children,
  className = '',
  overlayClassName = 'z-50',
  ariaLabelledBy,
  ariaLabel,
}) {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const labelledBy = ariaLabelledBy || null;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const root = dialogRef.current;
      if (!root) return;
      const preferred = root.querySelector('[data-autofocus]');
      const focusables = [...root.querySelectorAll(FOCUSABLE_SELECTOR)];
      const target = preferred || focusables[0] || root;
      if (target instanceof HTMLElement) {
        target.focus({ preventScroll: true });
      }
    };

    const timer = window.setTimeout(focusFirst, 0);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => el instanceof HTMLElement && !el.hasAttribute('disabled'),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return undefined;
    const prev = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      prev.focus({ preventScroll: true });
    }
    return undefined;
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 ${overlayClassName} flex items-center justify-center p-4`}
      role="presentation"
    >
      <div
        className="fixed inset-0 bg-rota-modal-overlay"
        onClick={() => onCloseRef.current()}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || undefined}
        aria-label={!labelledBy ? ariaLabel : undefined}
        tabIndex={-1}
        className={`relative z-10 bg-rota-modal-bg rounded-xl shadow-lg border border-rota-modal-border p-5 max-w-lg w-full overflow-hidden outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  overlayClassName: PropTypes.string,
  ariaLabelledBy: PropTypes.string,
  ariaLabel: PropTypes.string,
};

Modal.defaultProps = {
  className: '',
  overlayClassName: 'z-50',
  ariaLabelledBy: undefined,
  ariaLabel: undefined,
};
