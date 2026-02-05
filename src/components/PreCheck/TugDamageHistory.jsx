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
      <div className="animate-pulse space-y-2">
        {[1, 2].map(i => (
          <div key={i} className="h-16 bg-slate-200 rounded-lg" />
        ))}
      </div>
    );
  }

  if (damages.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        <svg className="w-8 h-8 mx-auto mb-2 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        No damages reported in the last 30 days
      </div>
    );
  }

  const openDamages = damages.filter(d => d.repair_status !== 'resolved');
  const resolvedDamages = damages.filter(d => d.repair_status === 'resolved');
  const displayDamages = showAll ? damages : damages.slice(0, 5);

  const severityIcon = (severity) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'major': return '🟠';
      default: return '🟡';
    }
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'open':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Open</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-700 rounded-full">In Progress</span>;
      case 'resolved':
        return <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded-full">Resolved</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-charcoal">Damage History</h3>
        {openDamages.length > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
            {openDamages.length} open
          </span>
        )}
      </div>

      {/* Summary */}
      <div className="flex gap-3 text-xs">
        <span className="text-red-600 font-medium">{openDamages.length} open</span>
        <span className="text-gray-300">|</span>
        <span className="text-green-600 font-medium">{resolvedDamages.length} resolved</span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{damages.length} total (30 days)</span>
      </div>

      {/* Damage list */}
      <div className="space-y-2">
        {displayDamages.map(damage => {
          const profile = damage.precheck_submissions?.profiles;
          const reporterName = profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : 'Unknown';

          return (
            <div
              key={damage.id}
              className={`rounded-lg border-2 transition-all overflow-hidden ${
                damage.repair_status === 'resolved'
                  ? 'border-green-200 bg-green-50/50'
                  : damage.repair_status === 'in_progress'
                  ? 'border-yellow-200 bg-yellow-50/50'
                  : 'border-red-200 bg-red-50/50'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(expanded === damage.id ? null : damage.id)}
                className="w-full p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span>{severityIcon(damage.severity)}</span>
                  <span className="text-sm font-medium text-charcoal flex-1 truncate">
                    {damage.description}
                  </span>
                  {statusBadge(damage.repair_status)}
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === damage.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{new Date(damage.created_at).toLocaleDateString('en-GB')}</span>
                  <span>by {reporterName}</span>
                  {damage.location_on_tug && <span>• {damage.location_on_tug}</span>}
                </div>
              </button>

              {expanded === damage.id && (
                <div className="px-3 pb-3 border-t border-gray-200 pt-2">
                  <p className="text-sm text-gray-700 mb-2">{damage.description}</p>
                  
                  {damage.image_urls && damage.image_urls.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {damage.image_urls.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                          <img src={url} alt={`Damage ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 space-y-1">
                    <p><strong>Severity:</strong> <span className="capitalize">{damage.severity}</span></p>
                    {damage.location_on_tug && <p><strong>Location:</strong> {damage.location_on_tug}</p>}
                    {damage.resolved_at && (
                      <p><strong>Resolved:</strong> {new Date(damage.resolved_at).toLocaleDateString('en-GB')}</p>
                    )}
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
          className="w-full py-2 text-sm font-medium text-charcoal hover:text-black transition-colors"
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
