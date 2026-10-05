import PropTypes from 'prop-types';
import { useToast } from '../ui/ToastContext';

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
      <ul className="mt-1 space-y-0.5">
        {people.map((person) => {
          const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
          return (
            <li key={person.user_id} className="text-xs text-slate-700">
              {name} ({person.start_time || '??:??'}-{person.end_time || '??:??'})
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
    first_name: PropTypes.string,
    last_name: PropTypes.string,
    start_time: PropTypes.string,
    end_time: PropTypes.string,
  })),
};
