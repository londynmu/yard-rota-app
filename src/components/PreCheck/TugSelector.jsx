import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PropTypes from 'prop-types';

export default function TugSelector({ selectedTug, onSelect, userLocationId }) {
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' or 'my-location'

  useEffect(() => {
    fetchTugs();
  }, []);

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

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-10 bg-slate-200 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-slate-200 rounded-lg" />
          ))}
        </div>
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

      {/* Tug grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filteredTugs.map(tug => (
          <button
            key={tug.id}
            type="button"
            onClick={() => onSelect(tug)}
            className={`relative p-4 rounded-xl border-2 text-left transition-all ${
              selectedTug?.id === tug.id
                ? 'border-charcoal bg-charcoal text-white shadow-lg scale-[1.02]'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
            }`}
          >
            <div className={`text-lg font-bold ${selectedTug?.id === tug.id ? 'text-white' : 'text-charcoal'}`}>
              {tug.tug_number}
            </div>
            {tug.locations && (
              <div className={`text-xs mt-1 ${selectedTug?.id === tug.id ? 'text-gray-300' : 'text-gray-500'}`}>
                {tug.locations.name}
              </div>
            )}
            {selectedTug?.id === tug.id && (
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

TugSelector.propTypes = {
  selectedTug: PropTypes.object,
  onSelect: PropTypes.func.isRequired,
  userLocationId: PropTypes.string,
};
