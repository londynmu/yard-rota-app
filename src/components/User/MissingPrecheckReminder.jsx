import { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import { isWhatsAppMessagingReady } from '../../utils/phoneE164';

export const buildPrecheckReminderText = (people) => {
  const lines = people.map((person) => {
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
    const start = person.start_time || '??:??';
    const end = person.end_time || '??:??';
    return `- ${name} (${start}-${end})`;
  });
  const intro = people.length === 1
    ? 'This shunter is on shift and has not completed a pre-shift check:'
    : 'These shunters are on shift and have not completed a pre-shift check:';
  return [
    'Pre-shift check reminder',
    '',
    intro,
    '',
    ...lines,
    '',
    'Please complete your tug check in the app.',
  ].join('\n');
};

export default function MissingPrecheckReminder({ people }) {
  const toast = useToast();
  const [sendingId, setSendingId] = useState(null);
  if (!people || people.length === 0) return null;

  const handleCopy = async (event) => {
    event.stopPropagation();
    const text = buildPrecheckReminderText(people);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Reminder copied.');
    } catch {
      toast.error('Could not copy the reminder.');
    }
  };

  const handleForceSend = async (event, person) => {
    event.stopPropagation();
    if (!person?.user_id || !person?.rota_id) {
      toast.error('Missing shift details for WhatsApp send.');
      return;
    }
    if (!isWhatsAppMessagingReady(person)) {
      toast.error('This person needs a phone number and WhatsApp consent first.');
      return;
    }

    setSendingId(person.user_id);
    try {
      const { data, error } = await supabase.functions.invoke(
        'send-precheck-whatsapp-reminders',
        {
          body: {
            force_user_id: person.user_id,
            force_rota_id: person.rota_id,
          },
        },
      );
      if (error) throw error;
      const first = Array.isArray(data?.results) ? data.results[0] : null;
      if (first?.ok) {
        toast.success('WhatsApp reminder sent.');
      } else if (first?.skipped) {
        toast.error(first.reason === 'already_sent'
          ? 'Already sent for this shift (use log for history).'
          : first.reason || 'Send skipped.');
      } else {
        toast.error(first?.error || data?.error || 'WhatsApp send failed.');
      }
    } catch (err) {
      console.error('[MissingPrecheckReminder] force send', err);
      toast.error(err?.message || 'WhatsApp send failed.');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div
      className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-charcoal">No pre-shift check</p>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
        >
          Copy
        </button>
      </div>
      <ul className="mt-1 space-y-1.5">
        {people.map((person) => {
          const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
          const waReady = isWhatsAppMessagingReady(person);
          return (
            <li
              key={`${person.user_id}-${person.rota_id || person.start_time}`}
              className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700"
            >
              <span>
                {name} ({person.start_time || '??:??'}-{person.end_time || '??:??'})
              </span>
              <button
                type="button"
                disabled={!waReady || sendingId === person.user_id || !person.rota_id}
                title={
                  waReady
                    ? 'Send WhatsApp reminder now'
                    : 'Needs phone + WhatsApp consent'
                }
                onClick={(event) => handleForceSend(event, person)}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendingId === person.user_id ? 'Sending…' : 'Send WhatsApp now'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

MissingPrecheckReminder.propTypes = {
  people: PropTypes.arrayOf(PropTypes.shape({
    user_id: PropTypes.string,
    rota_id: PropTypes.string,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    start_time: PropTypes.string,
    end_time: PropTypes.string,
    phone_e164: PropTypes.string,
    whatsapp_opt_in: PropTypes.bool,
  })),
};
