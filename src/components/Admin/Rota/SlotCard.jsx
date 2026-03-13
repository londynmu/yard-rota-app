import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../lib/supabaseClient';
import { createPortal } from 'react-dom';

// Same as AssignModal: time string (HH:MM or HH:MM:SS) to minutes since midnight
const timeToMinutes = (timeString) => {
  const [hours, minutes] = (timeString || '').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const SlotCard = ({ 
  slot, 
  handleOpenAssignModal, 
  handleDeleteSlot, 
  handleOpenEditModal,
  isAdmin 
}) => {
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(slot.status === 'available');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Available-for-slot tooltip
  const [showAvailableTooltip, setShowAvailableTooltip] = useState(false);
  const [availableForSlot, setAvailableForSlot] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const lastFetchedSlotIdRef = useRef(null);
  const cardRef = useRef(null);

  const TOOLTIP_OFFSET = 14;
  
  // Check if slot has assigned employees array
  const assignedCount = slot.assigned_employees ? slot.assigned_employees.length : 0;
  const fillPercentage = (assignedCount / slot.capacity) * 100;
  const isSlotFull = assignedCount >= slot.capacity;
  
  useEffect(() => {
    const fetchUsers = async () => {
      if (!slot.assigned_employees || slot.assigned_employees.length === 0) {
        setAssignedUsers([]);
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', slot.assigned_employees);
          
        if (error) throw error;
        setAssignedUsers(data || []);
      } catch (err) {
        console.error('Error fetching assigned users:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUsers();
  }, [slot.assigned_employees]);

  // Update isAvailable when slot status changes
  useEffect(() => {
    setIsAvailable(slot.status === 'available');
  }, [slot.status]);

  // Removed debug useEffect

  const fetchAvailableForSlot = async () => {
    const slotDate = slot.date;
    const assignedSet = new Set(slot.assigned_employees || []);
    const normalizedSlotLocation = (slot?.location || '').trim().toLowerCase();
    const normalizedSlotShift = (slot?.shift_type || '').trim().toLowerCase();

    const normalizePref = (v) => (v || '').trim().toLowerCase() || '';
    const matchesLocation = (preferredLocation) => {
      const p = normalizePref(preferredLocation);
      if (!p || ['both', 'all', 'any'].includes(p)) return true;
      return p === normalizedSlotLocation;
    };
    const matchesShift = (shiftPreference) => {
      if (!shiftPreference) return true;
      return normalizePref(shiftPreference) === normalizedSlotShift;
    };

    try {
      let minBreakMinutes = 60;
      const { data: settingsData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'min_break_between_slots')
        .single();
      if (settingsData?.value) minBreakMinutes = parseInt(settingsData.value, 10) || 60;

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, preferred_location, shift_preference')
        .eq('is_active', true)
        .order('first_name');

      if (profilesError) throw profilesError;
      if (!profiles?.length) {
        setAvailableForSlot([]);
        setAvailableLoading(false);
        return;
      }

      const { data: availability, error: availabilityError } = await supabase
        .from('availability')
        .select('user_id, status')
        .eq('date', slotDate);

      if (availabilityError) throw availabilityError;

      const { data: existingSlots, error: slotsError } = await supabase
        .from('scheduled_rota')
        .select('user_id, start_time, end_time')
        .eq('date', slotDate);

      if (slotsError) throw slotsError;

      const userSlots = {};
      (existingSlots || []).forEach((s) => {
        if (!userSlots[s.user_id]) userSlots[s.user_id] = [];
        userSlots[s.user_id].push({ start_time: s.start_time, end_time: s.end_time });
      });

      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      const normalizedSlotEnd = slotEnd < slotStart ? slotEnd + 1440 : slotEnd;

      const overlappingConflictIds = new Set();
      const breakConflictIds = new Set();

      Object.entries(userSlots).forEach(([userId, slots]) => {
        for (const existingSlot of slots) {
          const existingStart = timeToMinutes(existingSlot.start_time);
          const existingEnd = timeToMinutes(existingSlot.end_time);
          const normalizedExistingEnd = existingEnd < existingStart ? existingEnd + 1440 : existingEnd;

          const overlap = slotStart < normalizedExistingEnd && existingStart < normalizedSlotEnd;
          if (overlap) {
            overlappingConflictIds.add(userId);
            continue;
          }
          if (minBreakMinutes > 0) {
            let breakMinutes = -1;
            if (slotStart >= normalizedExistingEnd) breakMinutes = slotStart - normalizedExistingEnd;
            else if (existingStart >= normalizedSlotEnd) breakMinutes = existingStart - normalizedSlotEnd;
            if (breakMinutes !== -1 && breakMinutes < minBreakMinutes) breakConflictIds.add(userId);
          }
        }
      });

      const availabilityMap = new Map();
      (availability || []).forEach((item) => availabilityMap.set(item.user_id, item.status));

      const availableList = profiles.filter((profile) => {
        const isAssigned = assignedSet.has(profile.id);
        const status = (availabilityMap.get(profile.id) || 'unknown').toLowerCase();
        const isAvailableToday = status === 'available';
        if (isAssigned) return false;
        if (overlappingConflictIds.has(profile.id) || breakConflictIds.has(profile.id)) return false;
        if (!isAvailableToday) return false;
        if (!matchesShift(profile.shift_preference)) return false;
        if (!matchesLocation(profile.preferred_location)) return false;
        return true;
      });

      setAvailableForSlot(availableList.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name })));
    } catch (err) {
      console.error('Error fetching available for slot:', err);
      setAvailableForSlot([]);
    } finally {
      setAvailableLoading(false);
    }
  };

  const handleCardMouseEnter = (e) => {
    setTooltipPosition({ x: e.clientX + TOOLTIP_OFFSET, y: e.clientY + TOOLTIP_OFFSET });
    setShowAvailableTooltip(true);
    if (lastFetchedSlotIdRef.current === slot.id && !availableLoading) {
      return;
    }
    if (lastFetchedSlotIdRef.current !== slot.id) {
      setAvailableForSlot([]);
    }
    lastFetchedSlotIdRef.current = slot.id;
    setAvailableLoading(true);
    fetchAvailableForSlot();
  };

  const handleCardMouseLeave = () => {
    setShowAvailableTooltip(false);
  };

  const handleCardMouseMove = (e) => {
    if (showAvailableTooltip) {
      setTooltipPosition({ x: e.clientX + TOOLTIP_OFFSET, y: e.clientY + TOOLTIP_OFFSET });
    }
  };

  const formatTime = (timeString) => {
    return timeString.substring(0, 5); // HH:MM format
  };

  // Funkcja określająca kolor bocznego znacznika w zależności od typu zmiany
  const getShiftIndicatorColor = (shiftType) => {
    switch (shiftType) {
      case 'day':
        return 'bg-rota-shift-day';
      case 'afternoon':
        return 'bg-rota-shift-afternoon';
      case 'night':
        return 'bg-rota-shift-night';
      default:
        return 'bg-rota-toolbar-border';
    }
  };

  const ratio = assignedCount / slot.capacity;
  const stateStyles = isSlotFull
    ? {
        borderClass: 'border-rota-card-full-border',
        bgClass: 'bg-rota-card-full-bg',
        badgeClass: 'bg-rota-badge-full-bg text-rota-badge-full-text border-rota-badge-full-border',
        dotColor: 'bg-rota-card-full-border'
      }
    : fillPercentage === 0
    ? {
        borderClass: 'border-rota-card-empty-border',
        bgClass: 'bg-rota-card-empty-bg',
        badgeClass: 'bg-rota-badge-empty-bg text-rota-badge-empty-text border-rota-badge-empty-border',
        dotColor: 'bg-rota-card-empty-border'
      }
    : ratio >= 0.5
    ? {
        borderClass: 'border-rota-card-partial-border',
        bgClass: 'bg-rota-card-partial-bg',
        badgeClass: 'bg-rota-badge-partial-bg text-rota-badge-partial-text border-rota-badge-partial-border',
        dotColor: 'bg-rota-card-partial-border'
      }
    : {
        borderClass: 'border-rota-card-partial-low-border',
        bgClass: 'bg-rota-card-partial-low-bg',
        badgeClass: 'bg-rota-badge-partial-low-bg text-rota-badge-partial-low-text border-rota-badge-partial-low-border',
        dotColor: 'bg-rota-card-partial-low-border'
      };

  const statusInfo = isSlotFull
    ? { text: 'Full' }
    : fillPercentage === 0
    ? { text: 'Empty' }
    : { text: 'Partial' };

  // Delete confirmation dialog (outline buttons per confirm-dialog rule)
  const DeleteConfirmationModal = () => {
    if (!showDeleteConfirm) return null;
    
    const modalContent = (
      <div
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        onClick={() => setShowDeleteConfirm(false)}
        role="presentation"
      >
        <div
          className="relative z-10 w-full max-w-md rounded-xl border border-rota-modal-border bg-rota-modal-bg p-5 shadow-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <h3 id="confirm-delete-title" className="mb-3 text-xl font-semibold text-rota-text-primary">Confirm Delete</h3>
          <p className="mb-5 text-rota-text-muted">
            Are you sure you want to delete this slot?
            {assignedCount > 0 && (
              <span className="mt-2 block text-sm font-semibold text-rota-alert-error-text">
                This slot has {assignedCount} assigned employee{assignedCount !== 1 ? 's' : ''}.
              </span>
            )}
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="order-2 sm:order-1 rounded-lg border-2 border-rota-btn-outline-border bg-white px-4 py-2 text-rota-btn-outline-text transition hover:bg-rota-day-other-bg-from"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSlot(slot.id);
                setShowDeleteConfirm(false);
              }}
              className="order-1 sm:order-2 rounded-lg border-2 border-rota-btn-destructive-border bg-white px-4 py-2 text-rota-btn-destructive-text transition hover:bg-rota-btn-destructive-hover-bg"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
    return createPortal(modalContent, document.body);
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleCardMouseEnter}
      onMouseMove={handleCardMouseMove}
      onMouseLeave={handleCardMouseLeave}
      onClick={() => handleOpenAssignModal(slot)}
      className={`relative overflow-hidden rounded-xl border shadow-sm transition-all hover:shadow-md cursor-pointer flex flex-col flex-shrink-0 ${stateStyles.borderClass} ${stateStyles.bgClass}`}
    >
      {/* Delete confirmation modal */}
      <DeleteConfirmationModal />

      {/* Available-for-slot tooltip (portal) - never show when delete confirm is open */}
      {showAvailableTooltip && !showDeleteConfirm &&
        createPortal(
          (() => {
            return (
              <div
                className="fixed z-50 min-w-[160px] max-w-[280px] rounded-xl border border-rota-badge-full-border bg-rota-modal-bg px-3 py-2.5 shadow-lg pointer-events-none"
                style={{
                  left: tooltipPosition.x,
                  top: tooltipPosition.y,
                }}
              >
                <p className="mb-2 text-sm font-semibold text-rota-text-primary">
                  Available for this slot
                </p>
                <div className="text-sm text-rota-text-muted">
                  {availableLoading ? (
                    <span>Loading…</span>
                  ) : availableForSlot.length === 0 ? (
                    <span>No one available</span>
                  ) : (
                    <ul className="space-y-1">
                      {availableForSlot.map((user) => (
                        <li key={user.id}>
                          {user.first_name} {user.last_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })(),
          document.body
        )}
      
      {/* HEADER: Czas + Capacity */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rota-toolbar-border">
        <span className="text-lg font-semibold text-rota-text-primary">
          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
        </span>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-semibold shrink-0 ${stateStyles.badgeClass}`}>
          {assignedCount}/{slot.capacity}
        </span>
      </div>
      
      {/* BODY: Employees list - flex-grow wypycha footer na dół */}
      <div className="px-4 py-3 flex-grow">
        {loading ? (
          <div className="h-5 animate-pulse rounded bg-rota-toolbar-border w-32"></div>
        ) : assignedUsers.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {assignedUsers.map(user => (
              <div key={user.id} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${stateStyles.dotColor}`}></span>
                <span className="text-sm text-rota-text-muted">
                  {user.first_name} {user.last_name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-rota-alert-error-text">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium">No employees assigned</span>
          </div>
        )}
      </div>
      
      {/* FOOTER: Action buttons - przedzielone na pół, Edit left / Delete right */}
      {isAdmin && (
        <div className="grid grid-cols-2 border-t border-rota-toolbar-border mt-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof handleOpenEditModal === 'function') {
                handleOpenEditModal(slot);
              }
            }}
            className="flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-rota-text-primary bg-transparent hover:bg-rota-day-other-bg-from/60 transition-colors"
            title="Edit shift"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAvailableTooltip(false);
              setShowDeleteConfirm(true);
            }}
            className="flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-rota-text-primary bg-transparent hover:bg-rota-btn-destructive-hover-bg transition-colors"
            title="Delete shift"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

SlotCard.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    shift_type: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    capacity: PropTypes.number.isRequired,
    assigned_employees: PropTypes.array.isRequired,
    status: PropTypes.string
  }).isRequired,
  handleOpenAssignModal: PropTypes.func.isRequired,
  handleDeleteSlot: PropTypes.func.isRequired,
  handleOpenEditModal: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired
};

export default SlotCard; 