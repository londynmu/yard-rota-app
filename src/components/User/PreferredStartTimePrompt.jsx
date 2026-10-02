import { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import { defaultPreferredStartTime, QUARTER_HOUR_TIMES } from '../../utils/preferredStartTime';

export default function PreferredStartTimePrompt({ userId, shiftPreference, onSaved }) {
  const toast = useToast();
  const [time, setTime] = useState(() => defaultPreferredStartTime(shiftPreference));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        preferred_start_time: time,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    setSaving(false);

    if (error) {
      toast.error('Could not save your start time. Try again.');
      return;
    }

    onSaved(time);
  };

  return (
    <Modal isOpen onClose={() => {}} overlayClassName="z-[9999]">
      <h2 className="text-xl font-semibold mb-2 text-charcoal">When do you want to start work?</h2>
      <p className="text-gray-600 mb-6">
        Shift hours have changed. Choose the time you want to start. You only need to answer this once.
      </p>
      <label htmlFor="preferred-start-time" className="block text-sm font-medium text-charcoal mb-1.5">
        Preferred start time
      </label>
      <select
        id="preferred-start-time"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-charcoal focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal mb-6"
        disabled={saving}
      >
        {QUARTER_HOUR_TIMES.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg border-2 border-charcoal bg-white text-charcoal hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

PreferredStartTimePrompt.propTypes = {
  userId: PropTypes.string.isRequired,
  shiftPreference: PropTypes.string,
  onSaved: PropTypes.func.isRequired,
};
