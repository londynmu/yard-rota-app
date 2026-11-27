import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PropTypes from 'prop-types';
import TugCheckHistory from './TugCheckHistory';

export default function TugSelector({ selectedTug, onSelect, onStartCheck, userLocationId, checkedTugIds = [] }) {
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter] = useState('all');
  const [expandedTug, setExpandedTug] = useState(null);

  useEffect(() => {
    fetchTugs();
  }, []);

  // Auto-expand if a tug is pre-selected (e.g. from QR)
  useEffect(() => {
    if (selectedTug) {
      setExpandedTug(selectedTug.id);
    }
  }, [selectedTug]);

  const fetchTugs = async () => {
    try {
      const { data, error } = await supabase
        .from('tugs')
        .select('*, locations(id, name)')
        .eq('status', 'active')
        .order('tug_number');

      if (error) throw error;
      setTugs(data || []);
    } catch (err) {
      console.error('[TugSelector] Error fetching tugs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTugs = (filter === 'my-location' && userLocationId
    ? tugs.filter(t => t.location_id === userLocationId)
    : tugs
  ).filter(t => !checkedTugIds.includes(t.id));

  const tugRefs = useRef({});

  const handleTugClick = useCallback((tug) => {
    if (expandedTug === tug.id) {
      setExpandedTug(null);
      onSelect(null);
    } else {
      setExpandedTug(tug.id);
      onSelect(tug);
      const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => {
        tugRefs.current[tug.id]?.scrollIntoView({
          behavior: reduceMotion ? 'auto' : 'smooth',
          block: 'nearest',
        });
      }, 100);
    }
  }, [expandedTug, onSelect]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 motion-reduce:animate-none">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-slate-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (tugs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <svg className="mx-auto mb-3 h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17h6M9 13h6M12 21a9 9 0 100-18 9 9 0 000 18z" />
        </svg>
        <p className="font-medium text-charcoal">No tugs available</p>
        <p className="mt-1 text-sm text-slate-500">
          Ask your administrator to add active tugs for this yard, then refresh.
        </p>
      </div>
    );
  }

  if (filteredTugs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center shadow-sm">
        <p className="font-medium text-charcoal">All listed tugs are already checked</p>
        <p className="mt-1 text-sm text-slate-500">
          Use Check Another Tug from today&apos;s list, or scan a QR code for a different tug.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {filteredTugs.map(tug => {
          const isExpanded = expandedTug === tug.id;
          const displayName = tug.display_name || tug.tug_number;
          const panelId = `tug-panel-${tug.id}`;

          return (
            <div
              key={tug.id}
              ref={(el) => { tugRefs.current[tug.id] = el; }}
              className={`overflow-hidden rounded-xl transition-shadow motion-reduce:transition-none ${
                isExpanded
                  ? 'shadow-md ring-1 ring-amber-300'
                  : 'hover:shadow-sm'
              }`}
            >
              <div className={`flex items-center ${
                isExpanded
                  ? 'border-b border-amber-200 bg-amber-50'
                  : 'rounded-t-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50'
              } ${!isExpanded ? 'rounded-b-xl' : 'rounded-t-xl'}`}>
                <button
                  type="button"
                  onClick={() => handleTugClick(tug)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className="relative flex min-h-11 flex-1 items-center justify-center gap-2 px-4 py-3"
                >
                  <span className="text-base font-bold text-charcoal">{displayName}</span>
                  {tug.display_name && (
                    <span className="text-xs text-charcoal">({tug.tug_number})</span>
                  )}
                  <svg
                    className={`absolute right-4 h-4 w-4 text-amber-400 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <button
                    type="button"
                    onClick={() => onStartCheck(tug)}
                    className="mr-3 inline-flex min-h-11 flex-shrink-0 items-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    Start Check
                  </button>
                )}
              </div>

              {isExpanded && (
                <div
                  id={panelId}
                  className="space-y-3 rounded-b-xl border-x border-b border-amber-200/60 bg-white px-4 py-3"
                >
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Check History (30 days)
                    </p>
                    <TugCheckHistory tugId={tug.id} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

TugSelector.propTypes = {
  selectedTug: PropTypes.object,
  onSelect: PropTypes.func.isRequired,
  onStartCheck: PropTypes.func.isRequired,
  userLocationId: PropTypes.string,
  checkedTugIds: PropTypes.array,
};
