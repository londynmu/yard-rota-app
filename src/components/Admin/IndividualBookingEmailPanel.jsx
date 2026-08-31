import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { logSystemActivity } from '../../lib/systemActivityLog';
import { useToast } from '../ui/ToastContext';
import {
  buildIndividualBookingEmail,
  buildMailtoHref,
  formatEmailForClipboard,
  formatShiftClock,
  formatShiftDayLabel,
  formatShiftTypeLabel,
  isMailtoTooLong,
  parseAgencyEmails,
  staffDisplayName,
} from '../../utils/rotaAdditionalBookings';
import { fetchAssignedSlotsForWeek, weekStartIso } from '../../utils/rotaWeekBaseline';

const outlineBtn =
  'px-4 py-2 rounded-lg border-2 border-rota-text-primary bg-white text-rota-text-primary hover:bg-rota-day-other-bg-from transition-colors text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

function groupSlotsByPerson(slots) {
  const byPerson = new Map();
  for (const slot of slots || []) {
    if (!slot?.user_id) continue;
    if (!byPerson.has(slot.user_id)) {
      byPerson.set(slot.user_id, {
        userId: slot.user_id,
        name: staffDisplayName(slot),
        agencyId: slot.agency_id || null,
        agencyName: slot.agency_name || 'No agency',
        agencyEmail: slot.agency_email || '',
        shifts: [],
      });
    }
    byPerson.get(slot.user_id).shifts.push({
      date: slot.date,
      shift_type: slot.shift_type || '',
      start_time: formatShiftClock(slot.start_time),
      end_time: formatShiftClock(slot.end_time),
      location: slot.location || '',
    });
  }

  return Array.from(byPerson.values())
    .map((person) => {
      person.shifts.sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.start_time.localeCompare(b.start_time);
      });
      return person;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function IndividualBookingEmailPanel({ startDate, currentUser }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const weekIso = weekStartIso(startDate);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const slots = await fetchAssignedSlotsForWeek(supabase, startDate);
      const grouped = groupSlotsByPerson(slots);
      setPeople(grouped);
      setSelectedUserId((prev) => {
        if (prev && grouped.some((person) => person.userId === prev)) return prev;
        return grouped[0]?.userId || '';
      });
    } catch (err) {
      console.error('Failed to load assigned slots for individual email', err);
      toast.error('Could not load assigned shifts for this week');
      setPeople([]);
      setSelectedUserId('');
    } finally {
      setLoading(false);
    }
  }, [startDate, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.userId === selectedUserId) || null,
    [people, selectedUserId]
  );

  useEffect(() => {
    if (!selectedPerson) {
      setSelectedDates([]);
      return;
    }
    setSelectedDates(selectedPerson.shifts.map((shift) => shift.date));
  }, [selectedUserId, selectedPerson]);

  const query = searchQuery.trim().toLowerCase();
  const filteredPeople = people.filter((person) => person.name.toLowerCase().includes(query));

  const selectedShifts = useMemo(() => {
    if (!selectedPerson) return [];
    const dateSet = new Set(selectedDates);
    return selectedPerson.shifts.filter((shift) => dateSet.has(shift.date));
  }, [selectedPerson, selectedDates]);

  const toggleDate = (date) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date].sort()
    );
  };

  const copyEmail = async (email) => {
    try {
      await navigator.clipboard.writeText(formatEmailForClipboard(email));
      toast.success('Email copied to clipboard');
    } catch (err) {
      console.error(err);
      toast.error('Could not copy email');
    }
  };

  const createEmail = async () => {
    if (!selectedPerson) {
      toast.warning('Select a person first');
      return;
    }
    if (selectedShifts.length === 0) {
      toast.warning('Select at least one day');
      return;
    }

    const emails = parseAgencyEmails(selectedPerson.agencyEmail);
    if (!emails.length) {
      toast.error('This agency has no email address');
      return;
    }

    const email = buildIndividualBookingEmail({
      weekStartIso: weekIso,
      personName: selectedPerson.name,
      shifts: selectedShifts,
    });
    const href = buildMailtoHref({ emails, subject: email.subject, body: email.body });
    const tooLong = isMailtoTooLong(href, email.body);

    try {
      await logSystemActivity(supabase, currentUser, {
        entity_type: 'rota',
        action_type: 'individual_booking_email_drafted',
        payload: {
          week_start: weekIso,
          user_id: selectedPerson.userId,
          person_name: selectedPerson.name,
          agency_id: selectedPerson.agencyId,
          agency_name: selectedPerson.agencyName,
          dates: selectedShifts.map((shift) => shift.date),
          slots_count: selectedShifts.length,
        },
      });
    } catch (err) {
      console.error('Failed to log individual booking email activity', err);
    }

    if (tooLong) {
      await copyEmail(email);
      toast.warning('Email is too long for the mail app. It was copied instead.');
      return;
    }

    window.location.href = href;
    toast.success('Email draft prepared');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Create an agency email for a specific person and day at any time. This does not change the sent baseline.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading assigned shifts...</p>
      ) : people.length === 0 ? (
        <div className="card-modern p-4">
          <p className="text-sm text-charcoal">No assigned shifts for this week.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div>
            <label htmlFor="individual-person" className="mb-1 block text-sm font-medium text-charcoal">
              Person
            </label>
            <select
              id="individual-person"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
            >
              {filteredPeople.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
            {searchQuery && filteredPeople.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">No people match this search.</p>
            )}
          </div>

          {selectedPerson && (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-charcoal">Days</p>
                <div className="space-y-2">
                  {selectedPerson.shifts.map((shift) => {
                    const checked = selectedDates.includes(shift.date);
                    return (
                      <label
                        key={`${shift.date}|${shift.start_time}|${shift.location}`}
                        className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-charcoal"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDate(shift.date)}
                          className="mt-0.5"
                        />
                        <span>
                          {formatShiftDayLabel(shift.date)}, {formatShiftTypeLabel(shift.shift_type)},{' '}
                          {shift.start_time}-{shift.end_time}
                          {shift.location ? `, ${shift.location}` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="card-modern p-4 space-y-2">
                <p className="text-sm font-medium text-charcoal">Preview</p>
                <p className="text-xs text-gray-500">
                  {selectedPerson.agencyName}
                  {selectedPerson.agencyEmail ? ` · ${selectedPerson.agencyEmail}` : ' · No email on file'}
                </p>
                {selectedShifts.length === 0 ? (
                  <p className="text-sm text-gray-600">Select at least one day to include in the email.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-gray-600">
                    {selectedShifts.map((shift) => (
                      <li key={`preview-${shift.date}|${shift.start_time}|${shift.location}`}>
                        {formatShiftDayLabel(shift.date)}, {formatShiftTypeLabel(shift.shift_type)},{' '}
                        {shift.start_time}-{shift.end_time}
                        {shift.location ? `, ${shift.location}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                className={outlineBtn}
                disabled={selectedShifts.length === 0}
                onClick={createEmail}
              >
                Create email
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

IndividualBookingEmailPanel.propTypes = {
  startDate: PropTypes.instanceOf(Date).isRequired,
  currentUser: PropTypes.object,
};

IndividualBookingEmailPanel.defaultProps = {
  currentUser: null,
};
