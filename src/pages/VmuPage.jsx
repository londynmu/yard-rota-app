import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { STATUS_CONFIG } from '../components/Admin/PreCheck/PreCheckList';

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: cfg.label,
  dot: cfg.dot,
}));

const VMU_FILTERS_KEY = 'vmu_filters';

const FIELD_LABELS = {
  repair_status: 'Status',
  defect_number: 'Defect Number',
  reported_to_terberg_at: 'Reported to Terberg',
  vmu_notes: 'VMU Notes',
};

const SKIP_LOG_FIELDS = new Set(['resolved_at', 'resolved_by']);

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
    const raw = localStorage.getItem(VMU_FILTERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { tug: '', status: '', search: '' };
}

export default function VmuPage() {
  const { user } = useAuth();

  // ─── Data ───
  const [damages, setDamages] = useState([]);
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── Filters ───
  const [filters, setFilters] = useState(loadPersistedFilters);

  // ─── Expanded tug groups (Set of tug IDs, allows multiple open) ───
  const [expandedTugs, setExpandedTugs] = useState(new Set());

  // ─── Expanded defect card (single defect detail view) ───
  const [expandedDefectId, setExpandedDefectId] = useState(null);

  // ─── Image lightbox ───
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [showAllPhotos, setShowAllPhotos] = useState({});

  // ─── Editing state for inline fields ───
  const [editingFields, setEditingFields] = useState({});

  // ─── Activity logs ───
  const [activityLogs, setActivityLogs] = useState({});
  const [confirmationsByDamage, setConfirmationsByDamage] = useState({});
  const [activityLoading, setActivityLoading] = useState({});
  const [showAllActivity, setShowAllActivity] = useState({});

  // ─── Persist filters ───
  useEffect(() => {
    localStorage.setItem(VMU_FILTERS_KEY, JSON.stringify(filters));
  }, [filters]);

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [damagesRes, tugsRes, checkItemsRes] = await Promise.all([
        supabase
          .from('precheck_damages')
          .select(`
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
          `)
          .neq('source', 'remarks')
          .order('created_at', { ascending: false }),
        supabase.from('tugs').select('id, tug_number, display_name').order('tug_number'),
        supabase.from('precheck_check_items').select('item_key, label').eq('is_active', true),
      ]);

      if (damagesRes.error) throw damagesRes.error;
      if (tugsRes.error) throw tugsRes.error;
      if (checkItemsRes.error) throw checkItemsRes.error;

      // Create a map of item_key to label for check items
      const checkItemLabels = {};
      (checkItemsRes.data || []).forEach(item => {
        checkItemLabels[item.item_key] = item.label;
      });

      // Enhance damages data with labels
      const enhancedDamages = (damagesRes.data || []).map(damage => ({
        ...damage,
        check_item_label: damage.precheck_items?.item_name 
          ? checkItemLabels[damage.precheck_items.item_name] 
          : null
      }));

      setDamages(enhancedDamages);
      setTugs(tugsRes.data || []);
    } catch (err) {
      console.error('[VmuPage] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filter damages ───
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
        const defNum = (d.defect_number || '').toLowerCase();
        const tugName = (d.precheck_submissions?.tugs?.display_name || '').toLowerCase();
        const tugNum = (d.precheck_submissions?.tugs?.tug_number || '').toLowerCase();
        const notes = (d.vmu_notes || '').toLowerCase();
        return desc.includes(q) || defNum.includes(q) || tugName.includes(q) ||
               tugNum.includes(q) || notes.includes(q);
      });
    }

    return result;
  }, [damages, filters]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const open = damages.filter(d => d.repair_status === 'open').length;
    const reported = damages.filter(d => d.repair_status === 'reported').length;
    const awaiting = damages.filter(d => d.repair_status === 'awaiting_parts').length;
    const inProgress = damages.filter(d => d.repair_status === 'in_progress').length;
    const resolved = damages.filter(d => d.repair_status === 'resolved').length;
    return { total: damages.length, open, reported, awaiting, inProgress, resolved };
  }, [damages]);

  // ─── Update damage field ───
  const updateDamageField = async (damageId, updates) => {
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

      // 3. Log changes AFTER successful DB update (fire-and-forget)
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
          // Fire-and-forget insert + optimistic cache update
          supabase.from('defect_activity_log').insert(logEntries).then(({ data }) => {
            // Don't block on this - just log errors
          }).catch(err => console.error('[VmuPage] Activity log error:', err));

          // Optimistic update of activity log cache
          const optimisticEntries = logEntries.map(entry => ({
            ...entry,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            profiles: { first_name: user.user_metadata?.first_name, last_name: user.user_metadata?.last_name },
          }));
          setActivityLogs(prev => ({
            ...prev,
            [damageId]: [...optimisticEntries, ...(prev[damageId] || [])],
          }));
        }
      }
    } catch (err) {
      console.error('[VmuPage] Update error:', err);
      fetchData(); // revert on error
    }
  };

  // ─── Status change handler ───
  const handleStatusChange = (damageId, newStatus) => {
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

  // ─── Save inline field ───
  const saveField = (damageId, field, value) => {
    updateDamageField(damageId, { [field]: value || null });
    setEditingFields(prev => {
      const next = { ...prev };
      delete next[`${damageId}-${field}`];
      return next;
    });
  };

  // ─── Fetch activity log + confirmations when defect card expands ───
  const fetchActivityLog = useCallback(async (damageId) => {
    if (!damageId) return;
    if (activityLogs[damageId] !== undefined && confirmationsByDamage[damageId] !== undefined) return; // already cached
    setActivityLoading(prev => ({ ...prev, [damageId]: true }));
    try {
      const [logRes, confRes] = await Promise.all([
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
      ]);

      if (logRes.error) throw logRes.error;
      if (confRes.error) throw confRes.error;
      setActivityLogs(prev => ({ ...prev, [damageId]: logRes.data || [] }));
      setConfirmationsByDamage(prev => ({ ...prev, [damageId]: confRes.data || [] }));
    } catch (err) {
      console.error('[VmuPage] Activity/confirmations fetch error:', err);
      setActivityLogs(prev => ({ ...prev, [damageId]: prev[damageId] ?? [] }));
      setConfirmationsByDamage(prev => ({ ...prev, [damageId]: prev[damageId] ?? [] }));
    } finally {
      setActivityLoading(prev => ({ ...prev, [damageId]: false }));
    }
  }, [activityLogs, confirmationsByDamage]);

  useEffect(() => {
    if (expandedDefectId) {
      fetchActivityLog(expandedDefectId);
    }
  }, [expandedDefectId, fetchActivityLog]);

  // ─── Fetch activity logs for all damages on page load (for closed cards) ───
  useEffect(() => {
    if (!damages.length) return;
    const damageIds = damages.map(d => d.id);
    if (damageIds.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const [logRes, confRes] = await Promise.all([
          supabase
            .from('defect_activity_log')
            .select('*, profiles:user_id(first_name, last_name)')
            .in('damage_id', damageIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('precheck_damage_confirmations')
            .select('id, damage_id, created_at, profiles:user_id(first_name, last_name)')
            .in('damage_id', damageIds)
            .order('created_at', { ascending: false }),
        ]);

        if (cancelled) return;
        if (logRes.error || confRes.error) return;

        const logsByDamage = {};
        (logRes.data || []).forEach(row => {
          if (!logsByDamage[row.damage_id]) logsByDamage[row.damage_id] = [];
          logsByDamage[row.damage_id].push(row);
        });
        const confByDamage = {};
        (confRes.data || []).forEach(row => {
          if (!confByDamage[row.damage_id]) confByDamage[row.damage_id] = [];
          confByDamage[row.damage_id].push(row);
        });

        setActivityLogs(prev => ({ ...prev, ...logsByDamage }));
        setConfirmationsByDamage(prev => ({ ...prev, ...confByDamage }));
      } catch (err) {
        if (!cancelled) console.error('[VmuPage] Bulk activity fetch error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [damages]);

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
      if (d.repair_status !== 'resolved') map[tugId].openCount++;
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

  const getTugLabel = (d) => {
    const tug = d.precheck_submissions?.tugs;
    if (!tug) return 'Unknown';
    return tug.display_name || tug.tug_number;
  };

  const getTugNumber = (d) => {
    const tug = d.precheck_submissions?.tugs;
    return tug?.tug_number || '—';
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

  const getLastActivityEntryShort = (d) => {
    const initialEntry = {
      type: 'initial_report',
      created_at: d.precheck_submissions?.created_at || d.created_at,
      profiles: d.precheck_submissions?.profiles,
    };
    const confirmations = (confirmationsByDamage[d.id] || []).map(c => ({
      type: 'confirmation',
      created_at: c.created_at,
      profiles: c.profiles,
    }));
    const activityEntries = (activityLogs[d.id] || []).map(e => ({
      ...e,
      type: e.action_type,
    }));
    const merged = [initialEntry, ...confirmations, ...activityEntries]
      .filter(e => e.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
    if (latest.type === 'status_change') {
      const newVal = formatFieldValue('repair_status', latest.new_value);
      return `${name} → ${newVal || 'status'}`;
    }
    return `${name} updated`;
  };

  const getLastChangeTimestamp = (d) => {
    const initialEntry = {
      type: 'initial_report',
      created_at: d.precheck_submissions?.created_at || d.created_at,
    };
    const confirmations = (confirmationsByDamage[d.id] || []).map(c => ({ created_at: c.created_at }));
    const activityEntries = (activityLogs[d.id] || []).map(e => ({ created_at: e.created_at }));
    const merged = [initialEntry, ...confirmations, ...activityEntries]
      .filter(e => e.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const latest = merged[0];
    return latest?.created_at || d.updated_at || d.resolved_at || d.created_at;
  };

  const getLastActivityShort = (d) => {
    const at = d.precheck_submissions?.created_at || d.created_at;
    if (!at) return '—';
    return new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const renderDefectCard = (d, showTug = true) => {
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
        {/* Header – closed sub-card: check item, defect number, last activity, date/time */}
        <button
          type="button"
          onClick={() => setExpandedDefectId(prev => prev === d.id ? null : d.id)}
          className={`w-full px-4 py-3 text-left cursor-pointer ${cfg.bg} hover:opacity-95 transition-opacity`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 items-center">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <span className="text-xs font-medium text-charcoal truncate">
                {d.check_item_label || d.description || '—'}
              </span>
            </div>
            <span className="text-xs font-mono text-gray-600 truncate">{d.defect_number || '—'}</span>
            <span className="text-[11px] text-gray-500 truncate">{getLastActivityEntryShort(d)}</span>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatLastChangeDateTime(getLastChangeTimestamp(d))}</span>
              <svg
                className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-gray-200 bg-white">
            {/* Row 1: Two equal columns – left: Description+Photos, right: Form */}
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* LEFT: Description + Photos */}
              <div className="p-3 lg:pr-4 lg:border-r border-gray-100 space-y-3">
                <div>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</h4>
                  <p className="text-sm text-gray-700 leading-snug">{d.description}</p>
                </div>
                {d.image_urls && d.image_urls.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Photos ({d.image_urls.length})</h4>
                    <div className={`grid gap-1.5 ${showAllPhotos[d.id] ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {(showAllPhotos[d.id] ? d.image_urls : d.image_urls.slice(0, 4)).map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxUrl(url)}
                          className="aspect-square rounded overflow-hidden bg-slate-100 cursor-pointer hover:opacity-85 transition-opacity"
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {!showAllPhotos[d.id] && d.image_urls.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setShowAllPhotos(prev => ({ ...prev, [d.id]: true }))}
                          className="aspect-square rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer flex flex-col items-center justify-center text-gray-600"
                        >
                          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="text-[10px] text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-0.5"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        Show less
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: Form fields – actions & inputs */}
              <div className="p-3 lg:pl-4 bg-gray-50/40">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mb-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">Status</label>
                    <select
                        value={d.repair_status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value)}
                        className={`w-full text-sm font-medium rounded-lg px-3 py-2.5 border ${cfg.border} ${cfg.bg} appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.75rem_center] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors`}
                        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">Defect Number</label>
                      <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-colors">
                        <span className="pl-3 pr-1 text-sm font-mono font-semibold text-gray-500 select-none">D-</span>
                        <input
                          type="text"
                          defaultValue={(d.defect_number || '').replace(/^D-/i, '')}
                          placeholder="234567"
                          onBlur={(e) => {
                            const num = e.target.value.trim().replace(/^D-/i, '');
                            const full = num ? `D-${num}` : '';
                            if (full !== (d.defect_number || '')) saveField(d.id, 'defect_number', full);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          className="flex-1 text-sm py-2 pr-3 bg-transparent font-mono placeholder:text-gray-300 outline-none"
                        />
                      </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">Reported to Terberg</label>
                      <input
                        type="date"
                        defaultValue={d.reported_to_terberg_at ? d.reported_to_terberg_at.split('T')[0] : ''}
                        onBlur={(e) => {
                          const val = e.target.value;
                          const current = d.reported_to_terberg_at ? d.reported_to_terberg_at.split('T')[0] : '';
                          if (val !== current) {
                            saveField(d.id, 'reported_to_terberg_at', val ? new Date(val + 'T12:00:00').toISOString() : null);
                          }
                        }}
                        className="w-full text-sm rounded px-2.5 py-2 border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                      />
                    </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-gray-500 block mb-1">VMU Notes</label>
                      <textarea
                        defaultValue={d.vmu_notes || ''}
                        placeholder="Add notes..."
                        rows={2}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (d.vmu_notes || '')) saveField(d.id, 'vmu_notes', val);
                        }}
                        className="w-full text-sm rounded px-2.5 py-2 border border-gray-200 bg-white placeholder:text-gray-300 resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
                      />
                    </div>
                </div>
                {d.repair_status === 'resolved' && resolvedName && (
                  <div className="text-[10px] text-green-700 bg-green-50 rounded px-2.5 py-1.5 border border-green-200">
                    <span className="font-semibold">Resolved</span> by {resolvedName} on {formatDate(d.resolved_at)}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Activity Log – full width, max 15 lines visible, then scroll */}
            <div className="border-t border-gray-100 p-3">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Activity Log</h4>
              {(() => {
              const isLogLoading = activityLoading[d.id];

              if (isLogLoading) {
                return (
                  <div className="text-xs text-gray-400 py-2">Loading activity...</div>
                );
              }

              const initialEntry = {
                type: 'initial_report',
                created_at: d.precheck_submissions?.created_at || d.created_at,
                id: `initial-${d.id}`,
                profiles: d.precheck_submissions?.profiles,
              };
              const confirmations = (confirmationsByDamage[d.id] || []).map(c => ({
                type: 'confirmation',
                id: c.id,
                created_at: c.created_at,
                profiles: c.profiles,
              }));
              const activityEntries = (activityLogs[d.id] || []).map(e => ({
                ...e,
                type: e.action_type,
              }));
              const merged = [initialEntry, ...confirmations, ...activityEntries]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

              return (
                <div className="max-h-[360px] overflow-y-auto pr-2">
                <div className="space-y-1">
                    {merged.map((entry, idx) => {
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
                      } else if (entry.type === 'status_change') {
                        const fieldLabel = FIELD_LABELS[entry.field_name] || entry.field_name;
                        const oldDisplay = formatFieldValue(entry.field_name, entry.old_value);
                        const newDisplay = formatFieldValue(entry.field_name, entry.new_value);
                        description = (
                          <>
                            changed status
                            {oldDisplay && <> from <span className="font-medium">{oldDisplay}</span></>}
                            {newDisplay && <> to <span className="font-medium">{newDisplay}</span></>}
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
                        <div key={entry.id} className="flex gap-2 text-[11px] text-gray-500 leading-tight py-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${isFirst ? 'bg-blue-500' : 'bg-gray-300'}`} />
                          <span className="flex-1 min-w-0">
                            <span className="font-semibold text-gray-700">{name}</span>{' '}
                            {description}
                            <span className="text-gray-400 ml-1">· {time}</span>
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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2 md:flex-nowrap">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          placeholder="Search defect number, description, tug..."
          className="w-full md:flex-1 md:min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 px-4 md:px-3 text-sm md:text-xs font-medium text-charcoal bg-white shadow-sm placeholder:text-gray-400"
        />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <select
            value={filters.tug}
            onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
            className="w-full min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 pl-3 pr-8 text-sm md:text-xs font-medium text-charcoal bg-white md:w-auto md:flex-shrink-0 md:min-w-[8rem] appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.5rem_center]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
          >
            <option value="">All tugs</option>
            {tugs.map(t => (
              <option key={t.id} value={t.id}>{t.display_name ? `${t.display_name} (${t.tug_number})` : t.tug_number}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 pl-3 pr-8 text-sm md:text-xs font-medium text-charcoal bg-white md:w-auto md:flex-shrink-0 appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.5rem_center]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
        </div>
      ) : filteredDamages.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No defects found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        /* ─── Tug View (default) ─── */
        <div className="space-y-4">
          {tugGroups.map(group => {
            const isGroupExpanded = expandedTugs.has(group.id);
            const openDamages = group.damages.filter(d => d.repair_status !== 'resolved');
            const resolvedDamages = group.damages.filter(d => d.repair_status === 'resolved');

            return (
              <div key={group.id} className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Tug header */}
                <button
                  type="button"
                  onClick={() => toggleTugGroup(group.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <span className="text-lg">🚛</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-charcoal text-sm">{group.name}</span>
                    {group.name !== group.number && (
                      <span className="text-gray-400 text-xs ml-1">({group.number})</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {group.damages.length} total
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isGroupExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Tug damages */}
                {isGroupExpanded && (
                  <div className="border-t border-gray-200 p-3 space-y-2">
                    {openDamages.length > 0 && (
                      <div className="space-y-2">
                        {openDamages.map(d => renderDefectCard(d, false))}
                      </div>
                    )}
                    {resolvedDamages.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 py-1">
                          {resolvedDamages.length} resolved defect{resolvedDamages.length !== 1 ? 's' : ''}
                        </summary>
                        <div className="space-y-2 mt-2">
                          {resolvedDamages.map(d => renderDefectCard(d, false))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Lightbox ─── */}
      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light z-10"
          >
            ×
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
