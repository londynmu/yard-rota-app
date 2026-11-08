import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../lib/supabaseClient';
import { useToast } from '../../ui/ToastContext';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { weekStartIso } from '../../../utils/rotaWeekBaseline';
import { summarizeRotaWhatsAppPreview } from '../../../utils/rotaWhatsApp';

const confirmOverlay = 'z-[10000]';

const iconBtn =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rota-toolbar-border bg-white text-rota-text-muted transition hover:bg-rota-day-other-bg-from/40 hover:text-rota-text-primary disabled:cursor-not-allowed disabled:opacity-50';

const selectAllBtn =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rota-toolbar-border bg-white px-3 text-xs font-semibold text-rota-text-primary transition hover:bg-rota-day-other-bg-from/40 disabled:cursor-not-allowed disabled:opacity-50';

const sendWhatsAppBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 disabled:cursor-not-allowed disabled:opacity-50';

/** Official WhatsApp logo mark (phone in speech bubble), monochrome via currentColor. */
function WhatsAppIcon({ className = 'h-5 w-5' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      className={`shrink-0 fill-current ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 6.165L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

WhatsAppIcon.propTypes = {
  className: PropTypes.string,
};

function personName(person) {
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
}

function statusLabel(person) {
  if (person.status === 'ready') return 'Ready';
  if (person.status === 'already_sent') return 'Sent';
  return person.label || 'Skipped';
}

/**
 * Modal body for WhatsApp rota send: name checklist for the selected week.
 */
export default function RotaWhatsAppSendPanel({ weekStart }) {
  const toast = useToast();
  // Stable refs — ToastProvider rebuilds the context object on every toast show/hide
  const toastError = toast.error;
  const toastSuccess = toast.success;
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
      toastError(err?.message || 'Could not load WhatsApp preview.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [toastError, weekIso]);

  useEffect(() => {
    loadMessagingReady();
  }, [loadMessagingReady]);

  // Clear checklist/search only when the week changes (or modal remounts for a new week)
  useEffect(() => {
    setSearchQuery('');
    setSelectedIds(new Set());
  }, [weekIso]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

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
  const allReadySelected = readyCount > 0 && selectedCount === readyCount;

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

  const toggleSelectAllReady = () => {
    if (allReadySelected) clearSelection();
    else selectAllReady();
  };

  const refreshLists = () => {
    loadPreview();
  };

  const openSendConfirm = () => {
    if (emptyWeek) {
      toastError('Add people to the rota before sending');
      return;
    }
    if (messagingReady === false) {
      toastError('WhatsApp is not configured yet (Twilio Content SID missing).');
      return;
    }
    if (selectedCount === 0) {
      if (readyCount === 0) {
        if (alreadySentCount > 0) {
          toastError('Everyone on this week was already notified.');
        } else {
          toastError('No shunters are ready (phone + WhatsApp consent required).');
        }
      } else {
        toastError('Select at least one ready shunter.');
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
        toastError(data.error);
        return;
      }
      const okCount = (data?.results || []).filter((r) => r.ok).length;
      const skipped = (data?.results || []).filter((r) => r.skipped).length;
      if (okCount > 0) {
        toastSuccess(
          okCount === 1
            ? 'WhatsApp sent to 1 shunter.'
            : `WhatsApp sent to ${okCount} shunters.`,
        );
      } else if (skipped > 0) {
        toastError('No new messages sent (already notified or skipped).');
      } else {
        toastError('WhatsApp send finished with no messages.');
      }
      await loadPreview();
    } catch (err) {
      console.error('[RotaWhatsApp] send', err);
      toastError(err?.message || 'WhatsApp send failed.');
    } finally {
      setSending(false);
    }
  };

  const weekLabel = preview?.week_range || weekIso;

  return (
    <div className="space-y-4 pr-8">
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-6 text-lg font-semibold text-rota-text-primary">
        <span>Send rota on WhatsApp</span>
        <span className="text-base font-semibold text-[#25D366]">
          Week {weekLabel}
        </span>
      </h3>

      {messagingReady === false && (
        <p className="text-sm text-rota-alert-error-text">
          WhatsApp is not fully configured
          {missingSecrets.length > 0
            ? ` (missing: ${missingSecrets.join(', ')})`
            : ''}
          . Meta Content SIDs still need ops setup.
        </p>
      )}

      {loadingPreview ? (
        <p className="text-sm text-rota-text-muted">Loading preview…</p>
      ) : emptyWeek ? (
        <p className="text-sm text-rota-text-muted">
          Add people to the rota before sending
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
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
            <button
              type="button"
              className={selectAllBtn}
              onClick={toggleSelectAllReady}
              disabled={readyCount === 0 || loadingPreview}
              title={
                allReadySelected
                  ? 'Clear selection'
                  : `Select all ${readyCount} ready shunters`
              }
            >
              {allReadySelected ? 'Clear' : 'Select all'}
              <span className="font-normal text-rota-text-muted">
                {selectedCount}/{readyCount}
              </span>
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={refreshLists}
              disabled={loadingPreview}
              title="Refresh list"
              aria-label="Refresh list"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${loadingPreview ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {filteredPeople.length === 0 ? (
            <p className="text-sm text-rota-text-muted">
              {query ? 'No people match this search.' : 'No assigned people for this week.'}
            </p>
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto divide-y divide-rota-toolbar-border rounded-lg border border-rota-toolbar-border">
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-rota-text-muted">
              Ready {readyCount} · Skipped {summary.skipped ?? 0} · Already notified{' '}
              {alreadySentCount}
              {preview?.creator_name ? ` · Sent by ${preview.creator_name}` : ''}
            </p>
            <button
              type="button"
              className={sendWhatsAppBtn}
              disabled={sending || loadingPreview || selectedCount === 0}
              onClick={openSendConfirm}
              title={
                selectedCount === 0
                  ? 'Select ready shunters to notify'
                  : `Send WhatsApp to ${selectedCount} selected`
              }
            >
              <WhatsAppIcon className="h-5 w-5" />
              <span>
                {sending
                  ? 'Sending…'
                  : `Send to ${selectedCount} selected`}
              </span>
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}

RotaWhatsAppSendPanel.propTypes = {
  weekStart: PropTypes.oneOfType([
    PropTypes.instanceOf(Date),
    PropTypes.string,
  ]).isRequired,
};
