import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { addDays, format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { logSystemActivity } from '../../lib/systemActivityLog';
import { useToast } from '../ui/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  buildAdditionalBookingsEmail,
  countAdditionalPeople,
  defaultCcAgencyIds,
  diffAddedSlots,
  formatShiftClock,
  formatShiftDayLabel,
  formatShiftTypeLabel,
  groupAddedSlotsByAgency,
  parseAgencyEmails,
  resolveCcAgencies,
} from '../../utils/rotaAdditionalBookings';
import {
  ensureWeekBaseline,
  fetchAssignedSlotsForWeek,
  loadWeekBaseline,
  mergeSlotsIntoBaseline,
  weekStartIso,
} from '../../utils/rotaWeekBaseline';

const ROTA_EMAIL_FROM = 'bookings@shunters.net';
const ROTA_EMAIL_FROM_NAME = 'Rugby Shunters Rota';

const outlineBtn = 'admin-btn';

const compactEmailBtn =
  'inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-rota-toolbar-border bg-white px-2.5 text-xs font-semibold text-rota-text-primary transition hover:bg-rota-day-other-bg-from/40 disabled:cursor-not-allowed disabled:opacity-50';

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

export default function AdditionalBookingsPanel({
  startDate,
  currentUser,
  onBaselineChanged,
  agencies: agenciesProp,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [groups, setGroups] = useState([]);
  const [currentSlotCount, setCurrentSlotCount] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [sendPreview, setSendPreview] = useState(null);
  const [showCcChooser, setShowCcChooser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [agenciesLocal, setAgenciesLocal] = useState([]);

  const agencies = Array.isArray(agenciesProp) && agenciesProp.length > 0
    ? agenciesProp
    : agenciesLocal;

  const weekIso = weekStartIso(startDate);
  const weekEndIso = format(addDays(startDate, 6), 'yyyy-MM-dd');

  useEffect(() => {
    if (Array.isArray(agenciesProp) && agenciesProp.length > 0) return undefined;
    let cancelled = false;
    const loadAgencies = async () => {
      try {
        const { data, error } = await supabase
          .from('agencies')
          .select('id, name, email, is_active')
          .eq('is_active', true)
          .order('name');
        if (error) throw error;
        if (!cancelled) setAgenciesLocal(data || []);
      } catch (err) {
        console.error('Failed to load agencies for CC', err);
        if (!cancelled) setAgenciesLocal([]);
      }
    };
    loadAgencies();
    return () => {
      cancelled = true;
    };
  }, [agenciesProp]);

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

  const openSendPreview = ({ people, agencyId, agencyEmail, agencyName }) => {
    const emails = parseAgencyEmails(agencyEmail);
    if (!emails.length) {
      toast.error('This agency has no email address');
      return;
    }
    const email = buildAdditionalBookingsEmail({ weekStartIso: weekIso, people });
    const ccAgencyIds = defaultCcAgencyIds(agencies, {
      excludeAgencyIds: [agencyId],
    });
    setShowCcChooser(false);
    setSendPreview({
      people,
      agencyId,
      agencyEmail,
      agencyName,
      emails,
      email,
      ccAgencyIds,
      extraCc: '',
    });
  };

  const toggleCcAgency = (agencyId) => {
    setSendPreview((prev) => {
      if (!prev) return prev;
      const current = prev.ccAgencyIds || [];
      const next = current.includes(agencyId)
        ? current.filter((id) => id !== agencyId)
        : [...current, agencyId];
      return { ...prev, ccAgencyIds: next };
    });
  };

  const sendAdditionalBookings = async () => {
    if (!sendPreview || !baseline?.id) return;

    const {
      people,
      agencyId,
      agencyEmail,
      agencyName,
      email,
      ccAgencyIds,
    } = sendPreview;

    const ccAgencies = resolveCcAgencies(agencies, ccAgencyIds, {
      excludeAgencyIds: [agencyId],
    });
    const toKeys = new Set((sendPreview.emails || []).map((addr) => addr.toLowerCase()));
    const ccKeys = new Set();
    for (const agency of ccAgencies) {
      for (const addr of parseAgencyEmails(agency.email)) ccKeys.add(addr.toLowerCase());
    }
    const extraCcEmails = [];
    for (const addr of parseAgencyEmails(sendPreview.extraCc)) {
      const key = addr.toLowerCase();
      if (toKeys.has(key) || ccKeys.has(key)) continue;
      ccKeys.add(key);
      extraCcEmails.push(addr);
    }

    setSending(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'send-rota-email',
        {
          body: {
            agencies: [{ name: agencyName, email: agencyEmail }],
            cc: [
              ...ccAgencies.map((agency) => ({
                name: agency.name,
                email: agency.email,
              })),
              ...extraCcEmails.map((addr) => ({
                name: addr,
                email: addr,
              })),
            ],
            weekStart: weekIso,
            weekEnd: weekEndIso,
            subject: email.subject,
            message: email.body,
          },
        },
      );

      if (invokeError) {
        throw new Error(invokeError.message || 'Email send failed');
      }
      if (data?.error && !Array.isArray(data?.results)) {
        throw new Error(data.error);
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const ok = results.some((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      if (!ok) {
        throw new Error(
          failed.map((r) => r.error || 'error').join('; ') || 'Email send failed',
        );
      }

      await mergeSlotsIntoBaseline(supabase, baseline.id, flattenPeopleShifts(people));
      await logSystemActivity(supabase, currentUser, {
        entity_type: 'rota',
        action_type: 'additional_bookings_sent',
        payload: {
          week_start: weekIso,
          agency_id: agencyId || null,
          agency_name: agencyName || null,
          cc_agency_ids: ccAgencies.map((a) => a.id),
          cc_agency_names: ccAgencies.map((a) => a.name),
          extra_cc_emails: extraCcEmails,
          slots_count: flattenPeopleShifts(people).length,
          people_count: people.length,
          via: 'sendgrid',
        },
      });

      const ccNames = [
        ...ccAgencies.map((a) => a.name),
        ...extraCcEmails,
      ];
      const ccNote = ccNames.length > 0
        ? ` (CC: ${ccNames.join(', ')})`
        : '';
      toast.success(
        `Email sent to ${agencyName || 'agency'}${ccNote} as ${ROTA_EMAIL_FROM_NAME}`,
      );
      setSendPreview(null);
      await reload();
      notifyBaselineChanged();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Could not send additional bookings email');
    } finally {
      setSending(false);
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

  const pendingPeople = countAdditionalPeople(groups);
  const query = searchQuery.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      people: group.people.filter((person) => person.name.toLowerCase().includes(query)),
    }))
    .filter((group) => group.people.length > 0);

  const previewCcAgencies = sendPreview
    ? resolveCcAgencies(agencies, sendPreview.ccAgencyIds, {
      excludeAgencyIds: [sendPreview.agencyId],
    })
    : [];
  const ccPickerAgencies = (agencies || []).filter((agency) => {
    if (!agency?.id || !agency.email) return false;
    if (sendPreview?.agencyId && String(agency.id) === String(sendPreview.agencyId)) {
      return false;
    }
    return parseAgencyEmails(agency.email).length > 0;
  });

  return (
    <div className="space-y-4 pb-8 pr-4 sm:pr-6">
      {loading ? (
        <p className="text-sm text-gray-500">Loading additional bookings...</p>
      ) : !baseline ? (
        <div className="card-modern space-y-3 p-4">
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
        <div className="card-modern space-y-3 p-4">
          <p className="text-sm text-charcoal">No additional bookings for this week.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="sticky top-0 z-10 bg-rota-modal-bg pb-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-charcoal placeholder:text-gray-400 focus:border-charcoal focus:outline-none focus:ring-1 focus:ring-charcoal"
              />
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <p className="text-sm text-charcoal">No people match this search.</p>
          ) : (
            filteredGroups.map((group) => {
              const rawAgency = (group.agencyName || '').trim();
              const agencyLabel = !rawAgency || /^no agency$/i.test(rawAgency)
                ? 'No agency'
                : (/\bagency\b/i.test(rawAgency) ? rawAgency : `${rawAgency} Agency`);
              return (
                <div key={group.agencyId || 'none'} className="card-modern space-y-3 p-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[#25D366]">
                    {agencyLabel}
                  </h3>

                  <ul className="space-y-3">
                    {group.people.map((person) => (
                      <li key={person.userId} className="border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 text-base font-medium text-rota-text-primary">
                            {person.name}
                          </span>
                          <button
                            type="button"
                            className={compactEmailBtn}
                            onClick={() =>
                              openSendPreview({
                                people: [person],
                                agencyId: group.agencyId,
                                agencyEmail: group.agencyEmail,
                                agencyName: group.agencyName,
                              })
                            }
                          >
                            Send email
                          </button>
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
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
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

      {sendPreview && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
          <div className="relative mx-auto flex h-[min(90vh,40.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg p-4 shadow-2xl sm:p-6">
            <h3 className="mb-3 shrink-0 text-xl font-semibold text-rota-text-primary">
              Confirm Send
            </h3>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain text-sm text-rota-text-muted">
              <div className="space-y-2">
                <p>
                  <span className="font-medium text-rota-text-primary">From:</span>{' '}
                  {ROTA_EMAIL_FROM_NAME} &lt;{ROTA_EMAIL_FROM}&gt;
                </p>
                <p>
                  <span className="font-medium text-rota-text-primary">To:</span>{' '}
                  {sendPreview.agencyName} ({sendPreview.emails.join(', ')})
                </p>
                <p>
                  <span className="font-medium text-rota-text-primary">Subject:</span>{' '}
                  {sendPreview.email.subject}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-rota-text-primary">
                  Message preview
                </p>
                <pre className="whitespace-pre-wrap rounded-lg border border-rota-toolbar-border bg-white px-3 py-3 font-sans text-sm leading-relaxed text-rota-text-primary">
                  {`Dear ${sendPreview.agencyName || 'Agency'},\n\n${sendPreview.email.body}`}
                </pre>
              </div>
            </div>
            <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                className={compactEmailBtn}
                onClick={() => setShowCcChooser(true)}
                title="Choose CC recipients"
              >
                CC
                {previewCcAgencies.length > 0 ? ` (${previewCcAgencies.length})` : ''}
              </button>
              <button
                type="button"
                className="admin-btn-muted"
                disabled={sending}
                onClick={() => setSendPreview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                disabled={sending}
                onClick={sendAdditionalBookings}
              >
                {sending ? 'Sending…' : "Yes, I'm 100% Sure - Send Now"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showCcChooser && sendPreview && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/70 p-4">
          <div className="relative flex max-h-[min(80vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg p-4 shadow-2xl sm:p-6">
            <h3 className="mb-1 shrink-0 text-xl font-semibold text-rota-text-primary">CC</h3>
            <p className="mb-3 shrink-0 text-xs text-rota-text-muted">
              Evri is copied by default. Addresses already in To are skipped for that email.
            </p>
            <ul className="min-h-0 flex-1 divide-y divide-rota-toolbar-border overflow-y-auto overscroll-contain rounded-lg border border-rota-toolbar-border">
              {ccPickerAgencies.map((agency) => {
                const checked = (sendPreview.ccAgencyIds || []).includes(agency.id);
                return (
                  <li key={agency.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-rota-day-other-bg-from/30">
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={checked}
                        onChange={() => toggleCcAgency(agency.id)}
                      />
                      <span className="min-w-0 flex-1 font-medium text-rota-text-primary">
                        {agency.name}
                      </span>
                      <span
                        className="max-w-[45%] shrink-0 truncate text-xs text-rota-text-muted"
                        title={agency.email || ''}
                      >
                        {agency.email}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 shrink-0 space-y-1.5">
              <label
                htmlFor="additional-cc-emails"
                className="text-xs font-semibold uppercase tracking-wide text-rota-text-primary"
              >
                Add email
              </label>
              <p className="text-[11px] text-rota-text-muted">
                Copied on the email to {sendPreview.agencyName || 'this agency'}. Separate addresses with commas. Addresses already in To are skipped.
              </p>
              <input
                id="additional-cc-emails"
                type="text"
                inputMode="email"
                autoComplete="off"
                value={sendPreview.extraCc || ''}
                onChange={(event) => {
                  const extraCc = event.target.value;
                  setSendPreview((prev) => (prev ? { ...prev, extraCc } : prev));
                }}
                placeholder="name@example.com, other@example.com"
                disabled={sending}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-charcoal placeholder:text-gray-400 focus:border-charcoal focus:outline-none focus:ring-1 focus:ring-charcoal"
              />
              {parseAgencyEmails(sendPreview.extraCc).length > 0 && (
                <ul className="space-y-0.5 text-xs text-rota-text-muted">
                  {parseAgencyEmails(sendPreview.extraCc).map((addr) => {
                    const alreadyTo = (sendPreview.emails || []).some(
                      (to) => to.toLowerCase() === addr.toLowerCase(),
                    );
                    return (
                      <li key={addr}>
                        {alreadyTo
                          ? `${addr} — already in To, not copied`
                          : `${addr} — CC on the email to ${sendPreview.agencyName || 'this agency'}`}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 flex shrink-0 justify-end">
              <button
                type="button"
                onClick={() => setShowCcChooser(false)}
                className="admin-btn"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

AdditionalBookingsPanel.propTypes = {
  startDate: PropTypes.instanceOf(Date).isRequired,
  currentUser: PropTypes.object,
  onBaselineChanged: PropTypes.func,
  agencies: PropTypes.arrayOf(PropTypes.object),
};

AdditionalBookingsPanel.defaultProps = {
  currentUser: null,
  onBaselineChanged: null,
  agencies: null,
};
