import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';

const LoginStats = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activitySummary, setActivitySummary] = useState([]);
  const [activeTab, setActiveTab] = useState('activity-logs');
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  
  const ACTIVITY_DAYS_BACK = 1; // 24 hours
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
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