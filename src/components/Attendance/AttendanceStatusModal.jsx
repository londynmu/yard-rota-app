import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { ATTENDANCE_OPTIONS, ATTENDANCE_NOTE_MAX_LENGTH } from '../../utils/attendanceStatus';
import Modal from '../ui/Modal';

const OPTION_BASE =
  'min-h-11 px-3 py-2.5 rounded-xl text-sm font-semibold border text-center transition-colors motion-reduce:transition-none';
const OPTION_SELECTED = `${OPTION_BASE} border-sky-100 bg-sky-50 text-sky-900`;
const OPTION_IDLE = `${OPTION_BASE} border-slate-200/60 text-slate-700 hover:bg-slate-50`;
const CLOSE_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 motion-reduce:transition-none';

/**
 * Modal to mark attendance for a slot: No show / Sick / Other, with an optional reason
 * (required for Other). Call onSave(status, note) to save, onSave(null) to clear (Present).
 */
function AttendanceStatusModal({ open, onClose, slot, currentStatus, currentNote, onSave, saving }) {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState(currentNote || '');

  useEffect(() => {
    setStatus(currentStatus);
    setNote(currentNote || '');
  }, [slot?.id, currentStatus, currentNote]);

  const isOpen = Boolean(open && slot);

  const name = slot?.profiles
    ? `${slot.profiles.first_name || ''} ${slot.profiles.last_name || ''}`.trim() || 'Unknown'
    : 'Unknown';
  const dateStr = slot?.date ? format(new Date(slot.date), 'EEEE, d MMM yyyy') : '';
  const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
  const timeStr = slot?.start_time && slot?.end_time
    ? `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`
    : '';

  const trimmedNote = note.trim();
  const noteRequired = status === 'other';
  const missingStatus = !status;
  const missingNote = noteRequired && trimmedNote.length === 0;
  const canSave = Boolean(status) && !missingNote && !saving;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSave) onSave(status, trimmedNote);
  };

  let saveHint = '';
  if (!saving && missingStatus) {
    saveHint = 'Choose No show, Sick, or Other to enable Save.';
  } else if (!saving && missingNote) {
    saveHint = 'Add a reason for Other before saving.';
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-sm"
      ariaLabelledBy="mark-attendance-title"
    >
      {!slot ? null : (
        <form onSubmit={handleSubmit} className="relative">
          <h2
            id="mark-attendance-title"
            className="mb-3 pr-12 text-base font-semibold text-slate-800"
          >
            Mark attendance
          </h2>

          <p className="mb-1 font-semibold text-charcoal">{name}</p>
          {dateStr ? <p className="mb-1 text-sm text-slate-600">{dateStr}</p> : null}
          {timeStr ? <p className="mb-1 text-sm text-slate-600">{timeStr}</p> : null}
          <p className="mb-4 text-xs text-slate-500">
            Saving No show, Sick, or Other records the absence and removes this person from the rota for this slot.
          </p>

          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Attendance status"
          >
            {ATTENDANCE_OPTIONS.map((opt) => {
              const selected = status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving}
                  onClick={() => setStatus(opt.value)}
                  className={`${selected ? OPTION_SELECTED : OPTION_IDLE} ${
                    saving ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  {...(selected ? { 'data-autofocus': true } : {})}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label htmlFor="attendance-note" className="mb-1.5 block text-sm font-medium text-slate-700">
              Reason{' '}
              <span className="font-normal text-slate-500">
                {noteRequired ? '(required)' : '(optional)'}
              </span>
            </label>
            <textarea
              id="attendance-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
              disabled={saving}
              placeholder="e.g. Family emergency"
              className="w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <p className="mt-1 text-right text-xs tabular-nums text-slate-400">
              {note.length}/{ATTENDANCE_NOTE_MAX_LENGTH}
            </p>
          </div>

          {saveHint ? (
            <p className="mt-2 text-xs text-slate-500" role="status">
              {saveHint}
            </p>
          ) : null}

          <div className={`mt-3 grid gap-2 ${currentStatus ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {currentStatus ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onSave(null)}
                className={`${OPTION_IDLE} ${saving ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                Clear (Present)
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSave}
              className={`${OPTION_SELECTED} ${canSave ? '' : 'cursor-not-allowed opacity-50'}`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`${CLOSE_CLASS} absolute right-0 top-0`}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </form>
      )}
    </Modal>
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
