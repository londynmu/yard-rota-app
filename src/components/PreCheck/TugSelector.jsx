import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PropTypes from 'prop-types';
import TugDamageHistory from './TugDamageHistory';

export default function TugSelector({ selectedTug, onSelect, onStartCheck, userLocationId }) {
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

  const filteredTugs = filter === 'my-location' && userLocationId
    ? tugs.filter(t => t.location_id === userLocationId)
    : tugs;

  const handleTugClick = (tug) => {
    if (expandedTug === tug.id) {
      // Collapse if already expanded
      setExpandedTug(null);
      onSelect(null);
    } else {
      setExpandedTug(tug.id);
      onSelect(tug);
    }
  };

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
          const name = tug.display_name || tug.tug_number;

          return (
            <div
              key={tug.id}
              className={`rounded-xl overflow-hidden transition-all ${
                isExpanded
                  ? 'bg-slate-50 border border-slate-200 shadow-md'
                  : 'bg-white border border-gray-200 hover:border-slate-300'
              }`}
            >
              {/* Header row */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleTugClick(tug)}
                  className="flex-1 px-4 py-3.5 text-left flex items-center"
                >
                  <span className="text-base font-bold text-charcoal">{name}</span>
                  <svg
                    className={`w-4 h-4 ml-auto text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <button
                    type="button"
                    onClick={() => onStartCheck(tug)}
                    className="mr-3 px-4 py-2 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.97] transition-all flex-shrink-0"
                  >
                    Start Check
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-slate-200 px-4 py-3 space-y-3">
                  {/* Tug details */}
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>Number: <strong className="text-charcoal">{tug.tug_number}</strong></span>
                    {tug.locations && (
                      <span>Location: <strong className="text-charcoal">{tug.locations.name}</strong></span>
                    )}
                  </div>

                  {/* Damage history */}
                  <TugDamageHistory tugId={tug.id} />
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
};
