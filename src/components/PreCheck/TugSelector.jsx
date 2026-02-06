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
      <label className="block text-sm font-semibold text-charcoal mb-3">Select Your Tug</label>
      
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
          const isSelected = selectedTug?.id === tug.id;

          return (
            <div
              key={tug.id}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                isExpanded
                  ? 'border-charcoal shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Tug row - clickable */}
              <button
                type="button"
                onClick={() => handleTugClick(tug)}
                className={`w-full p-4 flex items-center gap-3 text-left transition-colors ${
                  isExpanded ? 'bg-charcoal text-white' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-base font-bold ${isExpanded ? 'text-white' : 'text-charcoal'}`}>
                      {tug.display_name || tug.tug_number}
                    </span>
                    {tug.display_name && (
                      <span className={`text-xs ${isExpanded ? 'text-gray-300' : 'text-gray-400'}`}>
                        {tug.tug_number}
                      </span>
                    )}
                    {tug.locations && (
                      <>
                        <span className={`text-xs ${isExpanded ? 'text-gray-400' : 'text-gray-300'}`}>•</span>
                        <span className={`text-xs ${isExpanded ? 'text-gray-300' : 'text-gray-500'}`}>
                          {tug.locations.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-white' : 'text-gray-400'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="bg-white border-t border-gray-200">
                  {/* Start PreCheck button */}
                  <div className="p-4 pb-3">
                    <button
                      type="button"
                      onClick={() => onStartCheck(tug)}
                      className="w-full py-3.5 bg-charcoal text-white font-bold rounded-xl hover:bg-black active:scale-[0.98] transition-all shadow-md text-sm flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Start PreCheck for {tug.display_name || tug.tug_number}
                    </button>
                  </div>

                  {/* Damage history */}
                  <div className="px-4 pb-4">
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
};
