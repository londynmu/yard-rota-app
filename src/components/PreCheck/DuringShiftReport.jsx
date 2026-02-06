import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import ImageUpload from './ImageUpload';
import TugDiagram from './TugDiagram';

const FORM_STORAGE_KEY = 'precheck_during_shift_form';

const saveFormState = (data) => {
  try {
    // Can't serialize File objects, only save text fields
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({
      description: data.description,
      severity: data.severity,
      locationOnTug: data.locationOnTug,
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
  const savedForm = loadFormState();
  const [description, setDescription] = useState(savedForm?.description || '');
  const [severity, setSeverity] = useState(savedForm?.severity || 'minor');
  const [locationOnTug, setLocationOnTug] = useState(savedForm?.locationOnTug || null);
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Persist form state on every change (so camera app return preserves data)
  const persistForm = useCallback(() => {
    saveFormState({ description, severity, locationOnTug });
  }, [description, severity, locationOnTug]);

  useEffect(() => {
    persistForm();
  }, [persistForm]);

  const uploadImages = async (submissionId) => {
    const urls = [];
    for (const img of images) {
      if (!img.file) continue;
      const ext = img.file.name.split('.').pop() || 'jpg';
      const filePath = `damages/${submissionId}/${img.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('precheck-images')
        .upload(filePath, img.file, { upsert: true });

      if (uploadError) {
        console.error('[DuringShiftReport] Upload error:', uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('precheck-images')
        .getPublicUrl(filePath);

      urls.push(publicUrl);
    }
    return urls;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!description.trim()) {
      alert('Please describe what happened.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create during_shift submission
      const { data: submission, error: subError } = await supabase
        .from('precheck_submissions')
        .insert({
          user_id: user.id,
          tug_id: selectedTug.id,
          check_type: 'during_shift',
          remarks: description.trim(),
        })
        .select()
        .single();

      if (subError) throw subError;

      // 2. Upload images
      const imageUrls = await uploadImages(submission.id);

      // 3. Create damage record
      const { error: damageError } = await supabase
        .from('precheck_damages')
        .insert({
          submission_id: submission.id,
          description: description.trim(),
          location_on_tug: locationOnTug,
          severity,
          image_urls: imageUrls,
        });

      if (damageError) throw damageError;

      clearFormState();
      onSubmitSuccess?.(submission);
    } catch (err) {
      console.error('[DuringShiftReport] Submit error:', err);
      alert('Error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm font-bold text-red-800">Damage Report</p>
          <p className="text-xs text-red-500">
            {selectedTug?.display_name || selectedTug?.tug_number} • {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
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

          {/* Tug diagram - tap to mark location */}
          <TugDiagram
            selectedZone={locationOnTug}
            onSelectZone={setLocationOnTug}
          />

          {/* Photos */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Photos</label>
            <ImageUpload
              images={images}
              onImagesChange={setImages}
              maxImages={5}
            />
          </div>

          {/* Severity - compact */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Severity</label>
            <div className="flex gap-2">
              {[
                { value: 'minor', label: 'Minor', bg: 'bg-yellow-50 border-yellow-300 text-yellow-700' },
                { value: 'major', label: 'Major', bg: 'bg-orange-50 border-orange-300 text-orange-700' },
                { value: 'critical', label: 'Critical', bg: 'bg-red-50 border-red-300 text-red-700' },
              ].map(level => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setSeverity(level.value)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                    severity === level.value
                      ? level.bg
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
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
