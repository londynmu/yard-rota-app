import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { addHours, addYears, format, parse } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';
import Modal from '../ui/Modal';
import ImageUpload from '../PreCheck/ImageUpload';
import {
  ASSESSMENT_IMAGES_BUCKET,
  buildAssessmentImagePath,
} from '../../utils/assessmentImageUrl';
import { deleteAutoDuePlaceholdersForUser } from '../../utils/reassessmentDefaults';

const DURATION_OPTIONS = [
  { value: 'full_12', label: 'Full assessment (12 hours)', hours: 12 },
  { value: 'reassessment_1', label: 'Reassessment (1 hour)', hours: 1 },
];

/** Full-hour options only (HH:00). Native time inputs ignore hourly step in many browsers. */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { value, label: value };
});

const OUTLINE_CANCEL =
  'order-2 inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-rota-btn-outline-border bg-white px-4 py-2 text-rota-btn-outline-text transition-colors hover:bg-rota-day-other-bg-from motion-reduce:transition-none sm:order-1 sm:flex-none';
const OUTLINE_CONFIRM =
  'order-1 inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-rota-text-primary bg-white px-4 py-2 text-rota-text-primary transition-colors hover:bg-rota-day-other-bg-from motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 sm:order-2 sm:flex-none';

function todayYmd() {
  return format(new Date(), 'yyyy-MM-dd');
}

function displayName(user) {
  if (!user) return '';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
}

function buildProfileSnapshot(user, locationName) {
  if (!user) return { preferred_location: locationName || '' };
  return {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    yard_system_id: user.yard_system_id || '',
    agency_name: user.agency_name || '',
    preferred_location: locationName || user.preferred_location || user.location || '',
  };
}

function computeEndDateTime(assessmentDate, timeFrom, hours) {
  if (!assessmentDate || !timeFrom || !hours) return null;
  try {
    const start = parse(
      `${assessmentDate} ${timeFrom.slice(0, 5)}`,
      'yyyy-MM-dd HH:mm',
      new Date(),
    );
    if (Number.isNaN(start.getTime())) return null;
    return addHours(start, hours);
  } catch {
    return null;
  }
}

export default function AddAssessmentModal({
  open,
  onClose,
  user,
  onSuccess,
  mode = 'new',
}) {
  const { user: authUser } = useAuth();
  const toast = useToast();
  const title = mode === 'reassessment' ? 'Reassessment' : 'New assessment';
  const titleId = mode === 'reassessment' ? 'reassessment-title' : 'add-assessment-title';

  const [locations, setLocations] = useState([]);
  const [locationName, setLocationName] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(todayYmd());
  const [durationKey, setDurationKey] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadLocations = async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (cancelled) return;
      if (error) {
        console.warn('[AddAssessmentModal] locations load failed', error);
        setLocations([]);
        return;
      }
      setLocations(data || []);
    };
    loadLocations();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const preferred = user?.preferred_location || user?.location || '';
    setAssessmentDate(todayYmd());
    setDurationKey(mode === 'reassessment' ? 'reassessment_1' : '');
    setTimeFrom('');
    setNotes('');
    setNotesError('');
    setImages([]);
    setLocationName(preferred);
  }, [open, user?.id, user?.preferred_location, user?.location, mode]);

  const durationOption = useMemo(
    () => DURATION_OPTIONS.find((opt) => opt.value === durationKey) || null,
    [durationKey],
  );

  const endAt = useMemo(
    () => computeEndDateTime(assessmentDate, timeFrom, durationOption?.hours),
    [assessmentDate, timeFrom, durationOption?.hours],
  );

  const timeToValue = endAt ? format(endAt, 'HH:mm') : '';
  const endDisplay = endAt
    ? format(endAt, 'd MMM yyyy · HH:mm')
    : 'Select start time and duration';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotesError('');
    if (!user?.id) {
      toast.error('No user selected');
      return;
    }
    if (!authUser?.id) {
      toast.error('You must be logged in');
      return;
    }
    if (!locationName) {
      toast.error('Location is required');
      return;
    }
    if (!assessmentDate) {
      toast.error('Assessment date is required');
      return;
    }
    if (!durationOption) {
      toast.error('Duration is required');
      return;
    }
    if (!timeFrom) {
      toast.error('Start time is required');
      return;
    }
    const trimmedNotes = notes.trim();
    if (!trimmedNotes) {
      setNotesError('General comments are required');
      return;
    }

    setSaving(true);
    try {
      const nextDueDate = format(addYears(new Date(`${assessmentDate}T12:00:00`), 1), 'yyyy-MM-dd');
      const snapshot = buildProfileSnapshot(user, locationName);
      const { data: row, error: insertError } = await supabase
        .from('shunter_assessments')
        .insert({
          user_id: user.id,
          assessment_date: assessmentDate,
          next_due_date: nextDueDate,
          duration: durationOption.label,
          time_from: timeFrom.slice(0, 5),
          time_to: timeToValue || null,
          profile_snapshot: snapshot,
          image_paths: [],
          notes: trimmedNotes,
          created_by: authUser.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      try {
        await deleteAutoDuePlaceholdersForUser(supabase, user.id);
      } catch (cleanupErr) {
        console.warn('[AddAssessmentModal] could not clear auto_due placeholders', cleanupErr);
      }

      const imagePaths = [];
      for (let i = 0; i < images.length; i += 1) {
        const entry = images[i];
        const file = entry?.file || entry;
        if (!file) continue;
        const fileName = file.name || entry?.name || 'photo.jpg';
        const ext = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = buildAssessmentImagePath(user.id, row.id, `${Date.now()}-${i}.${ext}`);
        const { error: uploadError } = await supabase.storage
          .from(ASSESSMENT_IMAGES_BUCKET)
          .upload(path, file, {
            upsert: false,
            contentType: file.type || 'image/jpeg',
          });
        if (uploadError) throw uploadError;
        imagePaths.push(path);
      }

      if (imagePaths.length > 0) {
        const { error: updateError } = await supabase
          .from('shunter_assessments')
          .update({ image_paths: imagePaths })
          .eq('id', row.id);
        if (updateError) throw updateError;
      }

      toast.success(mode === 'reassessment' ? 'Reassessment saved' : 'Assessment saved');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[AddAssessmentModal] save failed', err);
      toast.error(err.message || 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      overlayClassName="z-[10000]"
      ariaLabelledBy={titleId}
      className="max-w-lg !p-0 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-rota-modal-border px-5 py-3">
        <h3 id={titleId} className="text-xl font-semibold text-rota-text-primary">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-charcoal motion-reduce:transition-none"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <p className="text-sm font-medium text-charcoal">{displayName(user)}</p>

        <div>
          <label htmlFor="assessment-location" className="mb-1 block text-sm font-medium text-charcoal">
            Location <span className="text-red-600">*</span>
          </label>
          <select
            id="assessment-location"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="admin-input admin-select min-h-11"
            required
            data-autofocus
          >
            <option value="">Select location…</option>
            {locationName
              && !locations.some((loc) => loc.name === locationName) ? (
                <option value={locationName}>{locationName}</option>
              ) : null}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.name}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assessment-date" className="mb-1 block text-sm font-medium text-charcoal">
            Assessment date <span className="text-red-600">*</span>
          </label>
          <input
            id="assessment-date"
            type="date"
            value={assessmentDate}
            onChange={(e) => setAssessmentDate(e.target.value)}
            className="admin-input min-h-11"
            required
          />
        </div>

        <div>
          <label htmlFor="assessment-duration" className="mb-1 block text-sm font-medium text-charcoal">
            Duration <span className="text-red-600">*</span>
          </label>
          <select
            id="assessment-duration"
            value={durationKey}
            onChange={(e) => setDurationKey(e.target.value)}
            className="admin-input admin-select min-h-11"
            required
          >
            <option value="">Select duration…</option>
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="assessment-time-from" className="mb-1 block text-sm font-medium text-charcoal">
              Time from <span className="text-red-600">*</span>
            </label>
            <select
              id="assessment-time-from"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="admin-input admin-select min-h-11"
              required
            >
              <option value="">Select hour…</option>
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-charcoal">Ends</p>
            <p className="flex min-h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-charcoal">
              {endDisplay}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="assessment-notes" className="mb-1 block text-sm font-medium text-charcoal">
            General comments <span className="text-red-600">*</span>
          </label>
          <textarea
            id="assessment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            required
            aria-invalid={Boolean(notesError)}
            aria-describedby={notesError ? 'assessment-notes-error' : undefined}
            className={`admin-input min-h-[5.5rem] ${notesError ? '!border-red-400' : ''}`}
          />
          {notesError ? (
            <p id="assessment-notes-error" className="mt-1 text-sm text-red-600" role="alert">
              {notesError}
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-charcoal">Paper form photos</p>
          <ImageUpload
            images={images}
            onImagesChange={setImages}
            maxImages={5}
            storageKey={`assessment_photos_${user?.id || 'new'}`}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className={OUTLINE_CANCEL} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={OUTLINE_CONFIRM}>
            {saving ? 'Saving…' : mode === 'reassessment' ? 'Save reassessment' : 'Save assessment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

AddAssessmentModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  user: PropTypes.object,
  onSuccess: PropTypes.func,
  mode: PropTypes.oneOf(['new', 'reassessment']),
};
