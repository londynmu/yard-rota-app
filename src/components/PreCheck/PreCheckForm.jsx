import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import PerformItemRow from './PerformItemRow';
import CheckItemRow from './CheckItemRow';
import ImageUpload from './ImageUpload';

// Items from the Daily Check Sheet
const PERFORM_ITEMS = [
  { key: 'fuel_level', label: 'Check Fuel Level' },
  { key: 'engine_oil_level', label: 'Check Engine Oil Level' },
  { key: 'hydraulic_fluid', label: 'Check Hydraulic Fluid' },
  { key: 'engine_coolant_level', label: 'Check Engine Coolant Level' },
  { key: 'drain_water_air_tanks', label: 'Drain Water from Air Tanks' },
  { key: 'transmission_fluid_level', label: 'Check Transmission Fluid Level' },
];

const CHECK_ITEMS = [
  // Column 1
  { key: 'step_handles_platforms', label: 'Step/Handles/Platforms' },
  { key: 'starter', label: 'Starter' },
  { key: 'heater', label: 'Heater' },
  { key: 'mirrors', label: 'Mirrors' },
  { key: 'doors', label: 'Doors' },
  { key: 'windows', label: 'Windows' },
  { key: 'wipers', label: 'Wipers' },
  { key: 'seat', label: 'Seat' },
  { key: 'seat_belt', label: 'Seat Belt' },
  // Column 2
  { key: 'steering', label: 'Steering' },
  { key: 'throttle', label: 'Throttle' },
  { key: 'fifth_wheel_operation', label: '5th Wheel Operation' },
  { key: 'service_brakes', label: 'Service Brakes' },
  { key: 'park_brake', label: 'Park Brake' },
  { key: 'trailer_air_lines', label: 'Trailer Air Lines' },
  { key: 'strobe_lights', label: 'Strobe Lights' },
  { key: 'head_lights', label: 'Head Lights' },
  { key: 'signal_lights', label: 'Signal Lights' },
  // Column 3
  { key: 'brake_lights', label: 'Brake Lights' },
  { key: 'cab_lights', label: 'Cab Lights' },
  { key: 'fluid_leaks', label: 'Fluid Leaks' },
  { key: 'mud_flaps', label: 'Mud Flaps' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'stickers', label: 'Stickers' },
  { key: 'air_leaks', label: 'Air Leaks' },
  // King pin
  { key: 'king_pin_warning', label: 'King Pin Detection (Red=No / Green=Yes)' },
];

export default function PreCheckForm({ selectedTug, onSubmitSuccess, checkType = 'pre_shift' }) {
  const { user } = useAuth();
  const [performItems, setPerformItems] = useState(
    Object.fromEntries(PERFORM_ITEMS.map(item => [item.key, false]))
  );
  const [checkItems, setCheckItems] = useState(
    Object.fromEntries(CHECK_ITEMS.map(item => [item.key, { status: '', notes: '', images: [] }]))
  );
  const [remarks, setRemarks] = useState('');
  const [remarksImages, setRemarksImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    // All perform items must be checked
    const uncheckedPerform = PERFORM_ITEMS.filter(item => !performItems[item.key]);
    if (uncheckedPerform.length > 0) {
      newErrors.perform = `Please complete all items: ${uncheckedPerform.map(i => i.label).join(', ')}`;
    }

    // All check items must have OK or Repair
    const uncheckedItems = CHECK_ITEMS.filter(item => !checkItems[item.key].status);
    if (uncheckedItems.length > 0) {
      newErrors.check = `Please mark all items as OK or Repair Needed: ${uncheckedItems.map(i => i.label).join(', ')}`;
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

      // 2. Insert perform items
      const performRows = PERFORM_ITEMS.map(item => ({
        submission_id: submission.id,
        item_category: 'perform',
        item_name: item.key,
        status: performItems[item.key] ? 'completed' : 'ok',
        notes: null,
      }));

      // 3. Insert check items
      const checkRows = CHECK_ITEMS.map(item => ({
        submission_id: submission.id,
        item_category: 'check',
        item_name: item.key,
        status: checkItems[item.key].status,
        notes: checkItems[item.key].notes || null,
      }));

      const { error: itemsError } = await supabase
        .from('precheck_items')
        .insert([...performRows, ...checkRows]);

      if (itemsError) throw itemsError;

      // 4. Upload remarks images if any
      if (remarksImages.length > 0) {
        const remarksImageUrls = await uploadDamageImages(submission.id, remarksImages);
        // Store remarks image URLs as a general damage entry
        if (remarksImageUrls.length > 0) {
          await supabase.from('precheck_damages').insert({
            submission_id: submission.id,
            description: remarks || 'Additional photos',
            severity: 'minor',
            image_urls: remarksImageUrls,
          });
        }
      }

      // 5. Insert damages from check items marked as repair_needed (with photos)
      for (const item of CHECK_ITEMS) {
        const ci = checkItems[item.key];
        if (ci.status === 'repair_needed' && (ci.images?.length > 0 || ci.notes)) {
          const imageUrls = ci.images?.length > 0
            ? await uploadDamageImages(submission.id, ci.images)
            : [];
          const { error: ciDamageError } = await supabase
            .from('precheck_damages')
            .insert({
              submission_id: submission.id,
              description: ci.notes || `${item.label} - repair needed`,
              severity: 'minor',
              image_urls: imageUrls,
            });
          if (ciDamageError) throw ciDamageError;
        }
      }

      onSubmitSuccess?.(submission);
    } catch (err) {
      console.error('[PreCheckForm] Submit error:', err);
      alert('Error submitting PreCheck. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const allPerformChecked = PERFORM_ITEMS.every(item => performItems[item.key]);
  const allChecksDone = CHECK_ITEMS.every(item => checkItems[item.key].status);
  const repairCount = CHECK_ITEMS.filter(item => checkItems[item.key].status === 'repair_needed').length;

  // Section states: auto-collapse when complete
  const [fluidsOpen, setFluidsOpen] = useState(true);
  const [inspectionOpen, setInspectionOpen] = useState(false);

  // Auto-collapse fluids when all checked, open inspection
  const handlePerformChange = (key, checked) => {
    const next = { ...performItems, [key]: checked };
    setPerformItems(next);
    if (PERFORM_ITEMS.every(item => next[item.key])) {
      setTimeout(() => {
        setFluidsOpen(false);
        setInspectionOpen(true);
      }, 400);
    }
  };

  // Section status helpers
  const fluidsStatus = allPerformChecked ? 'done' : 'pending';
  const inspectionStatus = allChecksDone
    ? (repairCount > 0 ? 'issues' : 'done')
    : 'pending';

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Section 1: Fluid Checks - collapsible */}
      <div className={`rounded-xl overflow-hidden transition-all border ${
        fluidsStatus === 'done' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
      }`}>
        <button
          type="button"
          onClick={() => setFluidsOpen(!fluidsOpen)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
            fluidsStatus === 'done' ? 'bg-green-50' : 'bg-slate-50'
          }`}
        >
          <h3 className="font-semibold text-charcoal text-sm">Fluid & Level Checks</h3>
          <div className="flex items-center gap-2">
            {fluidsStatus === 'done' && (
              <span className="text-xs text-green-700 font-semibold">All Checked</span>
            )}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${fluidsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {fluidsOpen && (
          <div>
            {errors.perform && (
              <p className="text-xs text-red-600 mx-4 mt-2 bg-red-50 p-2 rounded-lg">{errors.perform}</p>
            )}
            <div className="px-4 divide-y divide-gray-100">
              {PERFORM_ITEMS.map(item => (
                <PerformItemRow
                  key={item.key}
                  label={item.label}
                  checked={performItems[item.key]}
                  onChange={(checked) => handlePerformChange(item.key, checked)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Vehicle Inspection - collapsible */}
      <div className={`rounded-xl overflow-hidden transition-all border ${
        inspectionStatus === 'done' ? 'border-green-300 bg-green-50'
          : inspectionStatus === 'issues' ? 'border-red-300 bg-red-50'
          : 'border-gray-200 bg-white'
      }`}>
        <button
          type="button"
          onClick={() => setInspectionOpen(!inspectionOpen)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
            inspectionStatus === 'done' ? 'bg-green-50'
              : inspectionStatus === 'issues' ? 'bg-red-50'
              : 'bg-slate-50'
          }`}
        >
          <h3 className="font-semibold text-charcoal text-sm">Vehicle Inspection</h3>
          <div className="flex items-center gap-2">
            {inspectionStatus === 'done' && (
              <span className="text-xs text-green-700 font-semibold">All OK</span>
            )}
            {inspectionStatus === 'issues' && (
              <span className="text-xs text-red-700 font-semibold">{repairCount} issue{repairCount !== 1 ? 's' : ''}</span>
            )}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${inspectionOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {inspectionOpen && (
          <div>
            {/* Legend - aligned right to match button positions */}
            <div className="flex items-center justify-end gap-3 py-2 px-1 border-b border-gray-100">
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </span>
                Issue
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-5 h-5 rounded bg-green-500 text-white flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </span>
                OK
              </span>
            </div>
            {errors.check && (
              <p className="text-xs text-red-600 mx-4 mt-2 bg-red-50 p-2 rounded-lg">{errors.check}</p>
            )}
            <div className="px-2">
              {CHECK_ITEMS.map(item => (
                <CheckItemRow
                  key={item.key}
                  label={item.label}
                  value={checkItems[item.key].status}
                  onChange={(status) => setCheckItems(prev => ({
                    ...prev,
                    [item.key]: { ...prev[item.key], status }
                  }))}
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
