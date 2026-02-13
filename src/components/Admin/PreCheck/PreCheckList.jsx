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

export default function PreCheckList() {
  const { user } = useAuth();

  // ─── Core state ───
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ─── Shared secondary filters ───
  const [filters, setFilters] = useState({
    search: '',
    tug: '',
    checkType: '',
  });
  const [tugs, setTugs] = useState([]);

  // ─── Expand/collapse (one card open at a time) ───
  const [expandedCardId, setExpandedCardId] = useState(null);

  // ─── Pagination cursors (refs to avoid stale closures) ───
  const windowEndRef = useRef(new Date().toISOString());
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
    const { data, error } = await supabase.from('tugs').select('id, tug_number, display_name').order('tug_number');
    if (!error) setTugs(data || []);
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

      const rangeDuration = TIME_RANGES['7d'].ms;
      const rangeEnd = new Date(windowEndRef.current);
      const rangeStart = new Date(rangeEnd.getTime() - rangeDuration);

      query = query
        .gte('check_time', rangeStart.toISOString())
        .lt('check_time', rangeEnd.toISOString());

      if (filters.tug) {
        query = query.eq('tug_id', filters.tug);
      }

      windowEndRef.current = rangeStart.toISOString();

      // Shared server-side filter
      if (filters.checkType) {
        query = query.eq('check_type', filters.checkType);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Discard if a newer fetch has started
      if (fetchGenRef.current !== gen) return;

      let results = data || [];

      // Client-side search: tug name/number/id, user name, date
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        results = results.filter(s => {
          const displayName = (s.tugs?.display_name || '').toLowerCase();
          const tugNumber = (s.tugs?.tug_number || '').toLowerCase();
          const tugId = (s.tug_id || '').toLowerCase();
          const userName = `${s.profiles?.first_name || ''} ${s.profiles?.last_name || ''}`.trim().toLowerCase();
          const checkDate = s.check_date || '';
          const dateFormatted = checkDate
            ? new Date(checkDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase()
            : '';
          return (
            displayName.includes(q) ||
            tugNumber.includes(q) ||
            tugId.includes(q) ||
            userName.includes(q) ||
            checkDate.includes(q) ||
            dateFormatted.includes(q)
          );
        });
      }

      setHasMore((data || []).length > 0);

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
  }, [filters]);

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

  // ─── Grouping by date ───
  const grouped = useMemo(() => {
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
  }, [submissions]);

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

  // ─── Format item name for display ───
  const formatItemName = (name) => (name || '').replace(/_/g, ' ');

  // ─── Get defect description for an item (notes or linked damage) ───
  const getItemDefectDescription = (item, sub) => {
    if (item.notes?.trim()) return item.notes.trim();
    const damage = (sub.precheck_damages || []).find(d => d.item_id === item.id);
    return damage?.description?.trim() || '';
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
    const isExpanded = expandedCardId === sub.id;

    const hasDefect = hasOpen || hasFaults;

    return (
      <div
        key={sub.id}
        className={`rounded-xl border overflow-hidden shadow-sm transition-shadow ${
          hasDefect ? 'border-red-200' : 'border-green-200'
        } ${isExpanded ? 'shadow-md' : ''}`}
      >
        {/* Card header – mobile: 2 lines; desktop: single line */}
        <button
          type="button"
          onClick={() => setExpandedCardId(prev => prev === sub.id ? null : sub.id)}
          className={`w-full px-4 py-2.5 min-h-[4rem] md:min-h-0 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 items-center text-left cursor-pointer md:flex md:flex-row md:flex-nowrap md:gap-2 ${
            hasDefect ? 'bg-red-50' : 'bg-green-50'
          } hover:opacity-95 transition-opacity`}
        >
          {/* Dot + tug/date + damage */}
          <div className="flex items-center gap-2 min-w-0 md:order-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              hasDefect ? 'bg-red-500' : 'bg-green-500'
            }`} />
            <span className="font-semibold text-charcoal text-sm truncate">
              {sub.tugs?.display_name || sub.tugs?.tug_number}
              {sub.tugs?.display_name && sub.tugs?.tug_number && (
                <span className="text-gray-400 font-normal"> ({sub.tugs.tug_number})</span>
              )}
              {hasFaults && (
                <span className="text-red-600 font-medium">
                  {' · '}{faults.length} damage{faults.length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>
          {/* Badge + chevron */}
          <div className="flex items-center gap-1.5 flex-shrink-0 md:order-4">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              sub.check_type === 'pre_shift'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-orange-100 text-orange-700'
            }`}>
              {sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {/* by User · time – row 2 on mobile, inline on desktop */}
          <span className="text-xs text-gray-500 truncate col-span-1 md:order-2 md:col-span-auto">
            by <span className="font-semibold text-charcoal">{userName}</span>
            {' · '}
            {new Date(sub.check_time || sub.created_at).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {/* Spacer for desktop single line – pushes badge+chevron to the right */}
          <span className="hidden md:inline-block md:flex-1 md:order-3" aria-hidden />
        </button>

        {/* Card body – only when expanded */}
        {isExpanded && (
          <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
            {/* Remarks from precheck form – above all check items (cards with photo + standalone text) */}
            {(() => {
              const remarksWithImage = faults.filter(
                f => (f.header === 'Remarks' || f.header === 'Damage Report') && (f.imageUrls?.length || 0) > 0
              );
              const hasStandaloneRemarks = sub.remarks?.trim() && !faults.some(f => f.description === sub.remarks?.trim());
              if (remarksWithImage.length === 0 && !hasStandaloneRemarks) return null;
              return (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Remarks</h4>
                  {remarksWithImage.length > 0 && (
                    <div className="grid gap-3 items-stretch mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                      {remarksWithImage.map(fault => (
                        <FaultCard
                          key={fault.id}
                          fault={fault}
                          onStatusChange={(newStatus) =>
                            updateDamageStatus(fault.id, newStatus, sub.id)
                          }
                        />
                      ))}
                    </div>
                  )}
                  {hasStandaloneRemarks && (
                    <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">{sub.remarks}</p>
                  )}
                </div>
              );
            })()}

            {/* Check items – full list (OK / N/A / Defect) */}
            {(sub.precheck_items?.length > 0) && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Check items</h4>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(sub.precheck_items || []).map(item => {
                    const label = formatItemName(item.item_name);
                    const isOk = item.status === 'ok';
                    const isNa = item.status === 'na';
                    const isDefect = item.status === 'repair_needed' || item.status === 'completed';
                    const defectDesc = getItemDefectDescription(item, sub);
                    const itemDamages = (sub.precheck_damages || []).filter(d => d.item_id === item.id);
                    const itemImageUrls = itemDamages.flatMap(d => Array.isArray(d.image_urls) ? d.image_urls : []);

                    const defectHasImages = isDefect && itemImageUrls.length > 0;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-2 py-1.5 px-2 rounded-lg bg-white border border-gray-100 text-sm ${
                          defectHasImages ? 'flex-col sm:min-h-[220px]' : ''
                        }`}
                      >
                        {isOk && (
                          <span className="flex items-center gap-1.5 text-green-700 flex-1 min-w-0">
                            <svg className="w-4 h-4 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="capitalize truncate">{label}</span>
                            <span className="text-green-600 font-medium flex-shrink-0">OK</span>
                          </span>
                        )}
                        {isNa && (
                          <span className="flex items-center gap-1.5 text-slate-500 flex-1 min-w-0">
                            <span className="w-4 h-4 flex-shrink-0 rounded border border-slate-300 flex items-center justify-center text-[10px] font-medium">—</span>
                            <span className="capitalize truncate">{label}</span>
                            <span className="text-slate-400 flex-shrink-0">N/A</span>
                          </span>
                        )}
                        {isDefect && (
                          <>
                            <span className="flex items-start gap-1.5 text-red-700 flex-1 min-w-0 flex-shrink-0">
                              <svg className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="min-w-0">
                                <span className="capitalize font-medium">Defect</span>
                                <span className="text-charcoal font-normal"> – {label}</span>
                                {defectDesc && <span className="block text-gray-600 text-xs mt-0.5">{defectDesc}</span>}
                              </span>
                            </span>
                            {itemImageUrls.length > 0 && (
                              <div className="w-full mt-2 pt-2 border-t border-gray-100 flex-shrink-0">
                                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                                  {itemImageUrls.map((url, idx) => (
                                    <a
                                      key={idx}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block rounded-md overflow-hidden border border-gray-200 aspect-square sm:aspect-[4/3] bg-gray-50"
                                    >
                                      <img
                                        src={url}
                                        alt={`${label} ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summary: passed / N/A (defects are shown on item cards; remarks with photo at top) */}
            {(() => {
              const allItems = sub.precheck_items || [];
              const okCount = allItems.filter(i => i.status === 'ok').length;
              const naCount = allItems.filter(i => i.status === 'na').length;
              if (okCount === 0 && naCount === 0 && hasFaults) return null;
              if (okCount === 0 && naCount === 0) {
                return (
                  <div className="flex items-center gap-2 text-sm text-green-600 font-medium py-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    All checks passed
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-3 pt-2.5 border-t border-gray-200 text-xs font-medium">
                  {okCount > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {okCount} passed
                    </span>
                  )}
                  {naCount > 0 && (
                    <span className="text-slate-400">{naCount} N/A</span>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───
  return (
    <div className="space-y-4">
      {/* ─── Search + filters: one line on desktop, stacked on mobile ─── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2 md:flex-nowrap">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          placeholder="Search by tug name, number, user name, date..."
          className="w-full md:flex-1 md:min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 px-4 md:px-3 text-sm md:text-xs font-medium text-charcoal bg-white shadow-sm placeholder:text-gray-400"
          aria-label="Search"
        />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <select
            value={filters.tug}
            onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
            className="w-full min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 pl-3 pr-8 text-sm md:text-xs font-medium text-charcoal bg-white md:w-auto md:flex-shrink-0 md:min-w-[8rem] appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.5rem_center]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
            aria-label="Filter by tug"
          >
            <option value="">All tugs</option>
            {tugs.map(t => (
              <option key={t.id} value={t.id}>{t.display_name ? `${t.display_name} (${t.tug_number})` : t.tug_number}</option>
            ))}
          </select>
          <select
            value={filters.checkType}
            onChange={(e) => setFilters(prev => ({ ...prev, checkType: e.target.value }))}
            className="w-full min-w-0 border border-gray-200 rounded-xl md:rounded-lg py-2.5 md:py-1.5 pl-3 pr-8 text-sm md:text-xs font-medium text-charcoal bg-white md:w-auto md:flex-shrink-0 appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.5rem_center]"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")" }}
            aria-label="Type"
          >
            <option value="">All types</option>
            <option value="pre_shift">Pre-Shift</option>
            <option value="during_shift">During Shift</option>
          </select>
        </div>
      </div>

      {/* ─── Results ─── */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No PreCheck reports found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : grouped.length > 0 ? (
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
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const resolvedByName = fault.resolvedProfile
    ? `${fault.resolvedProfile.first_name || ''} ${fault.resolvedProfile.last_name || ''}`.trim()
    : null;

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  return (
    <div className={`rounded-lg border p-3 flex flex-col ${
      fault.repairStatus === 'resolved' ? 'border-green-200 bg-green-50'
        : fault.repairStatus === 'in_progress' ? 'border-yellow-200 bg-yellow-50'
        : fault.repairStatus === null ? 'border-gray-200 bg-gray-50'
        : 'border-red-200 bg-red-50'
    }`}>
      {/* Header: item name + status action */}
      <div className="flex items-center gap-2 mb-1">
        <h5 className="text-sm font-semibold text-charcoal capitalize truncate">
          {fault.header}
        </h5>

        {fault.repairStatus !== null && (
          <div className="relative ml-auto flex-shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(prev => !prev)}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${
                fault.repairStatus === 'resolved' ? 'bg-green-400'
                  : fault.repairStatus === 'in_progress' ? 'bg-yellow-400'
                  : 'bg-red-400'
              }`} />
              <span>{fault.repairStatus === 'open' ? 'Open' : fault.repairStatus === 'in_progress' ? 'In Progress' : 'Resolved'}</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[120px]">
                {[
                  { value: 'open', label: 'Open', dot: 'bg-red-400' },
                  { value: 'in_progress', label: 'In Progress', dot: 'bg-yellow-400' },
                  { value: 'resolved', label: 'Resolved', dot: 'bg-green-400' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onStatusChange(opt.value); setShowMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                      fault.repairStatus === opt.value ? 'font-medium text-charcoal' : 'text-gray-500'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Resolved info */}
      {fault.resolvedAt && resolvedByName && (
        <p className="text-[10px] text-green-700 mt-1">
          Resolved by {resolvedByName} on {new Date(fault.resolvedAt).toLocaleDateString('en-GB')}
        </p>
      )}
    </div>
  );
}
