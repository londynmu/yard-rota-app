import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../lib/AuthContext';

const TIME_RANGES = {
  '24h': { ms: 24 * 3600000, label: '24h' },
  '48h': { ms: 48 * 3600000, label: '48h' },
  '7d':  { ms: 7 * 24 * 3600000, label: '7 days' },
  '30d': { ms: 30 * 24 * 3600000, label: '30 days' },
};

const TUG_PAGE_SIZE = 20;

export default function PreCheckList() {
  const { user } = useAuth();

  // ─── Core state ───
  const [viewMode, setViewMode] = useState('byDate');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ─── By Date state ───
  const [timeRange, setTimeRange] = useState('24h');

  // ─── By Tug state ───
  const [selectedTug, setSelectedTug] = useState('');

  // ─── Shared secondary filters ───
  const [filters, setFilters] = useState({
    location: '',
    tug: '',        // secondary tug filter (By Date mode only)
    checkType: '',
    user: '',
  });
  const [locations, setLocations] = useState([]);
  const [tugs, setTugs] = useState([]);

  // ─── Pagination cursors (refs to avoid stale closures) ───
  const windowEndRef = useRef(new Date().toISOString());
  const tugCursorRef = useRef(null);
  const fetchGenRef = useRef(0); // generation counter to discard stale fetches
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ─── Stats (computed from loaded data) ───
  const stats = useMemo(() => ({
    total: submissions.length,
    withDamages: submissions.filter(s => s.precheck_damages?.length > 0).length,
    withRepairs: submissions.filter(s =>
      s.precheck_damages?.some(d => d.repair_status === 'open')
    ).length,
  }), [submissions]);

  // ─── Fetch filter options ───
  const fetchFilterOptions = useCallback(async () => {
    const [locRes, tugRes] = await Promise.all([
      supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
      supabase.from('tugs').select('id, tug_number, display_name').order('tug_number'),
    ]);
    setLocations(locRes.data || []);
    setTugs(tugRes.data || []);
  }, []);

  // ─── Core fetch function ───
  const fetchData = useCallback(async (append = false) => {
    // Generation counter: fresh fetches increment, appends keep current
    const gen = append ? fetchGenRef.current : ++fetchGenRef.current;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setHasMore(true);
      windowEndRef.current = new Date().toISOString();
      tugCursorRef.current = null;
    }

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
        .order('created_at', { ascending: false });

      if (viewMode === 'byDate') {
        const rangeDuration = TIME_RANGES[timeRange].ms;
        const rangeEnd = new Date(windowEndRef.current);
        const rangeStart = new Date(rangeEnd.getTime() - rangeDuration);

        query = query
          .gte('check_time', rangeStart.toISOString())
          .lt('check_time', rangeEnd.toISOString());

        // Secondary tug filter (By Date only)
        if (filters.tug) {
          query = query.eq('tug_id', filters.tug);
        }

        // Advance cursor for next load-more
        windowEndRef.current = rangeStart.toISOString();
      } else {
        // By Tug mode
        if (!selectedTug) {
          setSubmissions([]);
          setLoading(false);
          return;
        }
        query = query.eq('tug_id', selectedTug).limit(TUG_PAGE_SIZE);
        if (append && tugCursorRef.current) {
          query = query.lt('created_at', tugCursorRef.current);
        }
      }

      // Shared server-side filter
      if (filters.checkType) {
        query = query.eq('check_type', filters.checkType);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Discard if a newer fetch has started
      if (fetchGenRef.current !== gen) return;

      let results = data || [];

      // Client-side filters
      if (filters.location) {
        results = results.filter(s => s.tugs?.location_id === filters.location);
      }
      if (filters.user) {
        const search = filters.user.toLowerCase();
        results = results.filter(s => {
          const name = `${s.profiles?.first_name || ''} ${s.profiles?.last_name || ''}`.toLowerCase();
          return name.includes(search);
        });
      }

      // Update By Tug cursor
      if (viewMode === 'byTug' && data && data.length > 0) {
        tugCursorRef.current = data[data.length - 1].created_at;
      }

      // Determine hasMore
      if (viewMode === 'byTug') {
        setHasMore((data || []).length >= TUG_PAGE_SIZE);
      } else {
        setHasMore((data || []).length > 0);
      }

      if (append) {
        setSubmissions(prev => [...prev, ...results]);
      } else {
        setSubmissions(results);
      }
    } catch (err) {
      console.error('[PreCheckList] Fetch error:', err);
    } finally {
      if (fetchGenRef.current === gen) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [viewMode, timeRange, selectedTug, filters]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    fetchData(true);
  }, [fetchData, loadingMore, hasMore, loading]);

  // ─── Update damage status (optimistic + targeted refetch) ───
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

      // Optimistic update
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

      // Targeted refetch for resolved_profile data
      const { data: freshDamages } = await supabase
        .from('precheck_damages')
        .select('*, resolved_profile:resolved_by(first_name, last_name)')
        .eq('submission_id', submissionId);

      setSubmissions(prev => prev.map(sub => {
        if (sub.id !== submissionId) return sub;
        return { ...sub, precheck_damages: freshDamages || sub.precheck_damages };
      }));
    } catch (err) {
      console.error('[PreCheckList] Update damage error:', err);
    }
  };

  // ─── Mode switching ───
  const switchToByDate = () => {
    if (viewMode === 'byDate') return;
    setViewMode('byDate');
    setSubmissions([]);
    setSelectedTug('');
    setTimeRange('24h');
  };

  const switchToByTug = () => {
    if (viewMode === 'byTug') return;
    setViewMode('byTug');
    setSubmissions([]);
    setFilters(prev => ({ ...prev, tug: '' }));
  };

  // ─── Effects ───
  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);
  useEffect(() => { fetchData(false); }, [fetchData]);

  // ─── Intersection Observer for infinite scroll ───
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!hasMore || loading || loadingMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // ─── Grouping (By Date only) ───
  const grouped = useMemo(() => {
    if (viewMode === 'byTug') return null;

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
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [submissions, viewMode]);

  // ─── Build fault cards for a submission ───
  const getFaults = (sub) => {
    const damages = sub.precheck_damages || [];
    const items = sub.precheck_items || [];
    const remarksText = sub.remarks || '';

    const faults = damages.map(damage => {
      const linkedItem = damage.item_id
        ? items.find(i => i.id === damage.item_id)
        : null;

      let header;
      if (linkedItem) {
        header = linkedItem.item_name.replace(/_/g, ' ');
      } else if (damage.location_on_tug) {
        header = damage.location_on_tug;
      } else if (damage.description === remarksText || damage.description === 'Additional photos') {
        header = sub.check_type === 'during_shift' ? 'Damage Report' : 'Remarks';
      } else {
        const match = damage.description?.match(/^(.+?)\s*-\s*repair needed$/i);
        header = match ? match[1] : 'Damage Report';
      }

      return {
        id: damage.id,
        header,
        description: damage.description,
        imageUrls: damage.image_urls || [],
        repairStatus: damage.repair_status,
        resolvedAt: damage.resolved_at,
        resolvedProfile: damage.resolved_profile,
      };
    });

    // Legacy: remarks without matching damage
    if (remarksText && !damages.some(d => d.description === remarksText || d.description === 'Additional photos')) {
      faults.push({
        id: `remarks-${sub.id}`,
        header: sub.check_type === 'during_shift' ? 'Damage Report' : 'Remarks',
        description: remarksText,
        imageUrls: [],
        repairStatus: null,
        resolvedAt: null,
        resolvedProfile: null,
      });
    }

    return faults;
  };

  // ─── Render a submission card ───
  const renderSubmissionCard = (sub) => {
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
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            hasOpen ? 'bg-red-500' : hasFaults ? 'bg-orange-500' : 'bg-green-500'
          }`} />

          {viewMode === 'byDate' && (
            <span className="font-semibold text-charcoal text-sm">
              {sub.tugs?.display_name || sub.tugs?.tug_number}
            </span>
          )}
          {viewMode === 'byTug' && (
            <span className="font-semibold text-charcoal text-sm">
              {new Date(sub.check_date + 'T12:00:00').toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
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
            <>
              <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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
              {/* Show count of OK items */}
              {(() => {
                const allItems = sub.precheck_items || [];
                const okCount = allItems.filter(i => i.status === 'ok').length;
                if (okCount === 0) return null;
                return (
                  <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-100 text-xs text-green-600 font-medium">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {okCount} other check{okCount !== 1 ? 's' : ''} passed
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-green-600 font-medium py-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              All checks passed
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Render ───
  return (
    <div className="space-y-4">
      {/* ─── Single toolbar line ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Toggle pills */}
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={switchToByDate}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'byDate'
                ? 'bg-charcoal text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            By Date
          </button>
          <button
            type="button"
            onClick={switchToByTug}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'byTug'
                ? 'bg-charcoal text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            By Tug
          </button>
        </div>

        <span className="w-px h-5 bg-gray-200" />

        {/* Mode-specific primary control */}
        {viewMode === 'byDate' ? (
          <div className="flex items-center gap-1">
            {Object.entries(TIME_RANGES).map(([key, { label }]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTimeRange(key)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-all ${
                  timeRange === key
                    ? 'bg-charcoal text-white'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <select
            value={selectedTug}
            onChange={(e) => setSelectedTug(e.target.value)}
            className={`border rounded-lg px-2 py-1 text-xs font-medium ${
              selectedTug ? 'border-charcoal text-charcoal' : 'border-gray-300 text-gray-400'
            }`}
          >
            <option value="">Select tug...</option>
            {tugs.map(t => (
              <option key={t.id} value={t.id}>{t.display_name ? `${t.display_name} (${t.tug_number})` : t.tug_number}</option>
            ))}
          </select>
        )}

        <span className="w-px h-5 bg-gray-200" />

        {/* Inline filters */}
        <select
          value={filters.location}
          onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600"
        >
          <option value="">All locations</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>

        {viewMode === 'byDate' && (
          <select
            value={filters.tug}
            onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600"
          >
            <option value="">All tugs</option>
            {tugs.map(t => (
              <option key={t.id} value={t.id}>{t.display_name ? `${t.display_name} (${t.tug_number})` : t.tug_number}</option>
            ))}
          </select>
        )}

        <select
          value={filters.checkType}
          onChange={(e) => setFilters(prev => ({ ...prev, checkType: e.target.value }))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600"
        >
          <option value="">All types</option>
          <option value="pre_shift">Pre-Shift</option>
          <option value="during_shift">During Shift</option>
        </select>

        <input
          type="text"
          value={filters.user}
          onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
          placeholder="Search user..."
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 w-24"
        />
      </div>

      {/* ─── Results ─── */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
        </div>
      ) : viewMode === 'byTug' && !selectedTug ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="font-medium">Select a tug to view its history</p>
          <p className="text-sm mt-1">Use the dropdown above to pick a tug.</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No PreCheck reports found</p>
          <p className="text-sm mt-1">Try adjusting your filters or time range.</p>
        </div>
      ) : viewMode === 'byDate' && grouped ? (
        /* ─── By Date: grouped view ─── */
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-gray-200">
                <h3 className="text-sm font-bold text-charcoal">{group.label}</h3>
                <span className="text-xs text-gray-400 ml-auto">
                  {group.items.length} check{group.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {group.items.map(sub => renderSubmissionCard(sub))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── By Tug: flat list ─── */
        <div className="space-y-3">
          {submissions.map(sub => renderSubmissionCard(sub))}
        </div>
      )}

      {/* ─── Infinite scroll sentinel + spinner ─── */}
      {!loading && submissions.length > 0 && (
        <>
          {loadingMore && (
            <div className="flex items-center justify-center py-4 gap-2 text-gray-400">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs">Loading more...</span>
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
          {!hasMore && submissions.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-3">
              All results loaded
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Fault sub-container (no severity badge) ───
function FaultCard({ fault, onStatusChange }) {
  const [openImage, setOpenImage] = useState(null);
  const resolvedByName = fault.resolvedProfile
    ? `${fault.resolvedProfile.first_name || ''} ${fault.resolvedProfile.last_name || ''}`.trim()
    : null;

  return (
    <div className={`rounded-lg border p-3 flex flex-col ${
      fault.repairStatus === 'resolved' ? 'border-green-200 bg-green-50'
        : fault.repairStatus === 'in_progress' ? 'border-yellow-200 bg-yellow-50'
        : fault.repairStatus === null ? 'border-gray-200 bg-gray-50'
        : 'border-red-200 bg-red-50'
    }`}>
      {/* Header: item name only */}
      <h5 className="text-sm font-semibold text-charcoal capitalize truncate mb-1">
        {fault.header}
      </h5>

      {/* Description */}
      <p className="text-xs text-gray-700 mb-2">{fault.description}</p>

      {/* Photos - grid 2 columns */}
      {fault.imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-1 mb-2">
          {fault.imageUrls.map((url, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setOpenImage(url)}
              className="rounded-md overflow-hidden border border-gray-200 cursor-pointer aspect-square block"
            >
              <img
                src={url}
                alt={`Photo ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Image lightbox overlay (portal to body to escape stacking contexts) */}
      {openImage && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center"
          onClick={() => setOpenImage(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpenImage(null); }}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={openImage}
            alt="Full size"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

      {/* Spacer to push status to bottom */}
      <div className="flex-1" />

      {/* Status action (only for real damage records) */}
      {fault.repairStatus !== null && (
        <select
          value={fault.repairStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className={`w-full text-xs font-medium rounded-lg px-2.5 py-1.5 border cursor-pointer ${
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

      {/* Resolved info - below action button */}
      {fault.resolvedAt && resolvedByName && (
        <p className="text-[10px] text-green-700 mt-1.5">
          Resolved by {resolvedByName} on {new Date(fault.resolvedAt).toLocaleDateString('en-GB')}
        </p>
      )}
    </div>
  );
}
