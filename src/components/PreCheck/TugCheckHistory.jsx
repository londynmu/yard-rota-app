import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';

export default function TugCheckHistory({ tugId }) {
  const [checks, setChecks] = useState([]);
  const [checkItemLabels, setCheckItemLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState(null);

  useEffect(() => {
    if (!tugId) return;
    fetchChecks();
  }, [tugId]);

  const fetchChecks = async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [checksRes, checkItemsRes] = await Promise.all([
        supabase
          .from('precheck_submissions')
          .select(`
            id,
            check_time,
            created_at,
            check_type,
            profiles:user_id(first_name, last_name),
            precheck_items(id, status, item_name, notes),
            precheck_damages(id, item_id, description, image_urls, source)
          `)
          .eq('tug_id', tugId)
          .gte('check_time', thirtyDaysAgo.toISOString())
          .order('check_time', { ascending: false }),
        supabase.from('precheck_check_items').select('item_key, label').eq('is_active', true),
      ]);

      if (checksRes.error) throw checksRes.error;
      setChecks(checksRes.data || []);
      if (!checkItemsRes.error) {
        const map = {};
        (checkItemsRes.data || []).forEach((item) => { map[item.item_key] = item.label; });
        setCheckItemLabels(map);
      }
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

  const formatItemName = (itemName) => (
    (itemName || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );

  const getUniqueDamages = (damages = []) => {
    const seen = new Set();

    return damages.filter((damage) => {
      const key = [
        (damage.item_id || '').trim().toLowerCase(),
        (damage.description || '').trim().toLowerCase(),
        (damage.image_urls || []).join('|').trim().toLowerCase(),
      ].join('|');

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getMergedProblems = (check) => {
    const repairItems = (check.precheck_items || []).filter((item) => item.status === 'repair_needed');
    const uniqueDamages = getUniqueDamages(check.precheck_damages || []);
    const usedDamageIds = new Set();

    const normalizeText = (value) => (value || '').trim().toLowerCase();

    const findDamageForItem = (item) => {
      const byItemId = uniqueDamages.find(
        (damage) => !usedDamageIds.has(damage.id) && damage.item_id === item.id
      );
      if (byItemId) return byItemId;

      const note = normalizeText(item.notes);
      if (!note) return null;

      return uniqueDamages.find((damage) => (
        !usedDamageIds.has(damage.id) &&
        normalizeText(damage.description) === note
      )) || null;
    };

    const problemsFromItems = repairItems.map((item) => {
      const match = findDamageForItem(item);
      if (match) usedDamageIds.add(match.id);

      return {
        key: `item-${item.id}`,
        itemName: checkItemLabels[item.item_name] ?? formatItemName(item.item_name),
        description: match?.description || item.notes || '',
        imageUrls: match?.image_urls || [],
      };
    });

    const unmatchedDamageProblems = uniqueDamages
      .filter((damage) => !usedDamageIds.has(damage.id) && (damage.source || 'check_item') !== 'remarks')
      .map((damage) => ({
        key: `damage-${damage.id}`,
        itemName: 'Damage report',
        description: damage.description || '',
        imageUrls: damage.image_urls || [],
      }));

    return [...problemsFromItems, ...unmatchedDamageProblems];
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
          const problems = getMergedProblems(check);
          const hasDefect = problems.length > 0;
          const isExpanded = expandedCheckId === check.id;
          const cardToneClass = hasDefect
            ? 'border-red-200 bg-red-50'
            : 'border-green-200 bg-green-50';

          return (
            <div
              key={check.id}
              className={`rounded-lg border overflow-hidden ${cardToneClass}`}
            >
              <button
                type="button"
                onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left relative"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-charcoal truncate">{name}</p>
                  <p className="text-[11px] text-slate-500">{time}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    isPreShift
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {isPreShift ? 'Pre-Shift' : 'During Shift'}
                  </span>
                </div>
                {hasDefect && (
                  <svg
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {isExpanded && hasDefect && (
                <div className="border-t border-slate-200 bg-white px-3 py-2 space-y-2">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Problems</p>
                    {problems.map((problem) => (
                      <div
                        key={problem.key}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5"
                      >
                        <p className="text-xs font-semibold text-emerald-900">{problem.itemName}</p>
                        {problem.description && (
                          <p className="text-[11px] text-slate-700 mt-0.5">{problem.description}</p>
                        )}
                        {problem.imageUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {problem.imageUrls.map((url, index) => (
                              <a
                                key={`${problem.key}-${index}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-14 h-14 rounded-md overflow-hidden border border-slate-200 bg-slate-100"
                              >
                                <img src={url} alt="" className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
