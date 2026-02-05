import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import PreCheckDetail from './PreCheckDetail';

export default function PreCheckList() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    location: '',
    tug: '',
    user: '',
    checkType: '',
  });
  const [locations, setLocations] = useState([]);
  const [tugs, setTugs] = useState([]);
  const [stats, setStats] = useState({ total: 0, withDamages: 0, withRepairs: 0 });

  const fetchFilters = useCallback(async () => {
    const [locRes, tugRes] = await Promise.all([
      supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
      supabase.from('tugs').select('id, tug_number').order('tug_number'),
    ]);
    setLocations(locRes.data || []);
    setTugs(tugRes.data || []);
  }, []);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('precheck_submissions')
        .select(`
          *,
          profiles:user_id(first_name, last_name),
          tugs(tug_number, location_id, locations(name)),
          precheck_damages(id, severity, repair_status)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters.date) {
        query = query.eq('check_date', filters.date);
      }
      if (filters.checkType) {
        query = query.eq('check_type', filters.checkType);
      }
      if (filters.tug) {
        query = query.eq('tug_id', filters.tug);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered = data || [];

      // Client-side filter by location
      if (filters.location) {
        filtered = filtered.filter(s => s.tugs?.location_id === filters.location);
      }

      // Client-side filter by user name
      if (filters.user) {
        const search = filters.user.toLowerCase();
        filtered = filtered.filter(s => {
          const name = `${s.profiles?.first_name || ''} ${s.profiles?.last_name || ''}`.toLowerCase();
          return name.includes(search);
        });
      }

      setSubmissions(filtered);

      // Stats
      setStats({
        total: filtered.length,
        withDamages: filtered.filter(s => s.precheck_damages?.length > 0).length,
        withRepairs: filtered.filter(s => 
          s.precheck_damages?.some(d => d.repair_status === 'open')
        ).length,
      });
    } catch (err) {
      console.error('[PreCheckList] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  if (selectedSubmission) {
    return (
      <PreCheckDetail
        submissionId={selectedSubmission}
        onBack={() => { setSelectedSubmission(null); fetchSubmissions(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-charcoal">PreCheck Reports</h2>
        <p className="text-sm text-gray-500">View all tug inspection reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-charcoal">{stats.total}</div>
          <div className="text-xs text-gray-500">Total Checks</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-600">{stats.withDamages}</div>
          <div className="text-xs text-gray-500">With Damages</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-600">{stats.withRepairs}</div>
          <div className="text-xs text-gray-500">Open Repairs</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <select
              value={filters.location}
              onChange={(e) => setFilters(prev => ({ ...prev, location: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tug</label>
            <select
              value={filters.tug}
              onChange={(e) => setFilters(prev => ({ ...prev, tug: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              {tugs.map(tug => (
                <option key={tug.id} value={tug.id}>{tug.tug_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={filters.checkType}
              onChange={(e) => setFilters(prev => ({ ...prev, checkType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="pre_shift">Pre-Shift</option>
              <option value="during_shift">During Shift</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
            <input
              type="text"
              value={filters.user}
              onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
              placeholder="Search name..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No PreCheck reports found</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {submissions.map(sub => {
            const profile = sub.profiles;
            const userName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown';
            const hasDamages = sub.precheck_damages?.length > 0;
            const hasOpenDamages = sub.precheck_damages?.some(d => d.repair_status === 'open');

            return (
              <button
                key={sub.id}
                onClick={() => setSelectedSubmission(sub.id)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-left hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    hasOpenDamages ? 'bg-red-100 text-red-600'
                      : hasDamages ? 'bg-orange-100 text-orange-600'
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {hasOpenDamages ? (
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-charcoal text-sm">{sub.tugs?.tug_number}</span>
                      <span className="text-xs text-gray-500">by {userName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        sub.check_type === 'pre_shift' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {sub.check_type === 'pre_shift' ? 'Pre-Shift' : 'During Shift'}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                      <span>{new Date(sub.check_time || sub.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      {sub.tugs?.locations?.name && <span>{sub.tugs.locations.name}</span>}
                      {hasDamages && (
                        <span className="text-red-600">{sub.precheck_damages.length} damage(s)</span>
                      )}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
