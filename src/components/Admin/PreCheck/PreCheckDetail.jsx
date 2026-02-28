import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../lib/AuthContext';
import PropTypes from 'prop-types';

export default function PreCheckDetail({ submissionId, onBack }) {
  const { user } = useAuth();
  const [submission, setSubmission] = useState(null);
  const [items, setItems] = useState([]);
  const [damages, setDamages] = useState([]);
  const [checkItemLabels, setCheckItemLabels] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDetail();
  }, [submissionId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const [subRes, itemsRes, damagesRes, checkItemsRes] = await Promise.all([
        supabase
          .from('precheck_submissions')
          .select('*, profiles:user_id(first_name, last_name), tugs(tug_number, locations(name))')
          .eq('id', submissionId)
          .single(),
        supabase
          .from('precheck_items')
          .select('*')
          .eq('submission_id', submissionId)
          .order('item_category'),
        supabase
          .from('precheck_damages')
          .select('*, resolved_profile:resolved_by(first_name, last_name)')
          .eq('submission_id', submissionId),
        supabase.from('precheck_check_items').select('item_key, label').eq('is_active', true),
      ]);

      if (subRes.error) throw subRes.error;
      setSubmission(subRes.data);
      setItems(itemsRes.data || []);
      setDamages(damagesRes.data || []);
      if (!checkItemsRes.error) {
        const map = {};
        (checkItemsRes.data || []).forEach((item) => { map[item.item_key] = item.label; });
        setCheckItemLabels(map);
      }
    } catch (err) {
      console.error('[PreCheckDetail] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateDamageStatus = async (damageId, newStatus) => {
    try {
      const updates = { repair_status: newStatus };
      if (newStatus === 'resolved') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user.id;
      } else {
        updates.resolved_at = null;
        updates.resolved_by = null;
      }

      const { error } = await supabase
        .from('precheck_damages')
        .update(updates)
        .eq('id', damageId);

      if (error) throw error;
      fetchDetail();
    } catch (err) {
      console.error('[PreCheckDetail] Update error:', err);
      alert('Error updating damage status.');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-40 bg-slate-200 rounded-xl" />
        <div className="h-60 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>Submission not found.</p>
        <button onClick={onBack} className="mt-4 text-charcoal underline">Go back</button>
      </div>
    );
  }

  const profile = submission.profiles;
  const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown';
  const performItems = items.filter(i => i.item_category === 'perform');
  const checkItems = items.filter(i => i.item_category === 'check');
  const repairItems = checkItems.filter(i => i.status === 'repair_needed');
  const realDamages = damages.filter(d => (d.source || 'check_item') !== 'remarks');
  const remarksDamage = damages.find(d => d.source === 'remarks' || (!d.source && !d.item_id && submission.check_type === 'pre_shift'));
  const remarksImages = remarksDamage?.image_urls || [];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to list
      </button>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-charcoal">
              {submission.tugs?.display_name || submission.tugs?.tug_number}
            </h2>
            {submission.tugs?.display_name && (
              <p className="text-sm text-gray-500">{submission.tugs.tug_number}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
              <span>{userName}</span>
              <span>•</span>
              <span>{new Date(submission.check_date).toLocaleDateString('en-GB')}</span>
              <span>•</span>
              <span>{new Date(submission.check_time || submission.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              {submission.tugs?.locations?.name && (
                <>
                  <span>•</span>
                  <span>{submission.tugs.locations.name}</span>
                </>
              )}
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            submission.check_type === 'pre_shift' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {submission.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
          </span>
        </div>
      </div>

      {/* Perform items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h3 className="font-semibold text-charcoal text-sm mb-3">Perform the Following</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {performItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-gray-700 capitalize">{checkItemLabels[item.item_name] ?? item.item_name.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Check items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm">Check Items</h3>
          {repairItems.length > 0 ? (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {repairItems.length} repair(s) needed
            </span>
          ) : (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">All OK</span>
          )}
        </div>
        <div className="space-y-1">
          {checkItems.map(item => (
            <div key={item.id} className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-sm ${
              item.status === 'repair_needed' ? 'bg-red-50' : ''
            }`}>
              <span className={`capitalize ${item.status === 'repair_needed' ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
                {checkItemLabels[item.item_name] ?? item.item_name.replace(/_/g, ' ')}
              </span>
              <div className="flex items-center gap-2">
                {item.notes && <span className="text-xs text-gray-500">{item.notes}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  item.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {item.status === 'ok' ? 'OK' : 'Repair'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Damages (excluding remarks — shown separately below) */}
      {realDamages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-charcoal text-sm mb-3">Damage Reports</h3>
          <div className="space-y-3">
            {realDamages.map(damage => {
              const resolvedBy = damage.resolved_profile
                ? `${damage.resolved_profile.first_name || ''} ${damage.resolved_profile.last_name || ''}`.trim()
                : null;

              return (
                <div key={damage.id} className={`p-4 rounded-lg border-2 ${
                  damage.repair_status === 'resolved' ? 'border-green-200 bg-green-50'
                    : damage.repair_status === 'in_progress' ? 'border-yellow-200 bg-yellow-50'
                    : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase ${
                          damage.severity === 'critical' ? 'text-red-700'
                            : damage.severity === 'major' ? 'text-orange-700'
                            : 'text-yellow-700'
                        }`}>{damage.severity}</span>
                        {damage.location_on_tug && (
                          <span className="text-xs text-gray-500">• {damage.location_on_tug}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{damage.description}</p>
                    </div>
                  </div>

                  {/* Images */}
                  {damage.image_urls?.length > 0 && (
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {damage.image_urls.map((url, idx) => (
                        <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                          <img src={url} alt={`Damage ${idx + 1}`} className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Resolution info */}
                  {damage.resolved_at && resolvedBy && (
                    <p className="text-xs text-green-600 mb-2">
                      Resolved by {resolvedBy} on {new Date(damage.resolved_at).toLocaleDateString('en-GB')}
                    </p>
                  )}

                  {/* Status actions */}
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={damage.repair_status}
                      onChange={(e) => updateDamageStatus(damage.id, e.target.value)}
                      className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                        damage.repair_status === 'resolved' ? 'border-green-300 bg-green-100'
                          : damage.repair_status === 'in_progress' ? 'border-yellow-300 bg-yellow-100'
                          : 'border-red-300 bg-red-100'
                      }`}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Remarks */}
      {(submission.remarks || remarksImages.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-charcoal text-sm mb-2">Remarks</h3>
          {submission.remarks && (
            <p className="text-sm text-gray-700">{submission.remarks}</p>
          )}
          {remarksImages.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {remarksImages.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                  <img src={url} alt={`Remarks ${idx + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

PreCheckDetail.propTypes = {
  submissionId: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
};
