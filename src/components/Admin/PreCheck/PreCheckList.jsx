import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../lib/AuthContext';

export default function PreCheckList() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('byDate');
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    location: '',
    tug: '',
    user: '',
    checkType: '',
  });
  const [locations, setLocations] = useState([]);
  const [tugs, setTugs] = useState([]);
  const [stats, setStats] = useState({ total: 0, withDamages: 0, withRepairs: 0 });

  // ─── Fetch filter options ───
  const fetchFilters = useCallback(async () => {
    const [locRes, tugRes] = await Promise.all([
      supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
      supabase.from('tugs').select('id, tug_number').order('tug_number'),
    ]);
    setLocations(locRes.data || []);
    setTugs(tugRes.data || []);
  }, []);

  // ─── Fetch submissions with full item + damage data ───
  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('precheck_submissions')
        .select(`
          *,
          profiles:user_id(first_name, last_name),
          tugs(tug_number, display_name, location_id, locations(name)),
          precheck_items(*),
          precheck_damages(*, resolved_profile:resolved_by(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.date) {
        query = query.eq('check_date', filters.date);
      }
      if (filters.checkType) {
        query = query.eq('check_type', filters.checkType);
      }
      if (filters.tug) {
        query = query.eq('tug_id', filters.tug);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];

      // Client-side filter by location
      if (filters.location) {
        filtered = filtered.filter(s => s.tugs?.location_id === filters.location);
      }

      // Client-side filter by user name
      if (filters.user) {
        const search = filters.user.toLowerCase();
        filtered = filtered.filter(s => {
          const name = `${s.profiles?.first_name || ''} ${s.profiles?.last_name || ''}`.toLowerCase();
          return name.includes(search);
        });
      }

      setSubmissions(filtered);

      // Stats
      setStats({
        total: filtered.length,
        withDamages: filtered.filter(s => s.precheck_damages?.length > 0).length,
        withRepairs: filtered.filter(s =>
          s.precheck_damages?.some(d => d.repair_status === 'open')
        ).length,
      });
    } catch (err) {
      console.error('[PreCheckList] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // ─── Update damage status (optimistic + refetch) ───
  const updateDamageStatus = async (damageId, newStatus, submissionId) => {
    try {
      const updates = { repair_status: newStatus };
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user.id;
      } else {
        updates.resolved_at = null;
        updates.resolved_by = null;
      }

      // Optimistic local update
      setSubmissions(prev => prev.map(sub => {
        if (sub.id !== submissionId) return sub;
        return {
          ...sub,
          precheck_damages: sub.precheck_damages.map(d => {
            if (d.id !== damageId) return d;
            return { ...d, ...updates };
          }),
        };
      }));

      const { error } = await supabase
        .from('precheck_damages')
        .update(updates)
        .eq('id', damageId);

      if (error) throw error;

      // Refetch for fresh resolved_profile data
      fetchSubmissions();
    } catch (err) {
      console.error('[PreCheckList] Update damage error:', err);
      fetchSubmissions();
    }
  };

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // ─── Grouping logic ───
  const grouped = useMemo(() => {
    if (viewMode === 'byTug') {
      const map = {};
      submissions.forEach(sub => {
        const key = sub.tug_id;
        if (!map[key]) {
          map[key] = {
            key,
            label: sub.tugs?.display_name || sub.tugs?.tug_number || 'Unknown Tug',
            sublabel: sub.tugs?.display_name ? sub.tugs.tug_number : null,
            location: sub.tugs?.locations?.name || null,
            items: [],
          };
        }
        map[key].items.push(sub);
      });
      // Sort groups by tug number
      return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
    } else {
      const map = {};
      submissions.forEach(sub => {
        const key = sub.check_date;
        if (!map[key]) {
          map[key] = {
            key,
            label: new Date(key + 'T12:00:00').toLocaleDateString('en-GB', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            }),
            items: [],
          };
        }
        map[key].items.push(sub);
      });
      // Sort groups by date descending
      return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
    }
  }, [submissions, viewMode]);

  // ─── Build fault cards for a submission ───
  const getFaults = (sub) => {
    const damages = sub.precheck_damages || [];
    const items = sub.precheck_items || [];
    const remarksText = sub.remarks || '';

    const faults = damages.map(damage => {
      // Try to find linked item via item_id
      const linkedItem = damage.item_id
        ? items.find(i => i.id === damage.item_id)
        : null;

      // Determine header: linked item > location > parse "Label - repair needed" > fallback
      let header;
      if (linkedItem) {
        header = linkedItem.item_name.replace(/_/g, ' ');
      } else if (damage.location_on_tug) {
        header = damage.location_on_tug;
      } else if (damage.description === remarksText || damage.description === 'Additional photos') {
        header = 'Remarks';
      } else {
        // Legacy fallback: try to extract item label from "Label - repair needed"
        const match = damage.description?.match(/^(.+?)\s*-\s*repair needed$/i);
        header = match ? match[1] : 'Damage Report';
      }

      return {
        id: damage.id,
        header,
        description: damage.description,
        imageUrls: damage.image_urls || [],
        severity: damage.severity,
        repairStatus: damage.repair_status,
        resolvedAt: damage.resolved_at,
        resolvedProfile: damage.resolved_profile,
      };
    });

    // Legacy: if submission has remarks but no matching damage, add virtual fault
    if (remarksText && !damages.some(d => d.description === remarksText || d.description === 'Additional photos')) {
      faults.push({
        id: `remarks-${sub.id}`,
        header: 'Remarks',
        description: remarksText,
        imageUrls: [],
        severity: 'minor',
        repairStatus: null,
        resolvedAt: null,
        resolvedProfile: null,
      });
    }

    return faults;
  };

  // ─── Render ───
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-charcoal">{stats.total}</div>
          <div className="text-xs text-gray-500">Total Checks</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-600">{stats.withDamages}</div>
          <div className="text-xs text-gray-500">With Damages</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-600">{stats.withRepairs}</div>
          <div className="text-xs text-gray-500">Open Repairs</div>
        </div>
      </div>

      {/* View mode toggle + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('byDate')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'byDate'
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              By Date
            </button>
            <button
              type="button"
              onClick={() => setViewMode('byTug')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'byTug'
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              By Tug
            </button>
          </div>
          <span className="text-xs text-gray-400">{submissions.length} result{submissions.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <select
              value={filters.location}
              onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tug</label>
            <select
              value={filters.tug}
              onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              {tugs.map(tug => (
                <option key={tug.id} value={tug.id}>{tug.tug_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={filters.checkType}
              onChange={(e) => setFilters(prev => ({ ...prev, checkType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="pre_shift">Pre-Shift</option>
              <option value="during_shift">During Shift</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
            <input
              type="text"
              value={filters.user}
              onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
              placeholder="Search name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No PreCheck reports found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.key}>
              {/* Group header */}
              <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-gray-200">
                <h3 className="text-sm font-bold text-charcoal">{group.label}</h3>
                {group.sublabel && (
                  <span className="text-xs text-gray-400">{group.sublabel}</span>
                )}
                {group.location && (
                  <span className="text-xs text-gray-400">{group.location}</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {group.items.length} check{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Submission cards */}
              <div className="space-y-3">
                {group.items.map(sub => {
                  const faults = getFaults(sub);
                  const profile = sub.profiles;
                  const userName = profile
                    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                    : 'Unknown';
                  const hasFaults = faults.length > 0;
                  const hasOpen = sub.precheck_damages?.some(d => d.repair_status === 'open');

                  return (
                    <div
                      key={sub.id}
                      className={`rounded-xl border overflow-hidden shadow-sm ${
                        hasOpen ? 'border-red-200'
                          : hasFaults ? 'border-orange-200'
                          : 'border-gray-200'
                      }`}
                    >
                      {/* Card header */}
                      <div className={`px-4 py-2.5 flex items-center gap-2 flex-wrap ${
                        hasOpen ? 'bg-red-50'
                          : hasFaults ? 'bg-orange-50'
                          : 'bg-gray-50'
                      }`}>
                        {/* Status dot */}
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          hasOpen ? 'bg-red-500'
                            : hasFaults ? 'bg-orange-500'
                            : 'bg-green-500'
                        }`} />

                        {/* Context-dependent info */}
                        {viewMode === 'byDate' && (
                          <span className="font-semibold text-charcoal text-sm">
                            {sub.tugs?.display_name || sub.tugs?.tug_number}
                          </span>
                        )}
                        {viewMode === 'byTug' && (
                          <span className="font-semibold text-charcoal text-sm">
                            {new Date(sub.check_date + 'T12:00:00').toLocaleDateString('en-GB', {
                              day: '2-digit', month: 'short',
                            })}
                          </span>
                        )}

                        <span className="text-xs text-gray-500">
                          {new Date(sub.check_time || sub.created_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>

                        <span className="text-xs text-gray-500">by {userName}</span>

                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          sub.check_type === 'pre_shift'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
                        </span>

                        {viewMode === 'byDate' && sub.tugs?.locations?.name && (
                          <span className="text-xs text-gray-400">{sub.tugs.locations.name}</span>
                        )}

                        {hasFaults && (
                          <span className="text-xs text-red-600 font-medium ml-auto">
                            {faults.length} damage{faults.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Card body */}
                      <div className="p-3 bg-white">
                        {hasFaults ? (
                          <div className="flex flex-wrap gap-3">
                            {faults.map(fault => (
                              <FaultCard
                                key={fault.id}
                                fault={fault}
                                onStatusChange={(newStatus) =>
                                  updateDamageStatus(fault.id, newStatus, sub.id)
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-green-600 font-medium py-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            All checks passed
                          </div>
                        )}

                        {/* Remarks are now displayed as fault cards above */}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fault sub-container ───
function FaultCard({ fault, onStatusChange }) {
  const [imgOpen, setImgOpen] = useState(null);

  const resolvedByName = fault.resolvedProfile
    ? `${fault.resolvedProfile.first_name || ''} ${fault.resolvedProfile.last_name || ''}`.trim()
    : null;

  return (
    <>
      <div className={`flex-1 min-w-[180px] max-w-[320px] rounded-lg border p-3 flex flex-col ${
        fault.repairStatus === 'resolved' ? 'border-green-200 bg-green-50'
          : fault.repairStatus === 'in_progress' ? 'border-yellow-200 bg-yellow-50'
          : fault.repairStatus === null ? 'border-gray-200 bg-gray-50'
          : 'border-red-200 bg-red-50'
      }`}>
        {/* Header: item name + severity */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h5 className="text-sm font-semibold text-charcoal capitalize truncate">
            {fault.header}
          </h5>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
            fault.severity === 'critical' ? 'bg-red-200 text-red-800'
              : fault.severity === 'major' ? 'bg-orange-200 text-orange-800'
              : 'bg-yellow-200 text-yellow-800'
          }`}>
            {fault.severity}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-700 mb-2 flex-1">{fault.description}</p>

        {/* Photos */}
        {fault.imageUrls.length > 0 && (
          <div className="space-y-1 mb-2">
            {fault.imageUrls.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setImgOpen(url)}
                className="block w-full rounded-lg overflow-hidden border border-gray-200 cursor-zoom-in"
              >
                <img
                  src={url}
                  alt={`Damage ${idx + 1}`}
                  className="w-full h-32 object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Resolved info */}
        {fault.resolvedAt && resolvedByName && (
          <p className="text-[10px] text-green-700 mb-2">
            Resolved by {resolvedByName} on {new Date(fault.resolvedAt).toLocaleDateString('en-GB')}
          </p>
        )}

        {/* Status action (only for real damage records) */}
        {fault.repairStatus !== null && (
          <select
            value={fault.repairStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`w-full text-xs font-medium rounded-lg px-2.5 py-1.5 border mt-auto cursor-pointer ${
              fault.repairStatus === 'resolved' ? 'border-green-300 bg-green-100 text-green-800'
                : fault.repairStatus === 'in_progress' ? 'border-yellow-300 bg-yellow-100 text-yellow-800'
                : 'border-red-300 bg-red-100 text-red-800'
            }`}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        )}
      </div>

      {/* Lightbox */}
      {imgOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setImgOpen(null)}
        >
          <button
            type="button"
            onClick={() => setImgOpen(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={imgOpen}
            alt="Damage full view"
            className="max-w-full max-h-[85vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
