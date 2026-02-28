import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';

export default function PreCheckHistory() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [checkItemLabels, setCheckItemLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [subRes, checkItemsRes] = await Promise.all([
        supabase
          .from('precheck_submissions')
          .select(`
            *,
            tugs(tug_number, locations(name)),
            precheck_items(*),
            precheck_damages(*)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase.from('precheck_check_items').select('item_key, label').eq('is_active', true),
      ]);

      if (subRes.error) throw subRes.error;
      setSubmissions(subRes.data || []);
      if (!checkItemsRes.error) {
        const map = {};
        (checkItemsRes.data || []).forEach((item) => { map[item.item_key] = item.label; });
        setCheckItemLabels(map);
      }
    } catch (err) {
      console.error('[PreCheckHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  const loadItems = async (submissionId) => {
    if (expandedItems[submissionId]) return;
    
    try {
      const { data, error } = await supabase
        .from('precheck_items')
        .select('*')
        .eq('submission_id', submissionId)
        .order('item_category', { ascending: true });

      if (error) throw error;
      setExpandedItems(prev => ({ ...prev, [submissionId]: data }));
    } catch (err) {
      console.error('[PreCheckHistory] Error loading items:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 animate-pulse space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-slate-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-charcoal">My PreCheck History</h1>
        <p className="text-sm text-gray-500 mt-1">Your last 30 tug inspections</p>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">No checks yet</p>
          <p className="text-sm mt-1">Your PreCheck history will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => {
            const repairItems = sub.precheck_items?.filter(i => i.status === 'repair_needed') || [];
            const realDamages = sub.precheck_damages?.filter(d => (d.source || 'check_item') !== 'remarks') || [];
            const damageCount = realDamages.length;
            const isExpanded = expanded === sub.id;

            return (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => { toggleExpand(sub.id); loadItems(sub.id); }}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      repairItems.length > 0 || damageCount > 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-green-100 text-green-600'
                    }`}>
                      {repairItems.length > 0 || damageCount > 0 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-charcoal text-sm">
                          {sub.tugs?.tug_number || 'Unknown Tug'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          sub.check_type === 'pre_shift'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        <span>{new Date(sub.check_date).toLocaleDateString('en-GB')}</span>
                        <span>{new Date(sub.check_time || sub.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        {sub.tugs?.locations?.name && <span>{sub.tugs.locations.name}</span>}
                      </div>
                    </div>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  {/* Summary badges */}
                  {(repairItems.length > 0 || damageCount > 0) && (
                    <div className="flex gap-2 mt-2">
                      {repairItems.length > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          {repairItems.length} repair{repairItems.length !== 1 ? 's' : ''} needed
                        </span>
                      )}
                      {damageCount > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          {damageCount} damage{damageCount !== 1 ? 's' : ''} reported
                        </span>
                      )}
                    </div>
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
                    {/* Items summary */}
                    {expandedItems[sub.id] && (
                      <div className="space-y-1">
                        {expandedItems[sub.id]
                          .filter(item => item.status === 'repair_needed')
                          .map(item => (
                            <div key={item.id} className="flex items-center gap-2 text-sm">
                              <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                              <span className="text-red-700 font-medium capitalize">
                                {checkItemLabels[item.item_name] ?? item.item_name.replace(/_/g, ' ')}
                              </span>
                              {item.notes && (
                                <span className="text-gray-500 text-xs">- {item.notes}</span>
                              )}
                            </div>
                          ))}
                        {expandedItems[sub.id].filter(item => item.status === 'repair_needed').length === 0 && (
                          <p className="text-sm text-green-600 font-medium">All items OK</p>
                        )}
                      </div>
                    )}

                    {/* Damages (exclude remarks — shown separately below) */}
                    {realDamages.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase">Damages</h4>
                        {realDamages.map(damage => (
                          <div key={damage.id} className="bg-white p-3 rounded-lg border border-red-200">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold uppercase text-red-600">{damage.severity}</span>
                              {damage.location_on_tug && (
                                <span className="text-xs text-gray-500">• {damage.location_on_tug}</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700">{damage.description}</p>
                            {damage.image_urls?.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {damage.image_urls.map((url, idx) => (
                                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Remarks */}
                    {sub.remarks && (() => {
                      const remarksDamage = sub.precheck_damages?.find(d => d.source === 'remarks' || (!d.source && !d.item_id && sub.check_type === 'pre_shift'));
                      const remarksImages = remarksDamage?.image_urls || [];
                      return (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Remarks</h4>
                          <p className="text-sm text-gray-700 bg-white p-2 rounded-lg border border-gray-200">{sub.remarks}</p>
                          {remarksImages.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {remarksImages.map((url, idx) => (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
