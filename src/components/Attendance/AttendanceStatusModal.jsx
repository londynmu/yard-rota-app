import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { ATTENDANCE_OPTIONS, ATTENDANCE_NOTE_MAX_LENGTH } from '../../utils/attendanceStatus';

const SELECTED_CLASS = 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 hover:from-blue-700 hover:to-blue-800';
const UNSELECTED_CLASS = 'text-slate-700 hover:bg-slate-50 border-slate-200/60';

/**
 * Modal to mark attendance for a slot: No show / Sick / Late / Other, with an optional reason
 * (required for Other). Call onSave(status, note) to save, onSave(null) to clear (Present).
 */
function AttendanceStatusModal({ open, onClose, slot, currentStatus, currentNote, onSave, saving }) {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState(currentNote || '');

  useEffect(() => {
    setStatus(currentStatus);
    setNote(currentNote || '');
  }, [slot?.id, currentStatus, currentNote]);

  if (!open || !slot) return null;

  const name = slot.profiles
    ? `${slot.profiles.first_name || ''} ${slot.profiles.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';
  const dateStr = slot.date ? format(new Date(slot.date), 'EEEE, d MMM yyyy') : '';
  const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
  const timeStr = slot.start_time && slot.end_time
    ? `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`
    : '';

  const trimmedNote = note.trim();
  const noteRequired = status === 'other';
  const canSave = Boolean(status) && (!noteRequired || trimmedNote.length > 0) && !saving;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSave) onSave(status, trimmedNote);
  };

  return (
    <div className="fixed inset-0 bg-black/35 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white/95 backdrop-blur-md border border-slate-200/70 rounded-2xl shadow-strong p-6 max-w-sm w-full"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-charcoal">Mark attendance</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-rota-text-muted-light hover:text-charcoal hover:bg-slate-100 p-1.5 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-charcoal font-semibold mb-1">{name}</p>
        {dateStr && <p className="text-sm text-slate-600 mb-1">{dateStr}</p>}
        {timeStr && <p className="text-sm text-slate-600 mb-4">{timeStr}</p>}

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Attendance status">
          {ATTENDANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={status === opt.value}
              disabled={saving}
              onClick={() => setStatus(opt.value)}
              className={`px-4 py-3 rounded-xl font-semibold border transition-colors ${
                status === opt.value ? SELECTED_CLASS : UNSELECTED_CLASS
              } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="attendance-note" className="block text-sm font-medium text-slate-700 mb-1.5">
            Reason <span className="font-normal text-slate-500">{noteRequired ? '(required)' : '(optional)'}</span>
          </label>
          <textarea
            id="attendance-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
            disabled={saving}
            placeholder="e.g. Family emergency"
            className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <p className="mt-1 text-right text-[11px] text-slate-400 tabular-nums">
            {note.length}/{ATTENDANCE_NOTE_MAX_LENGTH}
          </p>
        </div>

        <div className={`mt-2 grid gap-2 ${currentStatus ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {currentStatus && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(null)}
              className={`px-4 py-3 rounded-xl font-semibold border transition-colors ${UNSELECTED_CLASS} ${
                saving ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              Clear (Present)
            </button>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className={`px-4 py-3 rounded-xl font-semibold border transition-colors ${SELECTED_CLASS} ${
              canSave ? '' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

AttendanceStatusModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  slot: PropTypes.shape({
    id: PropTypes.string,
    date: PropTypes.string,
    shift_type: PropTypes.string,
    start_time: PropTypes.string,
    end_time: PropTypes.string,
    profiles: PropTypes.shape({
      first_name: PropTypes.string,
      last_name: PropTypes.string,
    }),
  }),
  currentStatus: PropTypes.oneOf(['no_show', 'sick', 'late', 'other']),
  currentNote: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool,
};

AttendanceStatusModal.defaultProps = {
  slot: null,
  currentStatus: null,
  currentNote: '',
  saving: false,
};

export default AttendanceStatusModal;
