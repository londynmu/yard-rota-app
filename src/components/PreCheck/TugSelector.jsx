import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PropTypes from 'prop-types';
import TugDamageHistory from './TugDamageHistory';

export default function TugSelector({ selectedTug, onSelect, onStartCheck, userLocationId, checkedTugIds = [] }) {
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
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
      // Scroll the card into view after expanding
      setTimeout(() => {
        tugRefs.current[tug.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [expandedTug, onSelect]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-slate-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (tugs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17h6M9 13h6M12 21a9 9 0 100-18 9 9 0 000 18z" />
        </svg>
        <p className="font-medium">No tugs available</p>
        <p className="text-sm mt-1">Contact your administrator to add tugs.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Location filter or spacer */}
      
      {/* Location filter */}
      {userLocationId && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFilter('my-location')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === 'my-location'
                ? 'bg-charcoal text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            My Location
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-charcoal text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Locations
          </button>
        </div>
      )}

      {/* Tug list (accordion) */}
      <div className="space-y-2">
        {filteredTugs.map(tug => {
          const isExpanded = expandedTug === tug.id;
          const displayName = tug.display_name || tug.tug_number;

          return (
            <div
              key={tug.id}
              ref={(el) => { tugRefs.current[tug.id] = el; }}
              className={`rounded-xl overflow-hidden transition-all ${
                isExpanded
                  ? 'shadow-md ring-1 ring-amber-300'
                  : 'hover:shadow-sm'
              }`}
            >
              {/* Header row */}
              <div className={`flex items-center ${
                isExpanded
                  ? 'bg-amber-50 border-b border-amber-200'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60'
              } rounded-t-xl ${!isExpanded ? 'rounded-b-xl' : ''}`}>
                <button
                  type="button"
                  onClick={() => handleTugClick(tug)}
                  className="flex-1 px-4 py-3 text-left flex items-center gap-2"
                >
                  <span className="text-base font-bold text-charcoal">{displayName}</span>
                  <span className="text-xs text-amber-700/50">{tug.tug_number}</span>
                  <svg
                    className={`w-4 h-4 ml-auto text-amber-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <button
                    type="button"
                    onClick={() => onStartCheck(tug)}
                    className="mr-3 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 active:scale-[0.97] transition-all flex-shrink-0"
                  >
                    Start Check
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="bg-white border-x border-b border-amber-200/60 rounded-b-xl px-4 py-3 space-y-3">
                  {/* Tug details */}
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>Number: <strong className="text-charcoal">{tug.tug_number}</strong></span>
                    {tug.locations && (
                      <span>Location: <strong className="text-charcoal">{tug.locations.name}</strong></span>
                    )}
                  </div>

                  {/* Damage history */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent Defects (30 days)</p>
                    <TugDamageHistory tugId={tug.id} />
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
