import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';

export default function TugCheckHistory({ tugId }) {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!tugId) return;
    fetchChecks();
  }, [tugId]);

  const fetchChecks = async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('precheck_submissions')
        .select(`
          id,
          check_time,
          created_at,
          check_type,
          profiles:user_id(first_name, last_name)
        `)
        .eq('tug_id', tugId)
        .gte('check_time', thirtyDaysAgo.toISOString())
        .order('check_time', { ascending: false });

      if (error) throw error;
      setChecks(data || []);
    } catch (err) {
      console.error('[TugCheckHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value) => {
    const date = new Date(value);
    return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
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

  if (checks.length === 0) {
    return (
      <div className="text-center py-3 text-gray-400 text-xs">
        No checks in the last 30 days
      </div>
    );
  }

  const displayedChecks = showAll ? checks : checks.slice(0, 5);

  return (
    <div>
      <div className="space-y-2">
        {displayedChecks.map((check) => {
          const profile = check.profiles;
          const checkerName = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : '';
          const name = checkerName || 'Unknown user';
          const time = formatDate(check.check_time || check.created_at);
          const isPreShift = check.check_type === 'pre_shift';

          return (
            <div
              key={check.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-charcoal truncate">{name}</p>
                <p className="text-[11px] text-slate-500">{time}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                isPreShift
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {isPreShift ? 'Pre-Shift' : 'During Shift'}
              </span>
            </div>
          );
        })}
      </div>

      {checks.length > 5 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full py-2 mt-2 text-xs text-slate-500 hover:text-charcoal transition-colors"
        >
          Show all {checks.length} entries
        </button>
      )}
    </div>
  );
}

TugCheckHistory.propTypes = {
  tugId: PropTypes.string,
};
