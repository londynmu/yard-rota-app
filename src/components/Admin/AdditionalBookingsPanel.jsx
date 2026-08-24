import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { logSystemActivity } from '../../lib/systemActivityLog';
import { useToast } from '../ui/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  buildAdditionalBookingsEmail,
  buildMailtoHref,
  countAdditionalPeople,
  diffAddedSlots,
  formatEmailForClipboard,
  formatShiftClock,
  formatShiftDayLabel,
  formatShiftTypeLabel,
  groupAddedSlotsByAgency,
  isMailtoTooLong,
  parseAgencyEmails,
} from '../../utils/rotaAdditionalBookings';
import {
  ensureWeekBaseline,
  fetchAssignedSlotsForWeek,
  loadWeekBaseline,
  mergeSlotsIntoBaseline,
  resetWeekBaseline,
  weekStartIso,
} from '../../utils/rotaWeekBaseline';

const outlineBtn =
  'px-4 py-2 rounded-lg border-2 border-rota-text-primary bg-white text-rota-text-primary hover:bg-rota-day-other-bg-from transition-colors text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

function flattenPeopleShifts(people) {
  return people.flatMap((person) =>
    person.shifts.map((shift) => ({
      user_id: person.userId,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      location: shift.location,
      shift_type: shift.shift_type,
    }))
  );
}

export default function AdditionalBookingsPanel({ startDate, currentUser, onBaselineChanged }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [groups, setGroups] = useState([]);
  const [currentSlotCount, setCurrentSlotCount] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const weekIso = weekStartIso(startDate);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [{ baseline: header, slots: baselineSlots }, currentSlots] = await Promise.all([
        loadWeekBaseline(supabase, weekIso),
        fetchAssignedSlotsForWeek(supabase, startDate),
      ]);
      setBaseline(header);
      setCurrentSlotCount(currentSlots.length);
      if (!header) {
        setGroups([]);
        return;
      }
      const added = diffAddedSlots(currentSlots, baselineSlots);
      setGroups(groupAddedSlotsByAgency(added, baselineSlots));
    } catch (err) {
      console.error('Failed to load additional bookings', err);
      toast.error('Could not load additional bookings for this week');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, weekIso]);

  useEffect(() => {
    reload();
  }, [reload]);

  const notifyBaselineChanged = () => {
    if (onBaselineChanged) onBaselineChanged();
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

  const openAndMarkSent = async ({ people, agencyId, agencyEmail, agencyName }) => {
    const emails = parseAgencyEmails(agencyEmail);
    if (!emails.length) {
      toast.error('This agency has no email address');
      return;
    }
    const email = buildAdditionalBookingsEmail({ weekStartIso: weekIso, people });
    const href = buildMailtoHref({ emails, subject: email.subject, body: email.body });
    const tooLong = isMailtoTooLong(href, email.body);

    try {
      await mergeSlotsIntoBaseline(supabase, baseline.id, flattenPeopleShifts(people));
      await logSystemActivity(supabase, currentUser, {
        entity_type: 'rota',
        action_type: 'additional_bookings_sent',
        payload: {
          week_start: weekIso,
          agency_id: agencyId || null,
          agency_name: agencyName || null,
          slots_count: flattenPeopleShifts(people).length,
          people_count: people.length,
        },
      });
      if (tooLong) {
        await copyEmail(email);
        toast.warning('Email is too long for the mail app. It was copied instead.');
      } else {
        window.location.href = href;
        toast.success('Email draft prepared and bookings marked as sent');
      }
      await reload();
      notifyBaselineChanged();
    } catch (err) {
      console.error(err);
      toast.error('Could not mark additional bookings as sent');
    }
  };

  const markCurrentAsSent = async () => {
    try {
      const slots = await fetchAssignedSlotsForWeek(supabase, startDate);
      const result = await ensureWeekBaseline(supabase, {
        weekStartIso: weekIso,
        source: 'manual',
        slots,
        userId: currentUser?.id,
      });
      if (result.created) {
        await logSystemActivity(supabase, currentUser, {
          entity_type: 'rota',
          action_type: 'rota_baseline_created',
          payload: { week_start: weekIso, source: 'manual', slots_count: slots.length },
        });
        toast.success('Current rota marked as sent');
      } else if (result.reason === 'empty') {
        toast.warning('No assigned shifts to mark as sent');
      } else {
        toast.info('This week already has a baseline');
      }
      await reload();
      notifyBaselineChanged();
    } catch (err) {
      console.error(err);
      toast.error('Could not mark this week as sent');
    }
  };

  const resetBaseline = async () => {
    try {
      await resetWeekBaseline(supabase, weekIso);
      toast.success('Baseline reset for this week');
      await reload();
      notifyBaselineChanged();
    } catch (err) {
      console.error(err);
      toast.error('Could not reset the baseline');
    }
  };

  const pendingPeople = countAdditionalPeople(groups);
  const query = searchQuery.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      people: group.people.filter((person) => person.name.toLowerCase().includes(query)),
    }))
    .filter((group) => group.people.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Extra people and extra shifts added after this week was first downloaded or sent.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading additional bookings...</p>
      ) : !baseline ? (
        <div className="card-modern p-4 space-y-3">
          <p className="text-sm text-charcoal">
            Download or send the weekly schedule first. If you already sent it, mark the current rota as sent.
          </p>
          <button
            type="button"
            className={outlineBtn}
            disabled={currentSlotCount === 0}
            onClick={() =>
              setConfirm({
                title: 'Mark current rota as sent',
                message: 'Use the current assigned rota as the baseline for this week? Future extra bookings will be compared against it.',
                confirmText: 'Mark as sent',
                onConfirm: markCurrentAsSent,
              })
            }
          >
            Mark current rota as sent
          </button>
        </div>
      ) : pendingPeople === 0 ? (
        <div className="card-modern p-4 space-y-3">
          <p className="text-sm text-charcoal">No additional bookings for this week.</p>
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

          {filteredGroups.length === 0 ? (
            <p className="text-sm text-charcoal">No people match this search.</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.agencyId || 'none'} className="card-modern p-4 space-y-3">
                <div>
                  <h3 className="text-lg font-medium text-charcoal">{group.agencyName}</h3>
                  <p className="text-xs text-gray-500">
                    {group.agencyEmail || 'No email on file'}
                  </p>
                </div>

                <ul className="space-y-3">
                  {group.people.map((person) => (
                    <li key={person.userId} className="border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-medium text-charcoal">{person.name}</span>
                        <span className="rounded-full border border-slate-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {person.kind === 'new' ? 'New' : 'Extra'}
                        </span>
                      </div>
                      <ul className="space-y-1 text-sm text-gray-600">
                        {person.shifts.map((shift) => (
                          <li key={`${shift.date}|${shift.start_time}|${shift.location}`}>
                            {formatShiftDayLabel(shift.date)}, {formatShiftTypeLabel(shift.shift_type)},{' '}
                            {formatShiftClock(shift.start_time)}-{formatShiftClock(shift.end_time)}
                            {shift.location ? `, ${shift.location}` : ''}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <button
                          type="button"
                          className={outlineBtn}
                          onClick={() =>
                            setConfirm({
                              title: 'Open email and mark as sent',
                              message: `Create an email to ${group.agencyName} for ${person.name} and mark these shifts as sent?`,
                              confirmText: 'Create email',
                              onConfirm: () =>
                                openAndMarkSent({
                                  people: [person],
                                  agencyId: group.agencyId,
                                  agencyEmail: group.agencyEmail,
                                  agencyName: group.agencyName,
                                }),
                            })
                          }
                        >
                          Create email for this person
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {baseline && (
        <button
          type="button"
          className="px-4 py-2 rounded-lg border-2 border-red-500 bg-white text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
          onClick={() =>
            setConfirm({
              title: 'Reset baseline for this week',
              message: 'This will forget what was already sent to agencies for this week. This action cannot be undone.',
              confirmText: 'Reset baseline',
              isDestructive: true,
              onConfirm: resetBaseline,
            })
          }
        >
          Reset baseline for this week
        </button>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm?.()}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmText={confirm?.confirmText || 'OK'}
        isDestructive={Boolean(confirm?.isDestructive)}
        overlayClassName="z-[10000]"
      />
    </div>
  );
}

AdditionalBookingsPanel.propTypes = {
  startDate: PropTypes.instanceOf(Date).isRequired,
  currentUser: PropTypes.object,
  onBaselineChanged: PropTypes.func,
};

AdditionalBookingsPanel.defaultProps = {
  currentUser: null,
  onBaselineChanged: null,
};
