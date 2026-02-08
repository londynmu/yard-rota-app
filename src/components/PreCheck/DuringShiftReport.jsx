import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import ImageUpload from './ImageUpload';
import useNetworkStatus from '../../lib/useNetworkStatus';
import {
  mapImagesToQueueEntries,
  queueDuringShiftSubmission,
  submitDuringShiftPayload,
} from '../../lib/precheckQueue';
import { isLikelyNetworkError } from '../../lib/uploadRetry';

const FORM_STORAGE_KEY = 'precheck_during_shift_form';

const saveFormState = (data) => {
  try {
    // Can't serialize File objects, only save text fields
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({
      description: data.description,
    }));
  } catch { /* ignore */ }
};

const loadFormState = () => {
  try {
    const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

const clearFormState = () => {
  sessionStorage.removeItem(FORM_STORAGE_KEY);
};

export default function DuringShiftReport({ selectedTug, onSubmitSuccess }) {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const savedForm = loadFormState();
  const [description, setDescription] = useState(savedForm?.description || '');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleImagesChange = useCallback((newImagesOrFn) => {
    setImages(prev => (typeof newImagesOrFn === 'function' ? newImagesOrFn(prev) : newImagesOrFn));
  }, []);

  // Persist form state on every change (so camera app return preserves data)
  const persistForm = useCallback(() => {
    saveFormState({ description });
  }, [description]);

  useEffect(() => {
    persistForm();
  }, [persistForm]);

  const buildPayload = () => ({
    userId: user.id,
    tugId: selectedTug.id,
    description: description.trim(),
    images: mapImagesToQueueEntries(images),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!description.trim()) {
      alert('Please describe what happened.');
      return;
    }

    setSubmitting(true);
    const payload = buildPayload();

    const queueSubmission = async () => {
      await queueDuringShiftSubmission(payload);
      clearFormState();
      onSubmitSuccess?.(null, { queued: true });
    };

    try {
      if (!isOnline) {
        await queueSubmission();
        return;
      }

      const submission = await submitDuringShiftPayload(payload, supabase);
      clearFormState();
      onSubmitSuccess?.(submission, { queued: false });
    } catch (err) {
      console.error('[DuringShiftReport] Submit error:', err);
      if (!isOnline || isLikelyNetworkError(err)) {
        await queueSubmission();
      } else {
        alert('Error submitting report. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
          <p className="text-sm font-bold text-red-800">
            Damage Report for {selectedTug?.display_name || selectedTug?.tug_number}
          </p>
          <p className="text-xs text-red-500">
            {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="p-4 space-y-5">
          {/* What happened */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">What happened? *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the damage or incident..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-300"
              autoFocus
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Photos</label>
            <ImageUpload
              images={images}
              onImagesChange={handleImagesChange}
              maxImages={5}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="px-4 pb-4">
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all ${
              submitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 active:scale-[0.98]'
            }`}
          >
            {submitting ? 'Submitting...' : 'Submit Damage Report'}
          </button>
        </div>
      </div>
    </form>
  );
}

DuringShiftReport.propTypes = {
  selectedTug: PropTypes.object,
  onSubmitSuccess: PropTypes.func,
};
