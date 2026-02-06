import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import PerformItemRow from './PerformItemRow';
import CheckItemRow from './CheckItemRow';
import DamageReport from './DamageReport';

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
    Object.fromEntries(CHECK_ITEMS.map(item => [item.key, { status: '', notes: '' }]))
  );
  const [damages, setDamages] = useState([]);
  const [remarks, setRemarks] = useState('');
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

      // 4. Insert damages if any
      if (damages.length > 0) {
        for (const damage of damages) {
          // Upload images first
          const imageUrls = await uploadDamageImages(submission.id, damage.images);

          const { error: damageError } = await supabase
            .from('precheck_damages')
            .insert({
              submission_id: submission.id,
              description: damage.description,
              location_on_tug: damage.location_on_tug,
              severity: damage.severity,
              image_urls: imageUrls,
            });

          if (damageError) throw damageError;
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-charcoal text-white rounded-xl flex items-center justify-center font-bold text-lg">
            {selectedTug?.display_name || selectedTug?.tug_number?.slice(0, 5) || '?'}
          </div>
          <div>
            <h3 className="font-bold text-charcoal">{selectedTug?.tug_number || 'No Tug Selected'}</h3>
            <p className="text-xs text-gray-500">
              {checkType === 'pre_shift' ? 'Pre-Shift Check' : 'During Shift Report'} 
              {' • '}{new Date().toLocaleDateString('en-GB')}
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Perform the Following */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm">Perform the Following</h3>
          {allPerformChecked && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">All done</span>
          )}
        </div>
        {errors.perform && (
          <p className="text-xs text-red-600 mb-2 bg-red-50 p-2 rounded-lg">{errors.perform}</p>
        )}
        <div className="divide-y divide-gray-100">
          {PERFORM_ITEMS.map(item => (
            <PerformItemRow
              key={item.key}
              label={item.label}
              checked={performItems[item.key]}
              onChange={(checked) => setPerformItems(prev => ({ ...prev, [item.key]: checked }))}
            />
          ))}
        </div>
      </div>

      {/* Section 2: Check Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm">
            Check Items - Mark OK or Repair Needed
          </h3>
          <div className="flex items-center gap-2">
            {repairCount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {repairCount} repair{repairCount !== 1 ? 's' : ''}
              </span>
            )}
            {allChecksDone && repairCount === 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">All OK</span>
            )}
          </div>
        </div>
        {errors.check && (
          <p className="text-xs text-red-600 mb-2 bg-red-50 p-2 rounded-lg">{errors.check}</p>
        )}
        <div>
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
            />
          ))}
        </div>
      </div>

      {/* Section 3: Damage Reports */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <DamageReport damages={damages} onDamagesChange={setDamages} />
      </div>

      {/* Section 4: Remarks */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-semibold text-charcoal mb-2">Remarks</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Any additional notes or observations..."
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
        />
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
          `Submit ${checkType === 'pre_shift' ? 'Pre-Shift' : 'Damage'} Check`
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
