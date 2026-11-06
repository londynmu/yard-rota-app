import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabaseClient';
import { useToast } from '../../ui/ToastContext';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { weekStartIso } from '../../../utils/rotaWeekBaseline';
import {
  formatShunterShiftSummary,
  summarizeRotaWhatsAppPreview,
} from '../../../utils/rotaWhatsApp';

const outlineBtn =
  'admin-btn disabled:cursor-not-allowed disabled:opacity-50';

const confirmOverlay = 'z-[10000]';

function personName(person) {
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
}

function statusLabel(person) {
  if (person.status === 'ready') return 'Ready';
  if (person.status === 'already_sent') return 'Sent';
  return person.label || 'Skipped';
}

/**
 * Modal body for WhatsApp rota send: name checklist + optional one-shift ping.
 */
export default function RotaWhatsAppSendPanel({ weekStart, onClose = null }) {
  const toast = useToast();
  const weekIso = useMemo(
    () => (weekStart instanceof Date ? weekStartIso(weekStart) : weekStartIso(new Date(weekStart))),
    [weekStart],
  );

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [messagingReady, setMessagingReady] = useState(null);
  const [missingSecrets, setMissingSecrets] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Notify one shift
  const [pingSlots, setPingSlots] = useState([]);
  const [pingUserId, setPingUserId] = useState('');
  const [pingRotaId, setPingRotaId] = useState('');
  const [pingLoading, setPingLoading] = useState(false);
  const [pingSending, setPingSending] = useState(false);
  const [pingConfirmOpen, setPingConfirmOpen] = useState(false);
  const [pingPreview, setPingPreview] = useState(null);

  const loadMessagingReady = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('send-rota-whatsapp', {
        body: { action: 'check_ready', kind: 'shunter_week' },
      });
      if (error) throw error;
      setMessagingReady(Boolean(data?.ready));
      setMissingSecrets(Array.isArray(data?.missing) ? data.missing : []);
    } catch (err) {
      console.error('[RotaWhatsApp] check_ready', err);
      setMessagingReady(false);
      setMissingSecrets([]);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-rota-whatsapp', {
        body: {
          action: 'preview',
          kind: 'shunter_week',
          week_start: weekIso,
        },
      });
      if (error) throw error;
      setPreview(data || null);
      if (typeof data?.messaging_ready === 'boolean') {
        setMessagingReady(data.messaging_ready);
        setMissingSecrets(Array.isArray(data?.missing) ? data.missing : []);
      }
      const readyIds = new Set(
        (data?.people || [])
          .filter((p) => p.status === 'ready')
          .map((p) => p.user_id),
      );
      setSelectedIds((prev) => {
        const next = new Set();
        for (const id of prev) {
          if (readyIds.has(id)) next.add(id);
        }
        return next;
      });
    } catch (err) {
      console.error('[RotaWhatsApp] preview', err);
      toast.error(err?.message || 'Could not load WhatsApp preview.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [toast, weekIso]);

  const loadPingCandidates = useCallback(async () => {
    setPingLoading(true);
    try {
      const start = weekIso;
      const endDate = new Date(`${weekIso}T12:00:00`);
      endDate.setDate(endDate.getDate() + 6);
      const end = format(endDate, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('scheduled_rota')
        .select(`
          id,
          user_id,
          date,
          start_time,
          end_time,
          location,
          profiles:user_id(id, first_name, last_name)
        `)
        .gte('date', start)
        .lte('date', end)
        .not('user_id', 'is', null)
        .order('date', { ascending: true });

      if (error) throw error;
      setPingSlots(data || []);
    } catch (err) {
      console.error('[RotaWhatsApp] ping candidates', err);
      setPingSlots([]);
    } finally {
      setPingLoading(false);
    }
  }, [weekIso]);

  useEffect(() => {
    loadMessagingReady();
  }, [loadMessagingReady]);

  useEffect(() => {
    loadPreview();
    loadPingCandidates();
    setPingUserId('');
    setPingRotaId('');
    setPingPreview(null);
    setSearchQuery('');
    setSelectedIds(new Set());
  }, [loadPreview, loadPingCandidates]);

  const people = useMemo(() => preview?.people || [], [preview]);
  const summary = useMemo(
    () => preview?.summary || summarizeRotaWhatsAppPreview(
      people.map((p) => ({ status: p.status })),
    ),
    [preview, people],
  );
  const readyCount = summary.ready ?? 0;
  const alreadySentCount = summary.already_sent ?? summary.alreadySent ?? 0;
  const emptyWeek = Boolean(preview?.empty) || (people.length === 0 && !loadingPreview);

  const query = searchQuery.trim().toLowerCase();
  const filteredPeople = useMemo(() => {
    if (!query) return people;
    return people.filter((person) => personName(person).toLowerCase().includes(query));
  }, [people, query]);

  const selectedReadyIds = useMemo(
    () => [...selectedIds].filter((id) => people.some((p) => p.user_id === id && p.status === 'ready')),
    [selectedIds, people],
  );
  const selectedCount = selectedReadyIds.length;

  const peopleByUser = useMemo(() => {
    const map = new Map();
    for (const slot of pingSlots) {
      if (!slot?.user_id) continue;
      if (!map.has(slot.user_id)) {
        const profile = slot.profiles || {};
        map.set(slot.user_id, {
          userId: slot.user_id,
          name: personName({
            first_name: profile.first_name,
            last_name: profile.last_name,
          }),
          shifts: [],
        });
      }
      map.get(slot.user_id).shifts.push(slot);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [pingSlots]);

  const selectedPersonShifts = useMemo(() => {
    const person = peopleByUser.find((p) => p.userId === pingUserId);
    return person?.shifts || [];
  }, [peopleByUser, pingUserId]);

  const togglePerson = (userId, enabled) => {
    if (!enabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAllReady = () => {
    setSelectedIds(new Set(
      people.filter((p) => p.status === 'ready').map((p) => p.user_id),
    ));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openSendConfirm = () => {
    if (emptyWeek) {
      toast.error('Add people to the rota before sending');
      return;
    }
    if (messagingReady === false) {
      toast.error('WhatsApp is not configured yet (Twilio Content SID missing).');
      return;
    }
    if (selectedCount === 0) {
      if (readyCount === 0) {
        if (alreadySentCount > 0) {
          toast.error('Everyone on this week was already notified.');
        } else {
          toast.error('No shunters are ready (phone + WhatsApp consent required).');
        }
      } else {
        toast.error('Select at least one ready shunter.');
      }
      return;
    }
    setConfirmOpen(true);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-rota-whatsapp', {
        body: {
          action: 'send',
          kind: 'shunter_week',
          week_start: weekIso,
          user_ids: selectedReadyIds,
          force_resend: false,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const okCount = (data?.results || []).filter((r) => r.ok).length;
      const skipped = (data?.results || []).filter((r) => r.skipped).length;
      if (okCount > 0) {
        toast.success(
          okCount === 1
            ? 'WhatsApp sent to 1 shunter.'
            : `WhatsApp sent to ${okCount} shunters.`,
        );
      } else if (skipped > 0) {
        toast.error('No new messages sent (already notified or skipped).');
      } else {
        toast.error('WhatsApp send finished with no messages.');
      }
      await loadPreview();
    } catch (err) {
      console.error('[RotaWhatsApp] send', err);
      toast.error(err?.message || 'WhatsApp send failed.');
    } finally {
      setSending(false);
    }
  };

  const openPingConfirm = async () => {
    if (!pingRotaId) {
      toast.error('Select a person and shift first.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('send-rota-whatsapp', {
        body: {
          action: 'preview',
          kind: 'assignment_ping',
          scheduled_rota_id: pingRotaId,
        },
      });
      if (error) throw error;
      setPingPreview(data || null);
      const person = data?.people?.[0];
      if (!person) {
        toast.error('Could not preview this person.');
        return;
      }
      if (person.status?.startsWith('skipped')) {
        toast.error(person.label || 'Cannot notify this person.');
        return;
      }
      setPingConfirmOpen(true);
    } catch (err) {
      console.error('[RotaWhatsApp] ping preview', err);
      toast.error(err?.message || 'Could not preview WhatsApp ping.');
    }
  };

  const handlePingSend = async () => {
    if (!pingRotaId) return;
    setPingSending(true);
    try {
      const person = pingPreview?.people?.[0];
      const force = person?.status === 'already_sent';
      const { data, error } = await supabase.functions.invoke('send-rota-whatsapp', {
        body: {
          action: 'send',
          kind: 'assignment_ping',
          scheduled_rota_id: pingRotaId,
          force_resend: force,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      const first = data?.results?.[0];
      if (first?.ok) {
        toast.success('WhatsApp notification sent.');
      } else if (first?.skipped) {
        toast.error(
          first.reason === 'already_sent'
            ? 'Already notified for this assignment.'
            : first.reason || 'Send skipped.',
        );
      } else {
        toast.error(first?.error || 'WhatsApp send failed.');
      }
      await loadPreview();
    } catch (err) {
      console.error('[RotaWhatsApp] ping send', err);
      toast.error(err?.message || 'WhatsApp send failed.');
    } finally {
      setPingSending(false);
    }
  };

  const weekLabel = preview?.week_range || weekIso;

  return (
    <div className="space-y-4 pr-8">
      <div>
        <h3 className="text-lg font-semibold text-rota-text-primary">
          Send rota on WhatsApp
        </h3>
        <p className="text-sm text-rota-text-muted">
          Week {weekLabel}. Agencies stay on Export &amp; Send email.
        </p>
      </div>

      {messagingReady === false && (
        <p className="text-sm text-rota-alert-error-text">
          WhatsApp is not fully configured
          {missingSecrets.length > 0
            ? ` (missing: ${missingSecrets.join(', ')})`
            : ''}
          . Meta Content SIDs still need ops setup.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={outlineBtn}
          onClick={() => {
            loadPreview();
            loadPingCandidates();
          }}
          disabled={loadingPreview || pingLoading}
        >
          Refresh
        </button>
        <button
          type="button"
          className={outlineBtn}
          onClick={selectAllReady}
          disabled={loadingPreview || readyCount === 0}
        >
          Select all ready
        </button>
        <button
          type="button"
          className={outlineBtn}
          onClick={clearSelection}
          disabled={loadingPreview || selectedCount === 0}
        >
          Clear
        </button>
      </div>

      {loadingPreview ? (
        <p className="text-sm text-rota-text-muted">Loading preview…</p>
      ) : emptyWeek ? (
        <p className="text-sm text-rota-text-muted">
          Add people to the rota before sending
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-input w-full pl-9"
            />
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-rota-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {filteredPeople.length === 0 ? (
            <p className="text-sm text-rota-text-muted">
              {query ? 'No people match this search.' : 'No assigned people for this week.'}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-rota-toolbar-border rounded-lg border border-rota-toolbar-border">
              {filteredPeople.map((person) => {
                const isReady = person.status === 'ready';
                const checked = isReady && selectedIds.has(person.user_id);
                return (
                  <li key={person.user_id}>
                    <label
                      className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                        isReady
                          ? 'cursor-pointer hover:bg-rota-day-other-bg-from/30'
                          : 'cursor-not-allowed opacity-70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={checked}
                        disabled={!isReady}
                        onChange={() => togglePerson(person.user_id, isReady)}
                      />
                      <span className="min-w-0 flex-1 font-medium text-rota-text-primary">
                        {personName(person)}
                      </span>
                      <span
                        className={
                          person.status === 'ready'
                            ? 'shrink-0 text-emerald-700'
                            : person.status === 'already_sent'
                              ? 'shrink-0 text-rota-text-muted'
                              : 'shrink-0 text-amber-700'
                        }
                      >
                        {statusLabel(person)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-rota-text-muted">
            Ready {readyCount} · Skipped {summary.skipped ?? 0} · Already notified{' '}
            {alreadySentCount}
            {preview?.creator_name ? ` · Sent by ${preview.creator_name}` : ''}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rota-toolbar-border pt-4">
        <button
          type="button"
          className={outlineBtn}
          disabled={sending || loadingPreview || selectedCount === 0}
          onClick={openSendConfirm}
          title={
            selectedCount === 0
              ? 'Select ready shunters to notify'
              : `Send WhatsApp to ${selectedCount} selected`
          }
        >
          {sending
            ? 'Sending…'
            : `Send to ${selectedCount} selected`}
        </button>
        {typeof onClose === 'function' && (
          <button type="button" className={outlineBtn} onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="border-t border-rota-toolbar-border pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-rota-text-primary">
          Notify one shift
        </h4>
        <p className="text-xs text-rota-text-muted">
          Optional ping after a manual add — never automatic.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-rota-text-muted">
            Person
            <select
              className="admin-input"
              value={pingUserId}
              disabled={pingLoading || peopleByUser.length === 0}
              onChange={(e) => {
                setPingUserId(e.target.value);
                setPingRotaId('');
                setPingPreview(null);
              }}
            >
              <option value="">Select…</option>
              {peopleByUser.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-rota-text-muted">
            Shift
            <select
              className="admin-input"
              value={pingRotaId}
              disabled={!pingUserId || selectedPersonShifts.length === 0}
              onChange={(e) => {
                setPingRotaId(e.target.value);
                setPingPreview(null);
              }}
            >
              <option value="">Select…</option>
              {selectedPersonShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {formatShunterShiftSummary([shift])}
                  {shift.location ? ` · ${shift.location}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${outlineBtn} shrink-0`}
            disabled={!pingRotaId || pingSending}
            onClick={openPingConfirm}
          >
            {pingSending ? 'Sending…' : 'Notify this person'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSend}
        title="Send WhatsApp to shunters"
        message={`Send WhatsApp to ${selectedCount} shunter${selectedCount === 1 ? '' : 's'}?`}
        confirmText="Send"
        cancelText="Cancel"
        overlayClassName={confirmOverlay}
      />

      <ConfirmDialog
        isOpen={pingConfirmOpen}
        onClose={() => setPingConfirmOpen(false)}
        onConfirm={handlePingSend}
        title="Notify this person"
        message={
          pingPreview?.people?.[0]?.status === 'already_sent'
            ? `Already notified for this assignment. Resend WhatsApp to ${personName(pingPreview.people[0])}?`
            : `Send WhatsApp to ${personName(pingPreview?.people?.[0] || {})}?`
        }
        confirmText={
          pingPreview?.people?.[0]?.status === 'already_sent' ? 'Resend' : 'Send'
        }
        cancelText="Cancel"
        overlayClassName={confirmOverlay}
      />
    </div>
  );
}

RotaWhatsAppSendPanel.propTypes = {
  weekStart: PropTypes.oneOfType([
    PropTypes.instanceOf(Date),
    PropTypes.string,
  ]).isRequired,
  onClose: PropTypes.func,
};
