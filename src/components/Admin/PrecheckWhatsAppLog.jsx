import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import { formatUserName } from '../../utils/userName';

function statusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'delivered':
    case 'read':
      return 'bg-green-100 text-green-800';
    case 'sent':
    case 'queued':
    case 'accepted':
      return 'bg-blue-100 text-blue-800';
    case 'failed':
    case 'undelivered':
    case 'canceled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default function PrecheckWhatsAppLog() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(null);
  const [missingSecrets, setMissingSecrets] = useState([]);
  const [filter, setFilter] = useState('');

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('precheck_reminder_sends')
        .select(
          'id, user_id, rota_id, phone_e164, status, trigger, error_code, error_message, provider_message_sid, created_at, updated_at, profiles:user_id(first_name, last_name)',
        )
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error('[PrecheckWhatsAppLog] load error', err);
      toast.error(err?.message || 'Could not load WhatsApp send log');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const checkReady = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        'send-precheck-whatsapp-reminders',
        { body: { check_ready: true } },
      );
      if (error) throw error;
      setReady(Boolean(data?.ready));
      setMissingSecrets(Array.isArray(data?.missing) ? data.missing : []);
    } catch (err) {
      console.error('[PrecheckWhatsAppLog] ready check', err);
      setReady(false);
      setMissingSecrets([]);
    }
  }, []);

  useEffect(() => {
    loadLog();
    checkReady();
  }, [loadLog, checkReady]);

  const filtered = rows.filter((row) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    const name = formatUserName(row.profiles || {}).toLowerCase();
    return (
      name.includes(q) ||
      (row.phone_e164 || '').toLowerCase().includes(q) ||
      (row.status || '').toLowerCase().includes(q) ||
      (row.provider_message_sid || '').toLowerCase().includes(q)
    );
  });

  return (
    <section className="admin-section-card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="admin-section-title">PreCheck WhatsApp log</h2>
          <p className="mt-1 text-xs text-gray-500">
            Delivery audit for automated and force-sent PreCheck reminders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              ready ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
            }`}
            title={
              ready
                ? 'Twilio WhatsApp secrets look present'
                : missingSecrets.length
                  ? `Missing: ${missingSecrets.join(', ')}`
                  : 'WhatsApp not ready'
            }
          >
            {ready == null ? 'Checking…' : ready ? 'WhatsApp ready' : 'WhatsApp not ready'}
          </span>
          <button type="button" className="admin-btn" onClick={() => { loadLog(); checkReady(); }}>
            Refresh
          </button>
        </div>
      </div>

      {!ready && ready != null && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Configure Twilio Edge Function secrets (Account SID, Auth Token, WhatsApp From,
          Content SID, APP_BASE_URL) before cron or force send will work. Keys are never shown here.
        </p>
      )}

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, phone, status…"
        className="admin-input max-w-md"
      />

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No WhatsApp reminder sends yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Trigger</th>
                <th className="py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString('en-GB')
                      : '—'}
                  </td>
                  <td className="py-2 pr-3 font-medium text-charcoal">
                    {formatUserName(row.profiles || {}, 'Unknown')}
                  </td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-gray-700">
                    {row.phone_e164 || '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${statusClass(row.status)}`}>
                      {row.status || '—'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{row.trigger || '—'}</td>
                  <td className="py-2 text-red-700 max-w-[14rem] truncate" title={row.error_message || ''}>
                    {row.error_message || (row.error_code ? `Code ${row.error_code}` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
