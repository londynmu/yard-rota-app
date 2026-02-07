import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../lib/AuthContext';

export default function PreCheckList() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [showOkItems, setShowOkItems] = useState({});
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

  const fetchFilters = useCallback(async () => {
    const [locRes, tugRes] = await Promise.all([
      supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
      supabase.from('tugs').select('id, tug_number').order('tug_number'),
    ]);
    setLocations(locRes.data || []);
    setTugs(tugRes.data || []);
  }, []);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('precheck_submissions')
        .select(`
          *,
          profiles:user_id(first_name, last_name),
          tugs(tug_number, location_id, locations(name)),
          precheck_damages(id, severity, repair_status)
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

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (expandedData[id]) return;

    try {
      const [itemsRes, damagesRes] = await Promise.all([
        supabase
          .from('precheck_items')
          .select('*')
          .eq('submission_id', id)
          .order('item_category'),
        supabase
          .from('precheck_damages')
          .select('*, resolved_profile:resolved_by(first_name, last_name)')
          .eq('submission_id', id),
      ]);

      setExpandedData(prev => ({
        ...prev,
        [id]: {
          items: itemsRes.data || [],
          damages: damagesRes.data || [],
        },
      }));
    } catch (err) {
      console.error('[PreCheckList] Expand error:', err);
    }
  };

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

      const { error } = await supabase
        .from('precheck_damages')
        .update(updates)
        .eq('id', damageId);

      if (error) throw error;

      // Refresh expanded data
      const { data: freshDamages } = await supabase
        .from('precheck_damages')
        .select('*, resolved_profile:resolved_by(first_name, last_name)')
        .eq('submission_id', submissionId);

      setExpandedData(prev => ({
        ...prev,
        [submissionId]: { ...prev[submissionId], damages: freshDamages || [] },
      }));
      fetchSubmissions();
    } catch (err) {
      console.error('[PreCheckList] Update damage error:', err);
    }
  };

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
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
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No PreCheck reports found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => {
            const profile = sub.profiles;
            const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown';
            const hasDamages = sub.precheck_damages?.length > 0;
            const hasOpenDamages = sub.precheck_damages?.some(d => d.repair_status === 'open');
            const isExpanded = expandedId === sub.id;
            const detail = expandedData[sub.id];

            return (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all">
                {/* Card header */}
                <button
                  onClick={() => toggleExpand(sub.id)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      hasOpenDamages ? 'bg-red-100 text-red-600'
                        : hasDamages ? 'bg-orange-100 text-orange-600'
                        : 'bg-green-100 text-green-600'
                    }`}>
                      {hasOpenDamages ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-charcoal text-sm">{sub.tugs?.tug_number}</span>
                        <span className="text-xs text-gray-500">by {userName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          sub.check_type === 'pre_shift' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        <span>{new Date(sub.check_time || sub.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        {sub.tugs?.locations?.name && <span>{sub.tugs.locations.name}</span>}
                        {hasDamages && (
                          <span className="text-red-600">{sub.precheck_damages.length} damage(s)</span>
                        )}
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                    {!detail ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-32" />
                        <div className="h-20 bg-slate-200 rounded-lg" />
                      </div>
                    ) : (
                      (() => {
                        const checkItems = detail.items.filter(i => i.item_category === 'check');
                        const repairItems = checkItems.filter(i => i.status === 'repair_needed');
                        const okItems = checkItems.filter(i => i.status === 'ok');
                        const isOkOpen = showOkItems[sub.id] || false;

                        return (
                          <>
                            {/* 1. ISSUES — repair_needed items highlighted at top */}
                            {repairItems.length > 0 && (
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                  </svg>
                                  <h4 className="text-xs font-semibold text-red-700 uppercase">
                                    {repairItems.length} Issue{repairItems.length !== 1 ? 's' : ''} Found
                                  </h4>
                                </div>
                                <div className="bg-red-50 rounded-lg border border-red-200 divide-y divide-red-100">
                                  {repairItems.map(item => (
                                    <div key={item.id} className="flex items-center justify-between py-2.5 px-3 text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                                        <span className="text-red-800 font-medium capitalize">
                                          {item.item_name.replace(/_/g, ' ')}
                                        </span>
                                      </div>
                                      {item.notes && <span className="text-xs text-red-600">{item.notes}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 2. DAMAGE REPORTS — right after issues */}
                            {detail.damages.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Damage Reports</h4>
                                <div className="space-y-2">
                                  {detail.damages.map(damage => {
                                    const resolvedBy = damage.resolved_profile
                                      ? `${damage.resolved_profile.first_name || ''} ${damage.resolved_profile.last_name || ''}`.trim()
                                      : null;

                                    return (
                                      <div key={damage.id} className={`p-3 rounded-lg border ${
                                        damage.repair_status === 'resolved' ? 'border-green-200 bg-green-50'
                                          : damage.repair_status === 'in_progress' ? 'border-yellow-200 bg-yellow-50'
                                          : 'border-red-200 bg-red-50'
                                      }`}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`text-xs font-bold uppercase ${
                                            damage.severity === 'critical' ? 'text-red-700'
                                              : damage.severity === 'major' ? 'text-orange-700'
                                              : 'text-yellow-700'
                                          }`}>{damage.severity}</span>
                                          {damage.location_on_tug && (
                                            <span className="text-xs text-gray-500">• {damage.location_on_tug}</span>
                                          )}
                                        </div>
                                        <p className="text-sm text-gray-800">{damage.description}</p>

                                        {damage.image_urls?.length > 0 && (
                                          <div className="flex gap-2 mt-2 flex-wrap">
                                            {damage.image_urls.map((url, idx) => (
                                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                                <img src={url} alt={`Damage ${idx + 1}`} className="w-full h-full object-cover" />
                                              </a>
                                            ))}
                                          </div>
                                        )}

                                        {damage.resolved_at && resolvedBy && (
                                          <p className="text-xs text-green-600 mt-2">
                                            Resolved by {resolvedBy} on {new Date(damage.resolved_at).toLocaleDateString('en-GB')}
                                          </p>
                                        )}

                                        <div className="mt-2">
                                          <select
                                            value={damage.repair_status}
                                            onChange={(e) => updateDamageStatus(damage.id, e.target.value, sub.id)}
                                            className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                                              damage.repair_status === 'resolved' ? 'border-green-300 bg-green-100'
                                                : damage.repair_status === 'in_progress' ? 'border-yellow-300 bg-yellow-100'
                                                : 'border-red-300 bg-red-100'
                                            }`}
                                          >
                                            <option value="open">Open</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="resolved">Resolved</option>
                                          </select>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 3. Remarks */}
                            {sub.remarks && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Remarks</h4>
                                <p className="text-sm text-gray-700 bg-white p-2 rounded-lg border border-gray-200">{sub.remarks}</p>
                              </div>
                            )}

                            {/* 4. OK items — collapsible, at bottom */}
                            {okItems.length > 0 && (
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setShowOkItems(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-xs text-gray-500 font-medium">
                                      {okItems.length} item{okItems.length !== 1 ? 's' : ''} OK
                                    </span>
                                  </div>
                                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOkOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                                {isOkOpen && (
                                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                                    {okItems.map(item => (
                                      <div key={item.id} className="flex items-center justify-between py-1.5 px-3 text-sm">
                                        <span className="text-gray-500 capitalize">{item.item_name.replace(/_/g, ' ')}</span>
                                        <span className="text-xs text-green-600 font-medium">OK</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* No issues at all */}
                            {repairItems.length === 0 && detail.damages.length === 0 && !sub.remarks && (
                              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                All checks passed — no issues reported
                              </div>
                            )}
                          </>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
