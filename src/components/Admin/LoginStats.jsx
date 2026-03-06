import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';

const LoginStats = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activitySummary, setActivitySummary] = useState([]);
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('admin_stats_active_tab');
    return (saved === 'activity-logs' || saved === 'user-summary' || saved === 'rota-breaks') ? saved : 'activity-logs';
  });
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  const [systemActivityLogs, setSystemActivityLogs] = useState([]);
  const [systemActivityLoading, setSystemActivityLoading] = useState(false);
  const [systemActivityError, setSystemActivityError] = useState(null);
  const [systemActivityDaysBack, setSystemActivityDaysBack] = useState(7);
  const [systemActivityEntityFilter, setSystemActivityEntityFilter] = useState('');
  const [targetUserNamesById, setTargetUserNamesById] = useState({});
  
  const ACTIVITY_DAYS_BACK = 1; // 24 hours
  
  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (activeTab === 'rota-breaks') {
      fetchSystemActivity();
    }
  }, [activeTab, systemActivityDaysBack, systemActivityEntityFilter]);

  useEffect(() => {
    localStorage.setItem('admin_stats_active_tab', activeTab);
  }, [activeTab]);

  const fetchSystemActivity = async () => {
    setSystemActivityLoading(true);
    setSystemActivityError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_system_activity_log', {
        days_back: systemActivityDaysBack,
        limit_count: 500,
        entity_type_filter: systemActivityEntityFilter || null,
        user_id_filter: null
      });
      if (rpcError) throw rpcError;
      setSystemActivityLogs(data || []);
      const logs = data || [];
      const ids = new Set();
      logs.forEach((log) => {
        const p = log.payload;
        if (!p) return;
        const payload = typeof p === 'string' ? (() => { try { return JSON.parse(p); } catch { return null; } })() : p;
        if (!payload) return;
        if (payload.assigned_user_id) ids.add(payload.assigned_user_id);
        if (payload.unassigned_user_id) ids.add(payload.unassigned_user_id);
      });
      if (ids.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', [...ids]);
        const map = {};
        (profiles || []).forEach((pr) => {
          map[pr.id] = [pr.first_name, pr.last_name].filter(Boolean).join(' ').trim() || 'Unknown';
        });
        setTargetUserNamesById(map);
      } else {
        setTargetUserNamesById({});
      }
    } catch (err) {
      console.error('Error fetching system activity:', err);
      setSystemActivityError(err.message);
      setSystemActivityLogs([]);
      setTargetUserNamesById({});
    } finally {
      setSystemActivityLoading(false);
    }
  };
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch full activity logs
      const { data: activityData, error: activityError } = await supabase.rpc('get_full_activity_logs', { 
        days_back: ACTIVITY_DAYS_BACK,
        limit_count: 500 
      });
      if (activityError) throw activityError;
      setActivityLogs(activityData || []);
      
      // Fetch user activity summary
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_user_activity_summary', {
        days_back: ACTIVITY_DAYS_BACK
      });
      if (summaryError) throw summaryError;
      setActivitySummary(summaryData || []);
      
    } catch (error) {
      console.error('Error fetching login statistics:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="flex rounded border border-gray-300 p-0.5 bg-gray-100">
              <div className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
              <div className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-charcoal">Activity</p>
        <div className="p-4 bg-white rounded-xl border border-gray-200 text-center">
          <h3 className="text-lg font-semibold mb-2 text-charcoal">Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchAllData()}
            className="px-4 py-2 rounded-lg border-2 border-charcoal bg-white text-charcoal hover:bg-gray-50 transition-colors text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  const formatDateForDisplay = (date) => {
    if (!date) return 'Never';
    const formattedDate = new Date(date).toLocaleString();
    const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });
    return `${formattedDate} (${timeAgo})`;
  };

  const getShortPageLabel = (pagePath, pageTitle) => {
    const path = (pagePath || '').toLowerCase();
    const title = (pageTitle || '').toLowerCase();
    if (path.includes('/precheck') || title.includes('precheck')) return 'Precheck';
    if (path.includes('/calendar') || title.includes('calendar')) return 'Calendar';
    if (path.includes('/performance') || title.includes('performance')) return 'Performance';
    if (path.includes('/profile') || title.includes('profile')) return 'Profile';
    if (path.includes('/my-rota') || title.includes('my rota')) return 'My Rota';
    if (path.includes('/vmu') || path.includes('/stats')) return 'Activity';
    if (path.includes('/rota') || path.includes('/breaks')) return 'Rota';
    if (path.includes('/admin') || title.includes('admin')) return 'Admin';
    if (path.includes('/home') || path === '/' || title.includes('main page')) return 'Main Page';
    if (path.includes('/attendance')) return 'Attendance';
    if (path.includes('/tug')) return 'Precheck';
    // Use stored page_title when available, otherwise path segment or fallback
    if (pageTitle && pageTitle.trim()) return pageTitle.trim();
    if (path && path !== '/') {
      const segment = path.split('/').filter(Boolean).pop();
      if (segment) return segment.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return 'Other';
  };

  const getSystemActionLabel = (actionType) => {
    const labels = {
      slot_added: 'Slot added',
      slot_deleted: 'Slot deleted',
      slot_updated: 'Slot updated',
      employee_assigned: 'Employee assigned',
      employee_unassigned: 'Employee unassigned',
      slots_copied: 'Slots copied',
      template_applied: 'Template applied',
      template_saved: 'Template saved',
      shift_claimed: 'Shift claimed',
      breaks_saved: 'Breaks saved',
      breaks_custom_slot_deleted: 'Custom break slot deleted',
      break_assignment_added: 'Break assignment added',
      break_assignment_removed: 'Break assignment removed',
    };
    return labels[actionType] || actionType;
  };

  const toTimeHHMM = (v) => {
    if (v == null || v === '') return v;
    const s = String(v).trim();
    if (s.length >= 5 && s.indexOf(':') !== -1) return s.substring(0, 5);
    return s;
  };

  const getSystemPayloadSummary = (payload, actionType) => {
    if (!payload) return '';
    try {
      const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (actionType === 'slot_added' || actionType === 'slot_deleted' || actionType === 'slot_updated') {
        return [p.date, p.shift_type, p.location, toTimeHHMM(p.start_time), toTimeHHMM(p.end_time)].filter(Boolean).join(', ');
      }
      if (actionType === 'employee_assigned' || actionType === 'employee_unassigned') {
        return [p.date, p.shift_type, p.location, toTimeHHMM(p.start_time), toTimeHHMM(p.end_time)].filter(Boolean).join(', ');
      }
      if (actionType === 'slots_copied') return `Target: ${p.target_date}, ${p.slots_count} slots`;
      if (actionType === 'template_applied') return `"${p.template_name}", ${p.slots_count} slots`;
      if (actionType === 'template_saved') return `"${p.template_name}", ${p.slots_count} slots`;
      if (actionType === 'shift_claimed') return [p.date, p.location, p.shift_type, toTimeHHMM(p.start_time), toTimeHHMM(p.end_time)].filter(Boolean).join(', ');
      if (actionType === 'breaks_saved') return `${p.date} ${p.shift_type}, ${p.assignments_count} assignments`;
      if (actionType === 'breaks_custom_slot_deleted') return [p.date, toTimeHHMM(p.break_start_time), `${p.break_duration_minutes} min`].filter(Boolean).join(', ');
      if (actionType === 'break_assignment_added' || actionType === 'break_assignment_removed') {
        return [p.date, p.shift_type, p.location, toTimeHHMM(p.break_start_time)].filter(Boolean).join(', ');
      }
      return JSON.stringify(p).slice(0, 80);
    } catch {
      return '';
    }
  };

  const getTargetUserName = (log) => {
    if (log.action_type === 'employee_assigned' || log.action_type === 'employee_unassigned' ||
        log.action_type === 'break_assignment_added' || log.action_type === 'break_assignment_removed') {
      const p = log.payload;
      const payload = typeof p === 'string' ? (() => { try { return JSON.parse(p); } catch { return null; } })() : p;
      const id = payload?.assigned_user_id || payload?.unassigned_user_id;
      return id ? (targetUserNamesById[id] || 'Unknown user') : null;
    }
    return null;
  };

  const getSystemActionDisplay = (log) => {
    if (log.action_type === 'employee_assigned' || log.action_type === 'break_assignment_added') return 'Added';
    if (log.action_type === 'employee_unassigned' || log.action_type === 'break_assignment_removed') return 'Removed';
    return getSystemActionLabel(log.action_type);
  };
  
  return (
    <div className="space-y-3">
      {/* Header – compact tabs */}
      <div className="flex items-center">
        <div className="flex rounded border border-gray-300 p-0.5 bg-gray-100">
              <button
                className={`py-0.5 px-2 text-[10px] font-semibold rounded transition-colors ${
                  activeTab === 'activity-logs'
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
                onClick={() => setActiveTab('activity-logs')}
              >
                Logs
              </button>
              <button
                className={`py-0.5 px-2 text-[10px] font-semibold rounded transition-colors ${
                  activeTab === 'user-summary'
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
                onClick={() => setActiveTab('user-summary')}
              >
                Summary
              </button>
              <button
                className={`py-0.5 px-2 text-[10px] font-semibold rounded transition-colors ${
                  activeTab === 'rota-breaks'
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
                onClick={() => setActiveTab('rota-breaks')}
              >
                Rota & Breaks
              </button>
        </div>
      </div>

      {/* Content – floating cards, no wrapper */}
      {activeTab === 'activity-logs' && (
        <div className="space-y-3">
            {(() => {
              // Group logs by user
              const groupedLogs = activityLogs.reduce((acc, log) => {
                const key = log.user_id;
                if (!acc[key]) {
                  acc[key] = {
                    user_id: log.user_id,
                    first_name: log.first_name,
                    last_name: log.last_name,
                    logs: []
                  };
                }
                acc[key].logs.push(log);
                return acc;
              }, {});

              const userGroups = Object.values(groupedLogs);
              const BORDER_COLORS = ['border-amber-200', 'border-blue-200', 'border-emerald-200', 'border-purple-200'];

              if (userGroups.length === 0) {
                return (
                  <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
                    <p className="text-gray-500">No activity logs found for the selected time period.</p>
                  </div>
                );
              }

              return userGroups.map((userGroup, idx) => {
                const isExpanded = expandedUsers.has(userGroup.user_id);
                const latestActivity = userGroup.logs[0];
                const borderClass = BORDER_COLORS[idx % BORDER_COLORS.length];

                return (
                  <div key={userGroup.user_id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${borderClass}`}>
                    {/* User Header - Clickable */}
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedUsers);
                        if (isExpanded) {
                          newExpanded.delete(userGroup.user_id);
                        } else {
                          newExpanded.add(userGroup.user_id);
                        }
                        setExpandedUsers(newExpanded);
                      }}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Activity count – only number, left-aligned with fixed width for consistent spacing */}
                        <span className="w-10 flex-shrink-0 text-sm font-semibold text-charcoal tabular-nums">
                          {userGroup.logs.length}
                        </span>
                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-charcoal truncate">
                            {userGroup.first_name} {userGroup.last_name}
                          </div>
                        </div>
                        {/* Latest Activity */}
                        <div className="text-xs text-gray-500 hidden md:block truncate flex-shrink-0">
                          Last: {getShortPageLabel(latestActivity.page_path, latestActivity.page_title)} • {latestActivity.time_ago}
                        </div>
                      </div>

                      {/* Expand Icon */}
                      <svg
                        className={`w-5 h-5 text-gray-500 transition-transform ml-3 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Details – short label + time, no overflow on mobile */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-white overflow-hidden">
                        <table className="min-w-0 w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Page</th>
                              <th className="px-4 py-2 text-right md:text-left text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Time</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase hidden md:table-cell">Session</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {userGroup.logs.map((log) => (
                              <tr key={log.visit_id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-2 min-w-0">
                                  <span className="text-sm font-medium text-charcoal truncate block">
                                    {getShortPageLabel(log.page_path, log.page_title)}
                                  </span>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-right md:text-left">
                                  <span className="text-sm text-charcoal" title={new Date(log.visited_at).toLocaleString()}>
                                    {log.time_ago}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-500 font-mono hidden md:table-cell">
                                  {log.session_id?.substring(0, 12)}...
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
        </div>
      )}
      {activeTab === 'rota-breaks' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-gray-600">Days:</label>
            <select
              value={systemActivityDaysBack}
              onChange={(e) => setSystemActivityDaysBack(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-charcoal bg-white"
            >
              <option value={1}>1</option>
              <option value={3}>3</option>
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
            <label className="text-xs font-medium text-gray-600 ml-2">Type:</label>
            <select
              value={systemActivityEntityFilter}
              onChange={(e) => setSystemActivityEntityFilter(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-charcoal bg-white"
            >
              <option value="">All</option>
              <option value="rota">Rota</option>
              <option value="breaks">Breaks</option>
            </select>
          </div>
          {systemActivityLoading ? (
            <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
              <p className="text-gray-500">Loading...</p>
            </div>
          ) : systemActivityError ? (
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-center">
              <p className="text-red-600 text-sm">{systemActivityError}</p>
              <button
                type="button"
                onClick={() => fetchSystemActivity()}
                className="mt-2 px-3 py-1 rounded border border-charcoal text-xs font-medium text-charcoal hover:bg-gray-50"
              >
                Retry
              </button>
            </div>
          ) : systemActivityLogs.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
              <p className="text-gray-500">No Rota & Breaks activity for the selected period.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-emerald-200">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="min-w-0 w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Who (admin)</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Action</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Target user</th>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {systemActivityLogs.map((log) => {
                      const targetName = getTargetUserName(log);
                      const exactTime = log.created_at ? new Date(log.created_at).toLocaleString() : '';
                      return (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-charcoal" title={exactTime}>
                            {log.time_ago}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal">
                            {log.first_name || log.last_name
                              ? `${log.first_name || ''} ${log.last_name || ''}`.trim()
                              : 'Deleted user'}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal">
                            {log.entity_type === 'rota' ? 'Rota' : 'Breaks'}
                          </td>
                          <td className="px-4 py-2 text-xs font-medium text-charcoal">
                            {getSystemActionDisplay(log)}
                          </td>
                          <td className="px-4 py-2 text-xs text-charcoal">
                            {targetName != null ? targetName : '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={typeof log.payload === 'object' ? JSON.stringify(log.payload) : log.payload}>
                            {getSystemPayloadSummary(log.payload, log.action_type)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'user-summary' && (
        <div className="space-y-3">
          {(() => {
            const BORDER_COLORS = ['border-amber-200', 'border-blue-200', 'border-emerald-200', 'border-purple-200'];

            if (activitySummary.length === 0) {
              return (
                <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
                  <p className="text-gray-500">No users found for the selected time period.</p>
                </div>
              );
            }

            return activitySummary.map((user, idx) => {
              const borderClass = BORDER_COLORS[idx % BORDER_COLORS.length];
              return (
                <div
                  key={user.user_id}
                  className={`bg-white rounded-xl border shadow-sm p-4 ${borderClass}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-charcoal">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Last: {formatDateForDisplay(user.last_activity)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="border-2 border-charcoal rounded-md px-2 py-0.5 text-xs font-medium text-charcoal bg-white">
                        {user.total_page_views} views
                      </span>
                      <span className="text-xs text-gray-600">
                        {user.unique_pages_visited} unique pages
                      </span>
                    </div>
                  </div>
                  {user.most_visited_page && (
                    <div className="mt-2 text-xs text-gray-600">
                      <span className="text-gray-500">Most visited:</span> {user.most_visited_page}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

export default LoginStats; 