import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const DEFAULT_START_BY_SHIFT = {
  Day: '09:00',
  Afternoon: '18:00',
  Night: '21:00',
};

const toMinutes = (time) => {
  const [h, m] = String(time || '00:00').substring(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const toTimeString = (totalMinutes) => {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const SlotEditorModal = ({ isOpen, onClose, mode, initialSlot, selectedShift, onSubmit }) => {
  const modalRef = useRef(null);
  const isEdit = mode === 'edit';

  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [count, setCount] = useState(1);
  const [gap, setGap] = useState(30);
  const [gapTouched, setGapTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const baseStart = isEdit
      ? String(initialSlot?.start_time || '09:00').substring(0, 5)
      : DEFAULT_START_BY_SHIFT[selectedShift] || '09:00';
    const baseDuration = isEdit ? initialSlot?.duration_minutes || 30 : 30;
    setStartTime(baseStart);
    setDuration(baseDuration);
    setCount(1);
    setGap(baseDuration);
    setGapTouched(false);
    setIsSaving(false);
  }, [isOpen, isEdit, initialSlot, selectedShift]);

  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const effectiveGap = gapTouched ? gap : duration;

  const generatedSlots = useMemo(() => {
    const safeDuration = Number(duration) || 0;
    if (safeDuration <= 0) return [];
    const total = isEdit ? 1 : Math.max(1, Number(count) || 1);
    const step = Math.max(5, Number(effectiveGap) || safeDuration);
    const startMinutes = toMinutes(startTime);
    return Array.from({ length: total }, (_, index) => ({
      start_time: toTimeString(startMinutes + index * step),
      duration_minutes: safeDuration,
    }));
  }, [startTime, duration, count, effectiveGap, isEdit]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    if (!generatedSlots.length) return;

    setIsSaving(true);
    try {
      const success = isEdit
        ? await onSubmit(generatedSlots[0])
        : await onSubmit(generatedSlots);
      if (success) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const [hourPart, minutePart] = startTime.split(':');
  const selectClasses =
    'w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2.5 text-base text-charcoal transition-all focus:border-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-800';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
      <div
        ref={modalRef}
        className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border-2 border-gray-400 bg-white text-charcoal shadow-2xl md:max-w-sm md:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between border-b border-gray-900 bg-black px-5 py-4">
          <h3 className="text-lg font-bold text-white">{isEdit ? 'Edit Break Slot' : 'Add Break Slots'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <span className="mb-2 block text-sm font-bold text-gray-900">Start time</span>
            <div className="flex items-center gap-2">
              <select
                aria-label="Start hour"
                value={hourPart}
                onChange={(e) => setStartTime(`${e.target.value}:${minutePart}`)}
                className={selectClasses}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
              <span className="text-lg font-bold text-gray-500">:</span>
              <select
                aria-label="Start minute"
                value={minutePart}
                onChange={(e) => setStartTime(`${hourPart}:${e.target.value}`)}
                className={selectClasses}
              >
                {MINUTES.map((minute) => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="slot_duration" className="mb-2 block text-sm font-bold text-gray-900">
              Duration (minutes)
            </label>
            <input
              id="slot_duration"
              type="number"
              min={5}
              max={240}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={selectClasses}
            />
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="slot_count" className="mb-2 block text-sm font-bold text-gray-900">
                  How many
                </label>
                <select
                  id="slot_count"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className={selectClasses}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slot_gap" className="mb-2 block text-sm font-bold text-gray-900">
                  Every (min)
                </label>
                <input
                  id="slot_gap"
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  value={effectiveGap}
                  disabled={count === 1}
                  onChange={(e) => {
                    setGapTouched(true);
                    setGap(Number(e.target.value));
                  }}
                  className={`${selectClasses} disabled:bg-gray-100 disabled:text-gray-400`}
                />
              </div>
            </div>
          )}

          {generatedSlots.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                {isEdit ? 'New time' : `Slots to add (${generatedSlots.length})`}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {generatedSlots.map((slot) => (
                  <span
                    key={slot.start_time}
                    className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-charcoal"
                  >
                    {slot.start_time}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving || !generatedSlots.length}
            className="w-full rounded-lg bg-black px-4 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-gray-900 disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add slots'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

SlotEditorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']).isRequired,
  initialSlot: PropTypes.shape({
    start_time: PropTypes.string,
    duration_minutes: PropTypes.number,
  }),
  selectedShift: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
};

export default SlotEditorModal;
