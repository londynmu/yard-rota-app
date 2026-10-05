import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '../lib/NotificationContext';
import { getAdminMenuItems } from '../config/navIcons';
import NavIcon from './NavIcon';
import CountBadge from './ui/CountBadge';
import MissingPrecheckReminder from './User/MissingPrecheckReminder';
import { HOME_TAB_ACTIVE_CLASS, HOME_TAB_INACTIVE_CLASS } from './Home/homeTabStyles';

const PANEL_GUTTER_PX = 16;
const approvalsMenuItem = getAdminMenuItems(0).find((item) => item.id === 'approvals');

/**
 * Admin alerts: pending sign-ups and on-shift shunters without a pre-shift check.
 * `header` = icon button for top headers; `segment` = square that matches the mobile Home tab bar.
 */
const NotificationBell = ({ variant = 'header' }) => {
  const { pendingApprovals = 0, missingPrechecks = [], alertCount = 0 } = useNotifications() || {};
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, right: PANEL_GUTTER_PX });
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const { pathname } = useLocation();

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // position:fixed uses viewport coordinates - do NOT add scrollY
    setPanelPosition({
      top: rect.bottom + 8,
      right: Math.max(PANEL_GUTTER_PX, window.innerWidth - rect.right),
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  const buttonClassName = variant === 'segment'
    ? `relative flex shrink-0 items-center justify-center rounded-xl border px-2.5 transition-all duration-200 sm:px-3 ${isOpen ? HOME_TAB_ACTIVE_CLASS : HOME_TAB_INACTIVE_CLASS}`
    : `relative p-2 rounded-xl border transition-all text-charcoal ${
      isOpen
        ? 'bg-white/80 border-slate-200/60 shadow-sm'
        : 'border-transparent hover:bg-white/80 hover:border-slate-200/60 hover:shadow-sm'
    }`;

  const panel = isOpen ? createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      style={{
        position: 'fixed',
        top: `${panelPosition.top}px`,
        right: `${panelPosition.right}px`,
        width: `min(20rem, calc(100vw - ${PANEL_GUTTER_PX * 2}px))`,
        zIndex: 99999,
      }}
      className="rounded-2xl border border-slate-200/60 shadow-xl bg-white/95 backdrop-blur-md overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-200/60 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-charcoal">Notifications</p>
        {alertCount > 0 && (
          <span className="text-xs text-slate-500 tabular-nums">{alertCount} open</span>
        )}
      </div>

      <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain p-2 space-y-2">
        {pendingApprovals > 0 && (
          <Link
            to="/admin/approvals"
            onClick={close}
            className="flex items-center gap-2 px-2 py-1.5 bg-gradient-to-r from-slate-50 via-teal-50/40 to-slate-50 border border-slate-200/60 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 text-left group"
          >
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/90 border border-slate-200/60 shadow-sm transition-transform group-hover:scale-105 shrink-0">
              <NavIcon Icon={approvalsMenuItem.Icon} colorClass={approvalsMenuItem.colorClass} size="small" animate={true} />
            </div>
            <p className="flex-1 min-w-0 font-medium text-xs text-charcoal truncate">
              {pendingApprovals} user{pendingApprovals !== 1 ? 's' : ''} waiting for approval
            </p>
            <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        <MissingPrecheckReminder people={missingPrechecks} />

        {alertCount === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={buttonClassName}
        aria-label={alertCount > 0 ? `Notifications (${alertCount})` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <NavIcon
          Icon={Bell}
          colorClass={variant === 'segment' && !isOpen ? 'text-slate-600' : 'text-slate-800'}
          size={variant === 'segment' ? 'small' : 'default'}
          animate={true}
        />
        <CountBadge count={alertCount} className={variant === 'segment' ? '-top-1.5 -right-1.5' : '-top-0.5 -right-0.5'} />
      </button>
      {panel}
    </>
  );
};

NotificationBell.propTypes = {
  variant: PropTypes.oneOf(['header', 'segment']),
};

export default NotificationBell;
