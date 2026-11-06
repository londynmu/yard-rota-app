import { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '../ui/Modal';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import { normalizePhoneE164 } from '../../utils/phoneE164';

/**
 * Blocking one-time prompt: approved shunters (role=user) must save a phone
 * number before using the app. WhatsApp opt-in stays optional (default off).
 */
export default function PhoneRequiredPrompt({ userId, onSaved }) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;

    let normalizedPhone = null;
    try {
      normalizedPhone = normalizePhoneE164(phone);
    } catch (err) {
      const message = err?.message || 'Enter a valid phone number';
      setFieldError(message);
      toast.error(message);
      return;
    }

    if (!normalizedPhone) {
      const message = 'Phone number is required';
      setFieldError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        phone_e164: normalizedPhone,
        whatsapp_opt_in: whatsappOptIn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    setSaving(false);

    if (error) {
      toast.error('Could not save your phone number. Try again.');
      return;
    }

    onSaved({ phone_e164: normalizedPhone, whatsapp_opt_in: whatsappOptIn });
  };

  return (
    <Modal isOpen onClose={() => {}} overlayClassName="z-[9999]">
      <h2 className="text-xl font-semibold mb-2 text-charcoal">Add your phone number</h2>
      <p className="text-gray-600 mb-6">
        We need your number to confirm shifts and send operational reminders about PreCheck and
        breaks. You only need to do this once.
      </p>

      <label htmlFor="phone-required-e164" className="block text-sm font-medium text-charcoal mb-1.5">
        Phone number
      </label>
      <input
        id="phone-required-e164"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
          setFieldError('');
        }}
        placeholder="+447… or 07…"
        disabled={saving}
        className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal ${
          fieldError ? 'border-red-400' : 'border-gray-300'
        }`}
      />
      {fieldError ? (
        <p className="text-xs text-red-500 mt-1">{fieldError}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">
          Phone is required so we can confirm your shifts and send operational reminders about
          PreCheck and breaks. UK numbers OK as 07… or +44….
        </p>
      )}

      <label
        htmlFor="phone-required-whatsapp"
        className="mt-5 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer"
      >
        <input
          id="phone-required-whatsapp"
          type="checkbox"
          checked={whatsappOptIn}
          onChange={(event) => setWhatsappOptIn(event.target.checked)}
          disabled={saving}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-charcoal focus:ring-charcoal"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-charcoal">Enable WhatsApp reminders</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Optional. Operational reminders only — not marketing. You can turn this off anytime in
            Profile.
          </span>
        </span>
      </label>

      <div className="flex justify-end mt-6">
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

PhoneRequiredPrompt.propTypes = {
  userId: PropTypes.string.isRequired,
  onSaved: PropTypes.func.isRequired,
};
