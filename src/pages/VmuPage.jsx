import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useNotifications } from '../lib/NotificationContext';
import { STATUS_CONFIG, isDefectAwaitingRepair } from '../components/Admin/PreCheck/PreCheckList';
import { getStatusOptions } from '../utils/defectStatus';
import PrecheckSignedImage from '../components/PreCheck/PrecheckSignedImage';
import { createPrecheckSignedUrl } from '../utils/precheckImageUrl';
import { useToast } from '../components/ui/ToastContext';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  fetchVmuDamagesCached,
  fetchVmuMetaCached,
  invalidateVmuLoadCache,
} from '../utils/vmuLoadCache';


const VMU_FILTERS_KEY = 'vmu_filters';
const RESOLVED_FETCH_LIMIT = 200;

const FIELD_LABELS = {
  repair_status: 'Status',
  defect_number: 'Defect Number',
  reported_to_terberg_at: 'Reported to Terberg',
  vmu_notes: 'VMU Notes',
};

const SKIP_LOG_FIELDS = new Set(['resolved_at', 'resolved_by']);

const DAMAGES_SELECT = `
  *,
  resolved_profile:resolved_by(first_name, last_name),
  precheck_items(item_name),
  precheck_submissions!inner(
    id,
    check_date,
    check_time,
    created_at,
    tug_id,
    profiles:user_id(first_name, last_name),
    tugs(id, tug_number, display_name)
  )
`;

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatFieldValue(field, value) {
  if (value == null || value === '') return null;
  if (field === 'repair_status') {
    return STATUS_CONFIG[value]?.label || value;
  }
  if (field === 'reported_to_terberg_at') {
    try {
      return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return value; }
  }
  return value;
}

function loadPersistedFilters() {
  try {
    const raw = safeLocalStorage.getItem(VMU_FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { tug: '', status: '', search: '' };
}

function enhanceDamages(rows, checkItemLabels) {
  return (rows || []).map(damage => ({
    ...damage,
    check_item_label: damage.precheck_items?.item_name
      ? checkItemLabels[damage.precheck_items.item_name]
      : null,
  }));
}

export default function VmuPage() {
  const { user, sessionProfile } = useAuth();
  const { isAdmin, isTransportManager } = useNotifications();
  const toast = useToast();
  /** Transport managers may view fleet defects but must not update status / notes. */
  const readOnly = isTransportManager && !isAdmin;


  // ─── Data ───
  const [damages, setDamages] = useState([]);
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ─── Filters ───
  const [filters, setFilters] = useState(loadPersistedFilters);

  // ─── Expanded tug groups (Set of tug IDs, allows multiple open) ───
  const [expandedTugs, setExpandedTugs] = useState(new Set());

  // ─── Expanded defect card (single defect detail view) ───
  const [expandedDefectId, setExpandedDefectId] = useState(null);

  // ─── Image lightbox ───
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showAllPhotos, setShowAllPhotos] = useState({});

  // ─── Activity logs (loaded per expanded card only) ───
  const [activityLogs, setActivityLogs] = useState({});
  const [confirmationsByDamage, setConfirmationsByDamage] = useState({});
  const [fixedConfirmationsByDamage, setFixedConfirmationsByDamage] = useState({});
  const [activityLoading, setActivityLoading] = useState({});
  const activityLoadedRef = useRef(new Set());

  // ─── Resolve confirmation ───
  const [resolveConfirm, setResolveConfirm] = useState(null);

  // ─── Persist filters ───
  useEffect(() => {
    safeLocalStorage.setItem(VMU_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  const mergeDamageRows = useCallback((openRows, resolvedRows, checkItemLabels) => {
    const byId = new Map();
    [...(openRows || []), ...(resolvedRows || [])].forEach((row) => {
      if (!byId.has(row.id)) byId.set(row.id, row);
    });
    return enhanceDamages([...byId.values()], checkItemLabels);
  }, []);

  // ─── Fetch: meta + open first (paint), resolved in parallel / then merge ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const statusFilter = filters.status;
      const needOpen = !statusFilter || statusFilter !== 'resolved';
      const needResolved = !statusFilter || statusFilter === 'resolved';

      const metaPromise = fetchVmuMetaCached(async () => {
        const [tugsRes, checkItemsRes] = await Promise.all([
          supabase.from('tugs').select('id, tug_number, display_name').order('tug_number'),
          supabase.from('precheck_check_items').select('item_key, label').eq('is_active', true),
        ]);
        if (tugsRes.error) throw tugsRes.error;
        if (checkItemsRes.error) throw checkItemsRes.error;
        const checkItemLabels = {};
        (checkItemsRes.data || []).forEach((item) => {
          checkItemLabels[item.item_key] = item.label;
        });
        return { tugs: tugsRes.data || [], checkItemLabels };
      });

      const openPromise = needOpen
        ? fetchVmuDamagesCached('open', statusFilter || '', async () => {
            let openQuery = supabase
              .from('precheck_damages')
              .select(DAMAGES_SELECT)
              .neq('source', 'remarks')
              .neq('repair_status', 'resolved')
              .order('created_at', { ascending: false });
            if (statusFilter) {
              openQuery = openQuery.eq('repair_status', statusFilter);
            }
            const openRes = await openQuery;
            if (openRes.error) throw openRes.error;
            return openRes.data || [];
          })
        : Promise.resolve([]);

      const resolvedPromise = needResolved
        ? fetchVmuDamagesCached('resolved', statusFilter || '', async () => {
            const resolvedRes = await supabase
              .from('precheck_damages')
              .select(DAMAGES_SELECT)
              .neq('source', 'remarks')
              .eq('repair_status', 'resolved')
              .order('created_at', { ascending: false })
              .limit(RESOLVED_FETCH_LIMIT);
            if (resolvedRes.error) throw resolvedRes.error;
            return resolvedRes.data || [];
          })
        : Promise.resolve([]);

      // Paint as soon as open (or resolved-only) + meta are ready; merge resolved after.
      if (needOpen) {
        const [meta, openRows] = await Promise.all([metaPromise, openPromise]);
        setTugs(meta.tugs);
        setDamages(mergeDamageRows(openRows, [], meta.checkItemLabels));
        setLoading(false);
        const resolvedRows = await resolvedPromise;
        if (resolvedRows.length > 0) {
          setDamages(mergeDamageRows(openRows, resolvedRows, meta.checkItemLabels));
        }
      } else {
        const [meta, resolvedRows] = await Promise.all([metaPromise, resolvedPromise]);
        setTugs(meta.tugs);
        setDamages(mergeDamageRows([], resolvedRows, meta.checkItemLabels));
        setLoading(false);
      }

      activityLoadedRef.current.clear();
      setActivityLogs({});
      setConfirmationsByDamage({});
      setFixedConfirmationsByDamage({});
      setLoadError(null);
    } catch (err) {
      console.error('[VmuPage] Fetch error:', err);
      setLoadError('Could not load defects.');
      setLoading(false);
    }
  }, [filters.status, mergeDamageRows]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filter damages (client-side tug/search; status partly server-side) ───
  const filteredDamages = useMemo(() => {
    let result = damages;

    if (filters.tug) {
      result = result.filter(d => d.precheck_submissions?.tug_id === filters.tug);
    }
    if (filters.status) {
      result = result.filter(d => d.repair_status === filters.status);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      result = result.filter(d => {
        const desc = (d.description || '').toLowerCase();
        const itemLabel = (d.check_item_label || '').toLowerCase();
        const tugName = (d.precheck_submissions?.tugs?.display_name || '').toLowerCase();
        const tugNum = (d.precheck_submissions?.tugs?.tug_number || '').toLowerCase();
        const notes = (d.vmu_notes || '').toLowerCase();
        return desc.includes(q) || itemLabel.includes(q) || tugName.includes(q) ||
               tugNum.includes(q) || notes.includes(q);
      });
    }

    return result;
  }, [damages, filters]);

  // ─── Update damage field ───
  const updateDamageField = async (damageId, updates) => {
    if (readOnly) return;

    // 1. Read old values BEFORE optimistic update
    const currentDamage = damages.find(d => d.id === damageId);


    // 2. Optimistic update
    setDamages(prev => prev.map(d => d.id === damageId ? { ...d, ...updates } : d));

    try {
      const { error } = await supabase
        .from('precheck_damages')
        .update(updates)
        .eq('id', damageId);

      if (error) throw error;
      invalidateVmuLoadCache();

      // If status changed to resolved, refetch for resolved_profile
      if (updates.repair_status === 'resolved') {
        const { data: fresh } = await supabase
          .from('precheck_damages')
          .select('*, resolved_profile:resolved_by(first_name, last_name)')
          .eq('id', damageId)
          .single();

        if (fresh) {
          setDamages(prev => prev.map(d => d.id === damageId ? { ...d, ...fresh } : d));
        }
      }

      // 3. Log changes AFTER successful DB update — await and fail visibly
      if (currentDamage && user?.id) {
        const logEntries = [];
        for (const [field, newVal] of Object.entries(updates)) {
          if (SKIP_LOG_FIELDS.has(field)) continue;
          const oldVal = currentDamage[field];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            logEntries.push({
              damage_id: damageId,
              user_id: user.id,
              action_type: field === 'repair_status' ? 'status_change' : 'field_update',
              field_name: field,
              old_value: oldVal != null ? String(oldVal) : null,
              new_value: newVal != null ? String(newVal) : null,
            });
          }
        }
        if (logEntries.length > 0) {
          const { error: logError } = await supabase
            .from('defect_activity_log')
            .insert(logEntries);
          if (logError) throw logError;

          const optimisticEntries = logEntries.map(entry => ({
            ...entry,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            profiles: {
              first_name: sessionProfile?.first_name ?? user.user_metadata?.first_name,
              last_name: sessionProfile?.last_name ?? user.user_metadata?.last_name,
            },
          }));
          setActivityLogs(prev => ({
            ...prev,
            [damageId]: [...optimisticEntries, ...(prev[damageId] || [])],
          }));
        }
      }
    } catch (err) {
      console.error('[VmuPage] Update error:', err);
      toast.error('Could not update defect. Try again.');
      invalidateVmuLoadCache();
      fetchData(); // revert on error
    }
  };

  // ─── Status change handler ───
  const applyStatusChange = (damageId, newStatus) => {
    const updates = { repair_status: newStatus };
    if (newStatus === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user.id;
    } else {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }
    updateDamageField(damageId, updates);
  };

  const handleStatusChange = (damageId, newStatus) => {
    if (readOnly) return;
    if (newStatus === 'resolved') {
      setResolveConfirm({ damageId, newStatus });
      return;
    }
    applyStatusChange(damageId, newStatus);
  };

  // ─── Save inline field ───
  const saveField = (damageId, field, value) => {
    if (readOnly) return;
    updateDamageField(damageId, { [field]: value || null });
  };

  // ─── Fetch activity log + confirmations when defect card expands ───
  const fetchActivityLog = useCallback(async (damageId) => {
    if (!damageId) return;
    if (activityLoadedRef.current.has(damageId)) return;
    setActivityLoading(prev => ({ ...prev, [damageId]: true }));
    try {
      const [logRes, confRes, fixedRes] = await Promise.all([
        supabase
          .from('defect_activity_log')
          .select('*, profiles:user_id(first_name, last_name)')
          .eq('damage_id', damageId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('precheck_damage_confirmations')
          .select('id, created_at, profiles:user_id(first_name, last_name)')
          .eq('damage_id', damageId)
          .order('created_at', { ascending: false }),
        supabase
          .from('precheck_damage_fixed_confirmations')
          .select('id, created_at, profiles:user_id(first_name, last_name)')
          .eq('damage_id', damageId)
          .order('created_at', { ascending: false }),
      ]);

      if (logRes.error) throw logRes.error;
      if (confRes.error) throw confRes.error;
      if (fixedRes.error) throw fixedRes.error;
      activityLoadedRef.current.add(damageId);
      setActivityLogs(prev => ({ ...prev, [damageId]: logRes.data || [] }));
      setConfirmationsByDamage(prev => ({ ...prev, [damageId]: confRes.data || [] }));
      setFixedConfirmationsByDamage(prev => ({ ...prev, [damageId]: fixedRes.data || [] }));
    } catch (err) {
      console.error('[VmuPage] Activity/confirmations fetch error:', err);
      setActivityLogs(prev => ({ ...prev, [damageId]: prev[damageId] ?? [] }));
      setConfirmationsByDamage(prev => ({ ...prev, [damageId]: prev[damageId] ?? [] }));
      setFixedConfirmationsByDamage(prev => ({ ...prev, [damageId]: prev[damageId] ?? [] }));
    } finally {
      setActivityLoading(prev => ({ ...prev, [damageId]: false }));
    }
  }, []);

  useEffect(() => {
    if (expandedDefectId) {
      fetchActivityLog(expandedDefectId);
    }
  }, [expandedDefectId, fetchActivityLog]);

  // ─── Tug grouping for Tug View ───
  const tugGroups = useMemo(() => {
    const map = {};
    filteredDamages.forEach(d => {
      const tug = d.precheck_submissions?.tugs;
      if (!tug) return;
      const tugId = tug.id;
      if (!map[tugId]) {
        map[tugId] = {
          id: tugId,
          name: tug.display_name || tug.tug_number,
          number: tug.tug_number,
          damages: [],
          openCount: 0,
        };
      }
      map[tugId].damages.push(d);
      if (isDefectAwaitingRepair(d.repair_status)) map[tugId].openCount++;
    });

    return Object.values(map).sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name));
  }, [filteredDamages]);

  // ─── Format helpers ───
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatLastChangeDateTime = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} at ${h}:${m}`;
  };

  const mergeActivityEntries = (d) => {
    const initialEntry = {
      type: 'initial_report',
      created_at: d.precheck_submissions?.created_at || d.created_at,
      profiles: d.precheck_submissions?.profiles,
      id: `initial-${d.id}`,
    };
    const confirmations = (confirmationsByDamage[d.id] || []).map(c => ({
      type: 'confirmation',
      created_at: c.created_at,
      profiles: c.profiles,
      id: c.id,
    }));
    const fixedConfirmations = (fixedConfirmationsByDamage[d.id] || []).map(c => ({
      type: 'fixed_confirmation',
      created_at: c.created_at,
      profiles: c.profiles,
      id: `fixed-${c.id}`,
    }));
    const activityEntries = (activityLogs[d.id] || []).map(e => ({
      ...e,
      type: e.action_type,
    }));
    return [initialEntry, ...confirmations, ...fixedConfirmations, ...activityEntries]
      .filter(e => e.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const getLastActivityEntryShort = (d) => {
    const merged = mergeActivityEntries(d);
    const latest = merged[0];
    if (!latest) {
      const name = getReporterName(d);
      return `Reported by ${name}`;
    }
    const name = latest.profiles
      ? `${latest.profiles.first_name || ''} ${latest.profiles.last_name || ''}`.trim()
      : 'Unknown';
    if (latest.type === 'initial_report') return `${name} reported`;
    if (latest.type === 'confirmation') return `${name} confirmed still exists`;
    if (latest.type === 'fixed_confirmation') return `${name} confirmed fixed`;
    if (latest.type === 'status_change') {
      const newVal = formatFieldValue('repair_status', latest.new_value);
      return `${name} → ${newVal || 'status'}`;
    }
    return `${name} updated`;
  };

  const getLastChangeTimestamp = (d) => {
    const merged = mergeActivityEntries(d);
    const latest = merged[0];
    return latest?.created_at || d.updated_at || d.resolved_at || d.created_at;
  };

  const getReporterName = (d) => {
    const p = d.precheck_submissions?.profiles;
    if (!p) return 'Unknown';
    return `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown';
  };

  // ─── Toggle tug group expansion ───
  const toggleTugGroup = (tugId) => {
    setExpandedTugs(prev => {
      const next = new Set(prev);
      if (next.has(tugId)) {
        next.delete(tugId);
      } else {
        next.add(tugId);
      }
      return next;
    });
  };

  // ─── Render a defect card ───
  const renderDefectCard = (d) => {
    const isExpanded = expandedDefectId === d.id;
    const cfg = STATUS_CONFIG[d.repair_status] || STATUS_CONFIG.open;
    const resolvedName = d.resolved_profile
      ? `${d.resolved_profile.first_name || ''} ${d.resolved_profile.last_name || ''}`.trim()
      : null;

    return (
      <div
        key={d.id}
        className={`rounded-xl border overflow-hidden shadow-sm transition-shadow ${cfg.border} ${isExpanded ? 'shadow-md' : ''}`}
      >
        {/* Header – closed sub-card: check item, status, last activity, date/time */}
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`vmu-defect-panel-${d.id}`}
          onClick={() => setExpandedDefectId(prev => prev === d.id ? null : d.id)}
          className={`w-full min-h-11 px-4 py-3 text-left cursor-pointer ${cfg.bg} hover:opacity-95 transition-opacity`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 items-center">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
              <span className="text-xs font-medium text-charcoal truncate">
                {d.check_item_label || d.description || '—'}
              </span>
            </div>
            <span className="text-xs font-medium text-slate-600 truncate">{cfg.label}</span>
            <span className="text-xs text-slate-500 truncate">{getLastActivityEntryShort(d)}</span>
            <span className="text-xs text-slate-400 whitespace-nowrap sm:justify-self-end">
              {formatLastChangeDateTime(getLastChangeTimestamp(d))}
            </span>
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div id={`vmu-defect-panel-${d.id}`} className="border-t border-slate-100 bg-white">
            {/* Row 1: Two equal columns – left: Description+Photos, right: Form */}
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* LEFT: Description + Photos */}
              <div className="p-3 pb-0 lg:pb-3 lg:pr-4 lg:border-r border-slate-100 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</h4>
                  <p className="text-sm text-slate-700 leading-snug">{d.description}</p>
                </div>
                {d.image_urls && d.image_urls.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Photos ({d.image_urls.length})</h4>
                    <div className={`grid gap-1.5 ${showAllPhotos[d.id] ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {(showAllPhotos[d.id] ? d.image_urls : d.image_urls.slice(0, 4)).map((url, idx) => (
                        <button
                          key={url || idx}
                          type="button"
                          aria-label={`Open defect photo ${idx + 1}`}
                          onClick={async () => {
                            try {
                              const signed = await createPrecheckSignedUrl(supabase, url);
                              setLightboxUrl(signed || url);
                            } catch {
                              setLightboxUrl(url);
                            }
                          }}
                          className="aspect-square min-h-11 rounded overflow-hidden bg-slate-100 cursor-pointer hover:opacity-85 transition-opacity"
                        >
                          <PrecheckSignedImage url={url} className="w-full h-full object-cover" alt="" />
                        </button>
                      ))}
                      {!showAllPhotos[d.id] && d.image_urls.length > 4 && (
                        <button
                          type="button"
                          aria-label={`Show ${d.image_urls.length - 4} more photos`}
                          onClick={() => setShowAllPhotos(prev => ({ ...prev, [d.id]: true }))}
                          className="aspect-square min-h-11 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex flex-col items-center justify-center text-slate-600"
                        >
                          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          <span className="text-xs">+{d.image_urls.length - 4}</span>
                        </button>
                      )}
                    </div>
                    {showAllPhotos[d.id] && d.image_urls.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllPhotos(prev => ({ ...prev, [d.id]: false }))}
                        className="text-xs font-medium text-charcoal underline-offset-2 hover:underline mt-1 min-h-11 inline-flex items-center gap-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        Show less
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: Status + VMU notes */}
              <div className="p-3 lg:pl-4 space-y-2.5">
                <div>
                  <label htmlFor={`vmu-status-${d.id}`} className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Status</label>
                  {readOnly ? (
                    <div
                      id={`vmu-status-${d.id}`}
                      className={`w-full min-h-11 text-sm font-medium text-charcoal rounded-lg px-2.5 py-2.5 border ${cfg.border} ${cfg.bg}`}
                    >
                      {cfg.label}
                    </div>
                  ) : (
                    <select
                      id={`vmu-status-${d.id}`}
                      value={d.repair_status}
                      onChange={(e) => handleStatusChange(d.id, e.target.value)}
                      className={`admin-input admin-select w-full min-h-11 text-sm font-medium text-charcoal rounded-lg pl-2.5 py-2 border ${cfg.border} ${cfg.bg} focus:outline-none focus:ring-2 focus:ring-slate-300/40 transition-colors`}
                    >
                      {getStatusOptions(STATUS_CONFIG, d.repair_status).map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label htmlFor={`vmu-notes-${d.id}`} className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">VMU Notes</label>
                  {readOnly ? (
                    <p
                      id={`vmu-notes-${d.id}`}
                      className="w-full text-sm leading-snug text-slate-700 rounded-lg px-2.5 py-2 border border-slate-200 bg-slate-50 min-h-11"
                    >
                      {d.vmu_notes || '—'}
                    </p>
                  ) : (
                    <textarea
                      id={`vmu-notes-${d.id}`}
                      defaultValue={d.vmu_notes || ''}
                      placeholder="Add notes..."
                      rows={2}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (d.vmu_notes || '')) saveField(d.id, 'vmu_notes', val);
                      }}
                      className="w-full min-h-11 text-sm leading-snug text-slate-700 rounded-lg px-2.5 py-2 border border-slate-200 bg-white placeholder:text-slate-400 resize-none focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-300/40 transition-colors"
                    />
                  )}
                </div>
                {d.repair_status === 'resolved' && resolvedName && (
                  <div className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-2 border border-emerald-100">
                    <span className="font-semibold">Resolved</span> by {resolvedName} on {formatDate(d.resolved_at)}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Activity Log – full width, max 15 lines visible, then scroll */}
            <div className="border-t border-slate-100 px-3 pt-2.5 pb-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Activity Log</h4>
              {(() => {
              const isLogLoading = activityLoading[d.id];

              if (isLogLoading) {
                return (
                  <div className="text-xs text-slate-400 py-2">Loading activity...</div>
                );
              }

              const merged = mergeActivityEntries(d);

              return (
                <div className="max-h-[360px] overflow-y-auto pr-2">
                <div className="space-y-1">
                    {merged.map((entry) => {
                      const name = entry.profiles
                        ? `${entry.profiles.first_name || ''} ${entry.profiles.last_name || ''}`.trim()
                        : 'Unknown';
                      const time = formatRelativeTime(entry.created_at);
                      const dateFormatted = entry.created_at
                        ? formatDateTime(entry.created_at)
                        : '';

                      let description;
                      if (entry.type === 'initial_report') {
                        description = <>reported this defect on {dateFormatted}</>;
                      } else if (entry.type === 'confirmation') {
                        description = <>reported that the problem still exists on {dateFormatted}</>;
                      } else if (entry.type === 'fixed_confirmation') {
                        description = <>confirmed this defect has been fixed on {dateFormatted}</>;
                      } else if (entry.type === 'status_change') {
                        const oldDisplay = formatFieldValue(entry.field_name, entry.old_value);
                        const newDisplay = formatFieldValue(entry.field_name, entry.new_value);
                        description = (
                          <>
                            changed status
                            {oldDisplay && <> from <span className="font-medium">{oldDisplay}</span></>}
                            {newDisplay && <> to <span className="font-medium">{newDisplay}</span></>}
                            {' '}on {dateFormatted}
                          </>
                        );
                      } else {
                        const fieldLabel = FIELD_LABELS[entry.field_name] || entry.field_name;
                        const newDisplay = formatFieldValue(entry.field_name, entry.new_value);
                        if (!newDisplay) {
                          description = (
                            <>cleared <span className="font-medium">{fieldLabel}</span></>
                          );
                        } else {
                          description = (
                            <>
                              updated <span className="font-medium">{fieldLabel}</span>
                              {' '}to <span className="font-medium text-charcoal">{
                                String(newDisplay).length > 40
                                  ? String(newDisplay).slice(0, 40) + '...'
                                  : newDisplay
                              }</span>
                            </>
                          );
                        }
                      }

                      const isFirst = entry.type === 'initial_report';
                      return (
                        <div key={entry.id} className="flex gap-2 text-xs text-slate-500 leading-tight py-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${isFirst ? 'bg-blue-500' : 'bg-slate-300'}`} aria-hidden="true" />
                          <span className="flex-1 min-w-0">
                            <span className="font-semibold text-slate-700">{name}</span>{' '}
                            {description}
                            <span className="text-slate-400 ml-1">· {time}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───
  return (
    <div className="page-content-inner min-h-screen flex flex-col px-4 py-6 md:px-6">
      <div className="flex-1 flex flex-col gap-4">
      {/* Filters */}
      <div className="card-modern p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-3 md:flex-nowrap">
          <div className="w-full md:flex-1 md:min-w-0">
            <label htmlFor="vmu-filter-search" className="block text-xs font-semibold text-slate-600 mb-1">
              Search
            </label>
            <input
              id="vmu-filter-search"
              type="search"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Description, tug, notes..."
              className="admin-input w-full min-h-11 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-medium text-charcoal bg-white shadow-sm placeholder:text-slate-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:contents">
            <div className="min-w-0 md:w-auto md:flex-shrink-0 md:min-w-[9rem]">
              <label htmlFor="vmu-filter-tug" className="block text-xs font-semibold text-slate-600 mb-1">
                Tug
              </label>
              <select
                id="vmu-filter-tug"
                value={filters.tug}
                onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
                className="admin-input admin-select w-full min-h-11 border border-slate-200 rounded-xl pl-3 text-sm font-medium text-charcoal bg-white"
              >
                <option value="">All tugs</option>
                {tugs.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name ? `${t.display_name} (${t.tug_number})` : t.tug_number}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 md:w-auto md:flex-shrink-0 md:min-w-[9rem]">
              <label htmlFor="vmu-filter-status" className="block text-xs font-semibold text-slate-600 mb-1">
                Status
              </label>
              <select
                id="vmu-filter-status"
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="admin-input admin-select w-full min-h-11 border border-slate-200 rounded-xl pl-3 text-sm font-medium text-charcoal bg-white"
              >
                <option value="">All statuses</option>
                {getStatusOptions(STATUS_CONFIG, filters.status).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content — error vs empty: never show "No defects found" after a failed fetch */}
      {loading ? (
        <div
          className="animate-pulse space-y-3 motion-reduce:animate-none"
          aria-busy="true"
          aria-label="Loading defects"
        >
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <p className="font-medium text-red-600">{loadError}</p>
          <button
            type="button"
            onClick={fetchData}
            className="mt-4 btn-secondary px-4 py-2 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : filteredDamages.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="font-medium text-slate-600">No defects found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        /* ─── Tug View (default) ─── */
        <div className="space-y-4">
          {tugGroups.map(group => {
            const isGroupExpanded = expandedTugs.has(group.id);
            const openDamages = [
              ...group.damages.filter(d => isDefectAwaitingRepair(d.repair_status)),
              ...group.damages.filter(d => d.repair_status === 'acknowledged'),
            ];
            const resolvedDamages = group.damages.filter(d => d.repair_status === 'resolved');
            const hasAwaiting = group.openCount > 0;
            const cardStyle = hasAwaiting
              ? 'border border-amber-200 bg-amber-50/50'
              : 'border border-green-200 bg-green-50/50';
            const headerStyle = hasAwaiting
              ? 'bg-red-50/50 hover:bg-red-100/70'
              : 'bg-green-50/50 hover:bg-green-100/70';

            const latestActivityTs = group.damages.reduce((best, d) => {
              const ts = getLastChangeTimestamp(d);
              if (!ts) return best;
              if (!best) return ts;
              return new Date(ts) > new Date(best) ? ts : best;
            }, null);

            return (
              <div key={group.id} className={`rounded-xl border overflow-hidden shadow-sm ${cardStyle}`}>
                {/* Tug header – equal columns, no truck icon */}
                <button
                  type="button"
                  aria-expanded={isGroupExpanded}
                  aria-controls={`vmu-tug-panel-${group.id}`}
                  onClick={() => toggleTugGroup(group.id)}
                  className={`w-full px-4 py-3 grid grid-cols-4 sm:grid-cols-4 gap-2 sm:gap-3 items-center min-h-11 transition-colors text-left ${headerStyle}`}
                >
                  <span className="text-sm font-semibold text-charcoal truncate">{group.name}</span>
                  <span className="text-xs text-slate-600 font-mono truncate">{group.number}</span>
                  <span className="text-xs text-slate-500 truncate">
                    {group.openCount} awaiting repair
                  </span>
                  <span className="text-xs text-slate-500 truncate sm:justify-self-end">
                    {formatLastChangeDateTime(latestActivityTs)}
                  </span>
                </button>

                {/* Tug damages */}
                {isGroupExpanded && (
                  <div id={`vmu-tug-panel-${group.id}`} className="border-t border-slate-200 p-3 space-y-2">
                    {openDamages.length > 0 && (
                      <div className="space-y-2">
                        {openDamages.map(d => renderDefectCard(d))}
                      </div>
                    )}
                    {resolvedDamages.length > 0 && (
                      hasAwaiting ? (
                        <details className="mt-2">
                          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 min-h-11 flex items-center list-none">
                            {resolvedDamages.length} resolved defect{resolvedDamages.length !== 1 ? 's' : ''}
                          </summary>
                          <div className="space-y-2 mt-2">
                            {resolvedDamages.map(d => renderDefectCard(d))}
                          </div>
                        </details>
                      ) : (
                        <div className="space-y-2">
                          {resolvedDamages.map(d => renderDefectCard(d))}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(resolveConfirm)}
        onClose={() => setResolveConfirm(null)}
        onConfirm={() => {
          if (resolveConfirm) {
            applyStatusChange(resolveConfirm.damageId, resolveConfirm.newStatus);
          }
        }}
        title="Mark as resolved?"
        message="This will close the defect. You can reopen it later if needed."
        confirmText="Mark resolved"
        cancelText="Cancel"
      />

      <Modal
        isOpen={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        ariaLabel="Defect photo"
        overlayClassName="z-[99999]"
        className="max-w-5xl w-full bg-slate-950 border-slate-800 p-3 sm:p-4"
      >
        <div className="relative">
          <button
            type="button"
            data-autofocus
            aria-label="Close photo"
            onClick={() => setLightboxUrl(null)}
            className="absolute -right-1 -top-1 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-2xl font-light text-white/80 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
          {lightboxUrl ? (
            <img
              src={lightboxUrl}
              alt="Defect photo enlarged"
              className="max-h-[85vh] w-full object-contain rounded-lg"
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
