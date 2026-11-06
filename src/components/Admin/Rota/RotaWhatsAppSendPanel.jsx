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

function personName(person) {
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
}

export default function RotaWhatsAppSendPanel({ weekStart }) {
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
  const [forceResend, setForceResend] = useState(false);

  // Notify this person
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
    setForceResend(false);
  }, [loadPreview, loadPingCandidates]);

  const people = preview?.people || [];
  const summary = preview?.summary || summarizeRotaWhatsAppPreview(
    people.map((p) => ({ status: p.status })),
  );
  const readyCount = summary.ready ?? 0;
  const alreadySentCount = summary.already_sent ?? summary.alreadySent ?? 0;
  const emptyWeek = Boolean(preview?.empty) || (people.length === 0 && !loadingPreview);

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

  const openSendConfirm = ({ resend = false } = {}) => {
    if (emptyWeek) {
      toast.error('Add people to the rota before sending');
      return;
    }
    if (messagingReady === false) {
      toast.error('WhatsApp is not configured yet (Twilio Content SID missing).');
      return;
    }
    if (!resend && readyCount === 0) {
      if (alreadySentCount > 0) {
        toast.error('Everyone on this week was already notified. Use resend only if needed.');
      } else {
        toast.error('No shunters are ready (phone + WhatsApp consent required).');
      }
      return;
    }
    if (resend && alreadySentCount === 0 && readyCount === 0) {
      toast.error('No one to notify on this week.');
      return;
    }
    setForceResend(Boolean(resend));
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
          force_resend: forceResend,
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
      setForceResend(false);
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

  const confirmCount = forceResend
    ? readyCount + alreadySentCount
    : readyCount;

  return (
    <section className="admin-section-card admin-section-body space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-rota-text-primary">
            Send rota on WhatsApp
          </h3>
          <p className="text-sm text-rota-text-muted">
            Shunters only — agencies still use Export &amp; Send (email).
          </p>
        </div>
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={outlineBtn}
            disabled={sending || loadingPreview || emptyWeek || readyCount === 0}
            onClick={() => openSendConfirm({ resend: false })}
            title={
              emptyWeek
                ? 'Add people to the rota before sending'
                : readyCount === 0
                  ? 'No new shunters ready to notify'
                  : 'Send WhatsApp to shunters not yet notified'
            }
          >
            {sending ? 'Sending…' : 'Send to shunters'}
          </button>
          {alreadySentCount > 0 && (
            <button
              type="button"
              className={outlineBtn}
              disabled={sending || loadingPreview}
              onClick={() => openSendConfirm({ resend: true })}
              title="Conscious resend after cooldown"
            >
              Resend already notified
            </button>
          )}
        </div>

        {loadingPreview ? (
          <p className="text-sm text-rota-text-muted">Loading preview…</p>
        ) : emptyWeek ? (
          <p className="text-sm text-rota-text-muted">
            Add people to the rota before sending
          </p>
        ) : (
          <ul className="max-h-48 overflow-y-auto divide-y divide-rota-toolbar-border rounded-lg border border-rota-toolbar-border">
            {people.map((person) => (
              <li
                key={person.user_id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="text-rota-text-primary font-medium">
                  {personName(person)}
                </span>
                <span
                  className={
                    person.status === 'ready'
                      ? 'text-emerald-700'
                      : person.status === 'already_sent'
                        ? 'text-rota-text-muted'
                        : 'text-amber-700'
                  }
                >
                  {person.status === 'ready'
                    ? 'Ready'
                    : person.status === 'already_sent'
                      ? 'Already sent'
                      : person.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!emptyWeek && !loadingPreview && (
          <p className="text-xs text-rota-text-muted">
            Ready {readyCount} · Skipped {summary.skipped ?? 0} · Already notified{' '}
            {alreadySentCount}
            {preview?.creator_name ? ` · Sent by ${preview.creator_name}` : ''}
          </p>
        )}
      </div>

      <div className="border-t border-rota-toolbar-border pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-rota-text-primary">
          Notify this person
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
        onClose={() => {
          setConfirmOpen(false);
          setForceResend(false);
        }}
        onConfirm={handleSend}
        title={forceResend ? 'Resend WhatsApp to shunters' : 'Send WhatsApp to shunters'}
        message={
          forceResend
            ? `Resend WhatsApp to ${confirmCount} shunter${confirmCount === 1 ? '' : 's'} (includes already notified)? Use only when you mean it.`
            : `Send WhatsApp to ${confirmCount} shunter${confirmCount === 1 ? '' : 's'}?`
        }
        confirmText={forceResend ? 'Resend' : 'Send'}
        cancelText="Cancel"
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
      />
    </section>
  );
}

RotaWhatsAppSendPanel.propTypes = {
  weekStart: PropTypes.oneOfType([
    PropTypes.instanceOf(Date),
    PropTypes.string,
  ]).isRequired,
};
