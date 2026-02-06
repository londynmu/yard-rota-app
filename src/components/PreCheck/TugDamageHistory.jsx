import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PropTypes from 'prop-types';

export default function TugDamageHistory({ tugId }) {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!tugId) return;
    fetchDamages();
  }, [tugId]);

  const fetchDamages = async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('precheck_damages')
        .select(`
          *,
          precheck_submissions!inner(
            user_id,
            tug_id,
            check_date,
            profiles:user_id(first_name, last_name)
          )
        `)
        .eq('precheck_submissions.tug_id', tugId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDamages(data || []);
    } catch (err) {
      console.error('[TugDamageHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-1">
        {[1, 2].map(i => (
          <div key={i} className="h-8 bg-slate-200 rounded" />
        ))}
      </div>
    );
  }

  if (damages.length === 0) {
    return (
      <div className="text-center py-3 text-gray-400 text-xs">
        No damages reported in the last 30 days
      </div>
    );
  }

  const displayDamages = showAll ? damages : damages.slice(0, 5);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div>
      <div className="space-y-1">
        {displayDamages.map(damage => {
          const profile = damage.precheck_submissions?.profiles;
          const reporterName = profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : 'Unknown';
          const isOpen = expanded === damage.id;

          return (
            <div key={damage.id} className={`rounded-lg overflow-hidden transition-all ${isOpen ? 'bg-white border border-slate-200 mb-2' : ''}`}>
              {/* Compact row */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : damage.id)}
                className={`w-full text-left px-2 py-2 flex items-center gap-2 transition-colors ${
                  isOpen ? 'bg-slate-50' : 'rounded-lg hover:bg-slate-100'
                }`}
              >
                <span className="text-xs text-slate-400 w-28 flex-shrink-0">
                  {formatDate(damage.created_at)}
                </span>
                <span className="text-xs text-slate-600 flex-1 truncate">
                  {reporterName}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  damage.repair_status === 'resolved' ? 'bg-green-400'
                    : damage.repair_status === 'in_progress' ? 'bg-yellow-400'
                    : 'bg-red-400'
                }`} />
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded: photo full width + details below */}
              {isOpen && (
                <div>
                  {damage.image_urls && damage.image_urls.length > 0 && (
                    <div className="space-y-1">
                      {damage.image_urls.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={url} alt="" className="w-full object-contain max-h-72 bg-slate-100" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="px-3 py-2.5 border-t border-slate-100">
                    <p className="text-sm text-charcoal">{damage.description}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {damages.length > 5 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full py-1.5 text-xs text-slate-500 hover:text-charcoal transition-colors"
        >
          Show all {damages.length} entries
        </button>
      )}
    </div>
  );
}

TugDamageHistory.propTypes = {
  tugId: PropTypes.string,
};
