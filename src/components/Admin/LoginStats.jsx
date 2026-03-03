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
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
        <div className="w-full px-4 py-3 flex items-center justify-between bg-red-50 border-b border-red-200/60">
          <div className="h-4 w-32 bg-red-200/60 rounded animate-pulse" />
          <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-100">
            <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
            <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="p-4 border-t border-red-100 bg-yellow-50/50 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
        <div className="w-full px-4 py-3 bg-red-50 border-b border-red-200/60">
          <p className="text-sm font-semibold text-red-800">Activity</p>
        </div>
        <div className="p-4 border-t border-red-100 bg-yellow-50/50">
          <div className="p-4 bg-white rounded-xl border border-red-200 text-center">
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
      </div>
    );
  }
  
  const formatDateForDisplay = (date) => {
    if (!date) return 'Never';
    const formattedDate = new Date(date).toLocaleString();
    const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });
    return `${formattedDate} (${timeAgo})`;
  };
  
  return (
    <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
      {/* Header – red bar, tabs */}
      <div className="w-full px-4 py-3 bg-red-50 border-b border-red-200/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-800">Activity</p>
          <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-100">
            <button
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors ${
                activeTab === 'activity-logs'
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-gray-600 hover:text-charcoal'
              }`}
              onClick={() => setActiveTab('activity-logs')}
            >
              Activity Logs
            </button>
            <button
              className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors ${
                activeTab === 'user-summary'
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-gray-600 hover:text-charcoal'
              }`}
              onClick={() => setActiveTab('user-summary')}
            >
              User Summary
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="border-t border-red-100 p-4 bg-yellow-50/50">
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
                      <div className="flex items-center gap-4 flex-1">
                        {/* User Info */}
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-charcoal">
                            {userGroup.first_name} {userGroup.last_name}
                          </div>
                        </div>

                        {/* Activity Count Badge */}
                        <div className="flex items-center gap-3">
                          <span className="border-2 border-charcoal rounded-full px-3 py-1 text-xs font-medium text-charcoal bg-white">
                            {userGroup.logs.length} {userGroup.logs.length === 1 ? 'activity' : 'activities'}
                          </span>

                          {/* Latest Activity */}
                          <div className="text-xs text-gray-500 hidden md:block">
                            Last: {latestActivity.page_title} • {latestActivity.time_ago}
                          </div>
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

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-white">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Page Visited</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Time</th>
                              <th className="px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase hidden md:table-cell">Session</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {userGroup.logs.map((log) => (
                              <tr key={log.visit_id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-2">
                                  <div className="text-sm font-medium text-charcoal">{log.page_title || log.page_path}</div>
                                  <div className="text-xs text-gray-500">{log.page_path}</div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                  <div className="text-sm text-charcoal">
                                    {new Date(log.visited_at).toLocaleString()}
                                  </div>
                                  <div className="text-xs text-gray-500">{log.time_ago}</div>
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
      
      {/* User Activity Summary Tab */}
      {activeTab === 'user-summary' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">User Activity Summary (Most Active Users)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-bold text-charcoal uppercase">User</th>
                    <th className="px-4 py-2 text-right text-xs font-bold text-charcoal uppercase">Total Views</th>
                    <th className="px-4 py-2 text-right text-xs font-bold text-charcoal uppercase">Unique Pages</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-charcoal uppercase">Most Visited Page</th>
                    <th className="px-4 py-2 text-left text-xs font-bold text-charcoal uppercase">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {activitySummary.map((user) => (
                    <tr key={user.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="text-sm font-medium text-charcoal">
                          {user.first_name} {user.last_name}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="border-2 border-charcoal rounded-md px-2 py-1 text-sm font-medium text-charcoal bg-white">
                          {user.total_page_views}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-charcoal">
                        {user.unique_pages_visited}
                      </td>
                      <td className="px-4 py-2 text-sm text-charcoal">
                        {user.most_visited_page || 'N/A'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                        {formatDateForDisplay(user.last_activity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default LoginStats; 