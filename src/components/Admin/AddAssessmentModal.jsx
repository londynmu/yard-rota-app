import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { addYears, format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';
import ImageUpload from '../PreCheck/ImageUpload';
import {
  ASSESSMENT_IMAGES_BUCKET,
  buildAssessmentImagePath,
} from '../../utils/assessmentImageUrl';
import { deleteAutoDuePlaceholdersForUser } from '../../utils/reassessmentDefaults';

function todayYmd() {
  return format(new Date(), 'yyyy-MM-dd');
}

function buildProfileSnapshot(user) {
  if (!user) return {};
  return {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    yard_system_id: user.yard_system_id || '',
    agency_name: user.agency_name || '',
    preferred_location: user.preferred_location || user.location || '',
  };
}

function displayName(user) {
  if (!user) return '';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
}

export default function AddAssessmentModal({ open, onClose, user, onSuccess }) {
  const { user: authUser } = useAuth();
  const toast = useToast();
  const snapshot = useMemo(() => buildProfileSnapshot(user), [user]);

  const [assessmentDate, setAssessmentDate] = useState(todayYmd());
  const [duration, setDuration] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssessmentDate(todayYmd());
    setDuration('');
    setTimeFrom('');
    setTimeTo('');
    setNotes('');
    setImages([]);
  }, [open, user?.id]);

  const nextDuePreview = useMemo(() => {
    if (!assessmentDate) return '';
    try {
      return format(addYears(new Date(`${assessmentDate}T12:00:00`), 1), 'd MMM yyyy');
    } catch {
      return '';
    }
  }, [assessmentDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error('No user selected');
      return;
    }
    if (!authUser?.id) {
      toast.error('You must be logged in');
      return;
    }
    if (!assessmentDate) {
      toast.error('Assessment date is required');
      return;
    }

    setSaving(true);
    try {
      const nextDueDate = format(addYears(new Date(`${assessmentDate}T12:00:00`), 1), 'yyyy-MM-dd');
      const { data: row, error: insertError } = await supabase
        .from('shunter_assessments')
        .insert({
          user_id: user.id,
          assessment_date: assessmentDate,
          next_due_date: nextDueDate,
          duration: duration.trim() || null,
          time_from: timeFrom || null,
          time_to: timeTo || null,
          profile_snapshot: snapshot,
          image_paths: [],
          notes: notes.trim() || null,
          created_by: authUser.id,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Real assessment replaces any default schedule placeholder for this user.
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

      toast.success('Assessment saved');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('[AddAssessmentModal] save failed', err);
      toast.error(err.message || 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div
        className="admin-modal-panel mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-bold text-charcoal">New assessment</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-charcoal">{displayName(user)}</p>
            <dl className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-gray-600 sm:grid-cols-2">
              <div>
                <dt className="uppercase tracking-wide text-gray-400">Licence No. (Yard System ID)</dt>
                <dd className="text-charcoal">{snapshot.yard_system_id || '—'}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-400">Agency</dt>
                <dd className="text-charcoal">{snapshot.agency_name || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="uppercase tracking-wide text-gray-400">Location</dt>
                <dd className="text-charcoal">{snapshot.preferred_location || '—'}</dd>
              </div>
            </dl>
          </div>

          <div>
            <label htmlFor="assessment-date" className="mb-1 block text-sm font-medium text-charcoal">
              Assessment date
            </label>
            <input
              id="assessment-date"
              type="date"
              value={assessmentDate}
              onChange={(e) => setAssessmentDate(e.target.value)}
              className="admin-input"
              required
            />
            {nextDuePreview && (
              <p className="mt-1 text-xs text-gray-500">Next due: {nextDuePreview}</p>
            )}
          </div>

          <div>
            <label htmlFor="assessment-duration" className="mb-1 block text-sm font-medium text-charcoal">
              Duration
            </label>
            <input
              id="assessment-duration"
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 1-2 hours"
              className="admin-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="assessment-time-from" className="mb-1 block text-sm font-medium text-charcoal">
                Time from
              </label>
              <input
                id="assessment-time-from"
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="admin-input"
              />
            </div>
            <div>
              <label htmlFor="assessment-time-to" className="mb-1 block text-sm font-medium text-charcoal">
                Time to
              </label>
              <input
                id="assessment-time-to"
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="admin-input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="assessment-notes" className="mb-1 block text-sm font-medium text-charcoal">
              General comments
            </label>
            <textarea
              id="assessment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="admin-input"
              placeholder="Optional summary of the drive"
            />
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

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={onClose} className="admin-btn-muted" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save assessment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

AddAssessmentModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  user: PropTypes.object,
  onSuccess: PropTypes.func,
};
