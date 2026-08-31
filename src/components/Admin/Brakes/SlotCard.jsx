import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 160;
const MENU_ESTIMATED_HEIGHT = 88;

const formatStartTime = (value) => {
  if (!value) return '??:??';
  return String(value).substring(0, 5);
};

const calculateEndTime = (startTime, durationMinutes) => {
  try {
    const [hours, minutes] = String(startTime).split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    date.setMinutes(date.getMinutes() + durationMinutes);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '??:??';
  }
};

const getInitials = (name) =>
  String(name || '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

const SlotCard = ({
  slot,
  assignedStaff,
  onSlotClick,
  onEditClick,
  onDeleteClick,
  onRemoveStaffClick,
  isAdmin,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuButtonRef = useRef(null);
  const menuRef = useRef(null);

  const handleMenuButtonClick = (e) => {
    e.stopPropagation();
    if (isMenuOpen) {
      setIsMenuOpen(false);
      return;
    }
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - MENU_WIDTH - margin);
    const left = Math.min(Math.max(margin, rect.right - MENU_WIDTH), maxLeft);
    let top = rect.bottom + 6;
    if (top + MENU_ESTIMATED_HEIGHT > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - MENU_ESTIMATED_HEIGHT - 6);
    }
    setMenuPosition({ x: left, y: top });
    setIsMenuOpen(true);
  };

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (menuButtonRef.current?.contains(event.target)) return;
      setIsMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    const closeMenu = () => setIsMenuOpen(false);

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [isMenuOpen]);

  const handleCardClick = (e) => {
    if (e.target.closest('.remove-staff-button') || e.target.closest('.slot-menu-button')) {
      return;
    }
    onSlotClick(slot);
  };

  return (
    <div
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-gray-300 bg-white p-3 shadow-sm transition-all duration-200 hover:border-gray-500 hover:shadow-md"
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-sm font-bold tabular-nums text-gray-900">
            {formatStartTime(slot.start_time)} - {calculateEndTime(slot.start_time, slot.duration_minutes)}
          </span>
          <span className="text-[10px] font-semibold text-gray-500">{slot.duration_minutes}m</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-400 bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-charcoal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {assignedStaff.length}
          </span>
          {isAdmin && (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={handleMenuButtonClick}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              aria-label="Slot actions"
              title="Slot actions"
              className="slot-menu-button flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-charcoal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {assignedStaff.length > 0 ? (
        <div className="space-y-1">
          {assignedStaff.map((staff) => (
            <div
              key={staff.id}
              className="group flex items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-100 px-2 py-1"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white">
                  {getInitials(staff.user_name)}
                </div>
                <span className="min-w-0 break-words text-xs font-semibold text-charcoal">{staff.user_name}</span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveStaffClick(staff);
                  }}
                  className="remove-staff-button flex-shrink-0 rounded-full p-1 text-red-600 transition-all duration-200 hover:bg-red-600 hover:text-white"
                  aria-label={`Remove ${staff.user_name}`}
                  title={`Remove ${staff.user_name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs italic text-gray-400">Tap to assign</span>
      )}

      {isAdmin && isMenuOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99998] w-40 overflow-hidden rounded-xl border border-gray-300 bg-white py-1 shadow-lg"
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Slot actions"
            tabIndex={-1}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false);
                onEditClick(slot);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit slot
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false);
                onDeleteClick(slot);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete slot
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

SlotCard.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string,
    start_time: PropTypes.string.isRequired,
    duration_minutes: PropTypes.number.isRequired,
  }).isRequired,
  assignedStaff: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      user_name: PropTypes.string.isRequired,
      user_id: PropTypes.string,
    })
  ).isRequired,
  onSlotClick: PropTypes.func.isRequired,
  onEditClick: PropTypes.func.isRequired,
  onDeleteClick: PropTypes.func.isRequired,
  onRemoveStaffClick: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
};

export default SlotCard;
