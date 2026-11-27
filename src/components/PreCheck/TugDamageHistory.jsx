import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { STATUS_CONFIG } from '../Admin/PreCheck/PreCheckList';
import PropTypes from 'prop-types';
import PrecheckSignedImage from './PrecheckSignedImage';

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
        .neq('source', 'remarks')
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
      <div className="animate-pulse space-y-1 motion-reduce:animate-none">
        {[1, 2].map(i => (
          <div key={i} className="h-8 rounded bg-slate-200" />
        ))}
      </div>
    );
  }

  if (damages.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-slate-500">
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
      <div className="space-y-2">
        {displayDamages.map(damage => {
          const profile = damage.precheck_submissions?.profiles;
          const reporterName = profile 
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : 'Unknown';
          const isOpen = expanded === damage.id;

          const sCfg = STATUS_CONFIG[damage.repair_status] || STATUS_CONFIG.open;
          const BORDER_LEFT_MAP = {
            open: 'border-l-red-400 bg-red-50',
            reported: 'border-l-orange-400 bg-orange-50',
            awaiting_parts: 'border-l-amber-400 bg-amber-50',
            in_progress: 'border-l-yellow-400 bg-yellow-50',
            acknowledged: 'border-l-slate-400 bg-slate-50',
            resolved: 'border-l-green-400 bg-green-50',
          };
          const statusColor = BORDER_LEFT_MAP[damage.repair_status] || BORDER_LEFT_MAP.open;
          const dotColor = sCfg.dot;

          return (
            <div
              key={damage.id}
              className={`overflow-hidden rounded-lg border border-slate-200 border-l-4 transition-all motion-reduce:transition-none ${statusColor}`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : damage.id)}
                aria-expanded={isOpen}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-charcoal">{reporterName}</span>
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                      Defect
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(damage.created_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{damage.description}</p>
                </div>
                <svg className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 bg-white">
                  {damage.image_urls && damage.image_urls.length > 0 && (
                    <div className="space-y-1 p-2">
                      {damage.image_urls.map((url, idx) => (
                        <PrecheckSignedImage
                          key={idx}
                          url={url}
                          asLink
                          className="block rounded-lg overflow-hidden"
                          imgClassName="w-full object-contain max-h-72 bg-slate-100"
                        />
                      ))}
                    </div>
                  )}
                  <div className="px-3 py-2">
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
          className="mt-2 min-h-11 w-full py-2 text-xs text-slate-500 transition-colors hover:text-charcoal motion-reduce:transition-none"
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
