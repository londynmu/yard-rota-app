import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import ImageUpload from './ImageUpload';
import TugDiagram from './TugDiagram';

export default function DuringShiftReport({ selectedTug, onSubmitSuccess }) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [locationOnTug, setLocationOnTug] = useState(null);
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);

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

      onSubmitSuccess?.(submission);
    } catch (err) {
      console.error('[DuringShiftReport] Submit error:', err);
      alert('Error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-red-800 text-sm">Damage Report</h3>
            <p className="text-xs text-red-600">
              Tug {selectedTug?.tug_number} • {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>

      {/* What happened */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-semibold text-charcoal mb-2">What happened? *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the damage or incident in detail..."
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 focus:border-red-300"
          autoFocus
        />
      </div>

      {/* Severity */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-semibold text-charcoal mb-3">Severity</label>
        <div className="flex gap-2">
          {[
            { value: 'minor', label: 'Minor', desc: 'Cosmetic / small issue', color: 'yellow' },
            { value: 'major', label: 'Major', desc: 'Needs repair soon', color: 'orange' },
            { value: 'critical', label: 'Critical', desc: 'Unsafe / immediate action', color: 'red' },
          ].map(level => (
            <button
              key={level.value}
              type="button"
              onClick={() => setSeverity(level.value)}
              className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${
                severity === level.value
                  ? level.color === 'yellow' ? 'border-yellow-400 bg-yellow-50'
                    : level.color === 'orange' ? 'border-orange-400 bg-orange-50'
                    : 'border-red-400 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`text-sm font-bold ${
                severity === level.value
                  ? level.color === 'yellow' ? 'text-yellow-700'
                    : level.color === 'orange' ? 'text-orange-700'
                    : 'text-red-700'
                  : 'text-gray-700'
              }`}>{level.label}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{level.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Location on tug */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <TugDiagram
          selectedZone={locationOnTug}
          onSelectZone={setLocationOnTug}
        />
      </div>

      {/* Photos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-semibold text-charcoal mb-3">Photos of Damage</label>
        <ImageUpload
          images={images}
          onImagesChange={setImages}
          maxImages={5}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className={`w-full py-4 rounded-xl font-bold text-white text-base transition-all shadow-lg ${
          submitting
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-700 active:scale-[0.98]'
        }`}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting...
          </span>
        ) : (
          'Submit Damage Report'
        )}
      </button>
    </form>
  );
}

DuringShiftReport.propTypes = {
  selectedTug: PropTypes.object,
  onSubmitSuccess: PropTypes.func,
};
