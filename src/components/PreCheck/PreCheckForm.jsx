import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import CheckItemRow from './CheckItemRow';
import ImageUpload from './ImageUpload';
import { FORM_STATE_KEY } from '../../pages/PreCheckPage';

// All check items grouped into OUTSIDE and INSIDE
const OUTSIDE_ITEMS = [
  { key: 'tyres', label: 'Tyres' },
  { key: 'mud_flaps', label: 'Mud Flaps' },
  { key: 'head_lights', label: 'Head Lights' },
  { key: 'signal_lights', label: 'Signal Lights' },
  { key: 'brake_lights', label: 'Brake Lights' },
  { key: 'strobe_lights', label: 'Beacon Lights' },
  { key: 'mirrors', label: 'Mirrors' },
  { key: 'doors', label: 'Doors' },
  { key: 'windows', label: 'Windows' },
  { key: 'step_handles_platforms', label: 'Steps/Platforms' },
  { key: 'fifth_wheel_operation', label: '5th Wheel Operation' },
  { key: 'trailer_air_lines', label: 'Electric / Air Lines' },
  { key: 'fluid_leaks', label: 'Fluid Leaks' },
  { key: 'air_leaks', label: 'Air Leaks' },
  { key: 'wipers', label: 'Wipers' },
];

const INSIDE_ITEMS = [
  { key: 'seat', label: 'Seat' },
  { key: 'seat_belt', label: 'Seat Belt' },
  { key: 'heater', label: 'Heater' },
  { key: 'steering', label: 'Steering' },
  { key: 'throttle', label: 'Throttle' },
  { key: 'starter', label: 'Starter' },
  { key: 'service_brakes', label: 'Service Brakes' },
  { key: 'park_brake', label: 'Park Brake' },
  { key: 'cab_lights', label: 'Cab Lights' },
  { key: 'stickers', label: 'Stickers' },
  { key: 'king_pin_warning', label: 'King Pin Light' },
];

// Combined for validation and submission
const ALL_ITEMS = [...OUTSIDE_ITEMS, ...INSIDE_ITEMS];

// ─── Form persistence helpers ───
const loadSavedForm = () => {
  try {
    const s = sessionStorage.getItem(FORM_STATE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
};

const makeEmptyItems = () =>
  Object.fromEntries(ALL_ITEMS.map(item => [item.key, { status: '', notes: '', images: [] }]));

export default function PreCheckForm({ selectedTug, onSubmitSuccess, checkType = 'pre_shift' }) {
  const { user } = useAuth();

  // Restore form from sessionStorage if available
  const savedForm = loadSavedForm();
  const [checkItems, setCheckItems] = useState(() => {
    if (savedForm?.checkItems) {
      // Merge saved statuses/notes with fresh structure (images can't be restored)
      const fresh = makeEmptyItems();
      for (const key of Object.keys(fresh)) {
        if (savedForm.checkItems[key]) {
          fresh[key].status = savedForm.checkItems[key].status || '';
          fresh[key].notes = savedForm.checkItems[key].notes || '';
        }
      }
      return fresh;
    }
    return makeEmptyItems();
  });
  const [remarks, setRemarks] = useState(savedForm?.remarks || '');
  const [remarksImages, setRemarksImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // ─── Debounced save to sessionStorage ───
  const saveTimerRef = useRef(null);
  const saveToStorage = useCallback(() => {
    // Strip images (not serializable), save only status + notes
    const stripped = {};
    for (const key of Object.keys(checkItems)) {
      stripped[key] = { status: checkItems[key].status, notes: checkItems[key].notes };
    }
    try {
      sessionStorage.setItem(FORM_STATE_KEY, JSON.stringify({ checkItems: stripped, remarks }));
    } catch { /* ignore */ }
  }, [checkItems, remarks]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToStorage, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [saveToStorage]);

  const validate = () => {
    const newErrors = {};

    const uncheckedOutside = OUTSIDE_ITEMS.filter(item => !checkItems[item.key].status);
    if (uncheckedOutside.length > 0) {
      newErrors.outside = `Please check all Outside items (${uncheckedOutside.length} remaining)`;
    }

    const uncheckedInside = INSIDE_ITEMS.filter(item => !checkItems[item.key].status);
    if (uncheckedInside.length > 0) {
      newErrors.inside = `Please check all Inside items (${uncheckedInside.length} remaining)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadDamageImages = async (submissionId, damageImages) => {
    const urls = [];
    for (const img of damageImages) {
      if (!img.file) continue;
      const ext = img.file.name.split('.').pop();
      const filePath = `damages/${submissionId}/${img.id}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('precheck-images')
        .upload(filePath, img.file, { upsert: true });

      if (uploadError) {
        console.error('[PreCheckForm] Upload error:', uploadError);
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
    if (!validate()) return;
    if (!selectedTug) {
      alert('Please select a tug first.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create submission
      const { data: submission, error: subError } = await supabase
        .from('precheck_submissions')
        .insert({
          user_id: user.id,
          tug_id: selectedTug.id,
          check_type: checkType,
          remarks: remarks || null,
        })
        .select()
        .single();

      if (subError) throw subError;

      // 2. Insert all check items (return IDs for linking damages)
      const allRows = ALL_ITEMS.map(item => ({
        submission_id: submission.id,
        item_category: 'check',
        item_name: item.key,
        status: checkItems[item.key].status,
        notes: checkItems[item.key].notes || null,
      }));

      const { data: insertedItems, error: itemsError } = await supabase
        .from('precheck_items')
        .insert(allRows)
        .select('id, item_name');

      if (itemsError) throw itemsError;

      // Build a map of item_name → inserted row id
      const itemIdMap = {};
      if (insertedItems) {
        insertedItems.forEach(row => { itemIdMap[row.item_name] = row.id; });
      }

      // 3. Create damage from remarks (text and/or images)
      if (remarks || remarksImages.length > 0) {
        let remarksImageUrls = [];
        if (remarksImages.length > 0) {
          remarksImageUrls = await uploadDamageImages(submission.id, remarksImages);
        }
        await supabase.from('precheck_damages').insert({
          submission_id: submission.id,
          description: remarks || 'Additional photos',
          severity: 'minor',
          image_urls: remarksImageUrls,
        });
      }

      // 4. Insert damages from check items marked as repair_needed
      for (const item of ALL_ITEMS) {
        const ci = checkItems[item.key];
        if (ci.status === 'repair_needed' && (ci.images?.length > 0 || ci.notes)) {
          const imageUrls = ci.images?.length > 0
            ? await uploadDamageImages(submission.id, ci.images)
            : [];
          const { error: ciDamageError } = await supabase
            .from('precheck_damages')
            .insert({
              submission_id: submission.id,
              item_id: itemIdMap[item.key] || null,
              description: ci.notes || `${item.label} - repair needed`,
              severity: 'minor',
              image_urls: imageUrls,
            });
          if (ciDamageError) throw ciDamageError;
        }
      }

      // Clear saved form state
      try { sessionStorage.removeItem(FORM_STATE_KEY); } catch { /* */ }

      onSubmitSuccess?.(submission);
    } catch (err) {
      console.error('[PreCheckForm] Submit error:', err);
      alert('Error submitting PreCheck. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const outsideDone = OUTSIDE_ITEMS.every(item => checkItems[item.key].status);
  const insideDone = INSIDE_ITEMS.every(item => checkItems[item.key].status);
  const outsideRepairs = OUTSIDE_ITEMS.filter(item => checkItems[item.key].status === 'repair_needed').length;
  const insideRepairs = INSIDE_ITEMS.filter(item => checkItems[item.key].status === 'repair_needed').length;

  const [outsideOpen, setOutsideOpen] = useState(true);
  const [insideOpen, setInsideOpen] = useState(false);

  const outsideStatus = outsideDone ? (outsideRepairs > 0 ? 'issues' : 'done') : 'pending';
  const insideStatus = insideDone ? (insideRepairs > 0 ? 'issues' : 'done') : 'pending';

  const handleCheckChange = (key, status) => {
    setCheckItems(prev => ({ ...prev, [key]: { ...prev[key], status } }));
  };

  // Render a section
  const renderSection = (title, items, isOpen, setOpen, status, repairCount, errorKey) => (
    <div className={`rounded-xl overflow-hidden transition-all border ${
      status === 'done' ? 'border-green-300 bg-green-50'
        : status === 'issues' ? 'border-red-300 bg-red-50'
        : 'border-gray-200 bg-white'
    }`}>
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          status === 'done' ? 'bg-green-50'
            : status === 'issues' ? 'bg-red-50'
            : 'bg-slate-50'
        }`}
      >
        <h3 className="font-semibold text-charcoal text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          {status === 'done' && (
            <span className="text-xs text-green-700 font-semibold">All OK</span>
          )}
          {status === 'issues' && (
            <span className="text-xs text-red-700 font-semibold">{repairCount} issue{repairCount !== 1 ? 's' : ''}</span>
          )}
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div>
          {errors[errorKey] && (
            <p className="text-xs text-red-600 mx-4 mt-2 bg-red-50 p-2 rounded-lg">{errors[errorKey]}</p>
          )}
          <div className="px-2">
            {items.map(item => (
              <CheckItemRow
                key={item.key}
                label={item.label}
                value={checkItems[item.key].status}
                onChange={(status) => handleCheckChange(item.key, status)}
                notes={checkItems[item.key].notes}
                onNotesChange={(notes) => setCheckItems(prev => ({
                  ...prev,
                  [item.key]: { ...prev[item.key], notes }
                }))}
                images={checkItems[item.key].images}
                onImagesChange={(images) => setCheckItems(prev => ({
                  ...prev,
                  [item.key]: { ...prev[item.key], images }
                }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {renderSection('Outside Check', OUTSIDE_ITEMS, outsideOpen, setOutsideOpen, outsideStatus, outsideRepairs, 'outside')}
      {renderSection('Inside Check', INSIDE_ITEMS, insideOpen, setInsideOpen, insideStatus, insideRepairs, 'inside')}

      {/* Section 3: Remarks + Photos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-gray-100">
          <h3 className="font-semibold text-charcoal text-sm">Remarks</h3>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Any additional notes or observations..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
          />
          <ImageUpload
            images={remarksImages}
            onImagesChange={setRemarksImages}
            maxImages={3}
          />
        </div>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting}
        className={`w-full py-4 rounded-xl font-bold text-white text-base transition-all shadow-lg ${
          submitting
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-charcoal hover:bg-black active:scale-[0.98]'
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
          'Submit Pre-Shift Check'
        )}
      </button>
    </form>
  );
}

PreCheckForm.propTypes = {
  selectedTug: PropTypes.object,
  onSubmitSuccess: PropTypes.func,
  checkType: PropTypes.oneOf(['pre_shift', 'during_shift']),
};
