import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDistanceToNow } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';

const LoginStats = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [timeStats, setTimeStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [inactiveStats, setInactiveStats] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activitySummary, setActivitySummary] = useState([]);
  const [mostVisitedPages, setMostVisitedPages] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortConfig, setSortConfig] = useState({ key: 'last_sign_in_at', direction: 'desc' });
  const [activityDaysBack, setActivityDaysBack] = useState(7);
  const [expandedUsers, setExpandedUsers] = useState(new Set());
  
  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#FF6384'];
  
  useEffect(() => {
    fetchAllData();
  }, [activityDaysBack]);
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch all users login statistics
      const { data: usersData, error: usersError } = await supabase.rpc('get_all_users_login_stats');
      if (usersError) throw usersError;
      setAllUsers(usersData || []);
      
      // Fetch time-based statistics
      const { data: timeData, error: timeError } = await supabase.rpc('get_login_time_stats');
      if (timeError) throw timeError;
      setTimeStats(timeData || []);
      
      // Fetch monthly statistics
      const { data: monthlyData, error: monthlyError } = await supabase.rpc('get_monthly_user_stats');
      if (monthlyError) throw monthlyError;
      setMonthlyStats(monthlyData || []);
      
      // Fetch inactive users statistics
      const { data: inactiveData, error: inactiveError } = await supabase.rpc('get_inactive_users_stats');
      if (inactiveError) throw inactiveError;
      setInactiveStats(inactiveData || []);
      
      // Fetch full activity logs
      const { data: activityData, error: activityError } = await supabase.rpc('get_full_activity_logs', { 
        days_back: activityDaysBack,
        limit_count: 500 
      });
      if (activityError) throw activityError;
      setActivityLogs(activityData || []);
      
      // Fetch user activity summary
      const { data: summaryData, error: summaryError } = await supabase.rpc('get_user_activity_summary', {
        days_back: activityDaysBack
      });
      if (summaryError) throw summaryError;
      setActivitySummary(summaryData || []);
      
      // Fetch most visited pages
      const { data: pagesData, error: pagesError } = await supabase.rpc('get_most_visited_pages', {
        days_back: activityDaysBack
      });
      if (pagesError) throw pagesError;
      setMostVisitedPages(pagesData || []);
      
    } catch (error) {
      console.error('Error fetching login statistics:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortedUsers = () => {
    const sortableUsers = [...allUsers];
    if (sortConfig.key) {
      sortableUsers.sort((a, b) => {
        // Handle null values
        if (a[sortConfig.key] === null) return sortConfig.direction === 'asc' ? -1 : 1;
        if (b[sortConfig.key] === null) return sortConfig.direction === 'asc' ? 1 : -1;
        
        // Perform the comparison based on data type
        if (typeof a[sortConfig.key] === 'string') {
          return sortConfig.direction === 'asc' 
            ? a[sortConfig.key].localeCompare(b[sortConfig.key])
            : b[sortConfig.key].localeCompare(a[sortConfig.key]);
        }
        
        return sortConfig.direction === 'asc' 
          ? a[sortConfig.key] - b[sortConfig.key]
          : b[sortConfig.key] - a[sortConfig.key];
      });
    }
    return sortableUsers;
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white shadow-lg" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-50 shadow-sm rounded-xl border border-red-200 text-center">
        <h3 className="text-lg font-semibold mb-2 text-red-900">Error</h3>
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => fetchAllData()}
          className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Retry
        </button>
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
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-charcoal">User Login Statistics</h2>
      
      {/* Tab navigation */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-2 mb-4">
        <div className="flex space-x-2 overflow-x-auto">
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'overview' 
              ? 'bg-charcoal text-white' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'activity-logs' 
              ? 'bg-charcoal text-white' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('activity-logs')}
        >
          Activity Logs
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'activity' 
              ? 'bg-charcoal text-white' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('activity')}
        >
          Login Patterns
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'user-summary' 
              ? 'bg-charcoal text-white' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('user-summary')}
        >
          User Summary
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
            activeTab === 'retention' 
              ? 'bg-charcoal text-white' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setActiveTab('retention')}
        >
          Retention
        </button>
        </div>
      </div>
      
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-gray-600 text-sm font-medium">Total Users</h3>
              <p className="text-charcoal text-2xl font-bold mt-1">{allUsers.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-gray-600 text-sm font-medium">Active Users (7 days)</h3>
              <p className="text-charcoal text-2xl font-bold mt-1">
                {inactiveStats.find(s => s.inactive_range === 'Active (last 7 days)')?.count || 0}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-gray-600 text-sm font-medium">Never Logged In</h3>
              <p className="text-charcoal text-2xl font-bold mt-1">
                {inactiveStats.find(s => s.inactive_range === 'Never logged in')?.count || 0}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-gray-600 text-sm font-medium">Inactive &gt;30 days</h3>
              <p className="text-charcoal text-2xl font-bold mt-1">
                {(inactiveStats.find(s => s.inactive_range === 'Inactive >90 days')?.count || 0) + 
                 (inactiveStats.find(s => s.inactive_range === 'Inactive 30-90 days')?.count || 0)}
              </p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">User Activity Distribution</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={inactiveStats}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="inactive_range"
                    label={({ inactive_range, count, percentage }) => `${inactive_range}: ${count} users (${percentage}%)`}
                  >
                    {inactiveStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    // eslint-disable-next-line react/prop-types
                    formatter={(value, name, props) => {
                      const { count, percentage } = props.payload;
                      return [`${count} users (${percentage}%)`, props.payload.inactive_range];
                    }}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: '600' }}
                    itemStyle={{ color: '#6b7280' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">Monthly Registration Trends</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyStats.slice(0, 12).reverse()}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: '600' }}
                    itemStyle={{ color: '#6b7280' }}
                  />
                  <Legend />
                  <Bar dataKey="new_registrations" name="New Registrations" fill="#0088FE" />
                  <Bar dataKey="active_users" name="Active Users" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      
      {/* Activity Logs Tab - Grouped by User */}
      {activeTab === 'activity-logs' && (
        <div className="space-y-4">
          {/* Time range selector */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold">Time Range</h3>
            <div className="flex space-x-2">
              {[1, 3, 7, 14, 30].map(days => (
                <button
                  key={days}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    activityDaysBack === days
                      ? 'bg-charcoal text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setActivityDaysBack(days)}
                >
                  {days === 1 ? '24h' : `${days}d`}
                </button>
              ))}
            </div>
          </div>

          {/* Grouped Activity Logs */}
          <div className="space-y-3">
            {(() => {
              // Group logs by user
              const groupedLogs = activityLogs.reduce((acc, log) => {
                const key = log.user_id;
                if (!acc[key]) {
                  acc[key] = {
                    user_id: log.user_id,
                    email: log.email,
                    first_name: log.first_name,
                    last_name: log.last_name,
                    logs: []
                  };
                }
                acc[key].logs.push(log);
                return acc;
              }, {});

              const userGroups = Object.values(groupedLogs);

              if (userGroups.length === 0) {
                return (
                  <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center">
                    <p className="text-gray-500">No activity logs found for the selected time period.</p>
                  </div>
                );
              }

              return userGroups.map((userGroup) => {
                const isExpanded = expandedUsers.has(userGroup.user_id);
                const latestActivity = userGroup.logs[0];

                return (
                  <div key={userGroup.user_id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {/* User Info */}
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-charcoal">
                            {userGroup.first_name} {userGroup.last_name}
                          </div>
                          <div className="text-xs text-gray-500">{userGroup.email}</div>
                        </div>

                        {/* Activity Count Badge */}
                        <div className="flex items-center gap-3">
                          <span className="bg-charcoal text-white px-3 py-1 rounded-full text-xs font-medium">
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
                        className={`w-5 h-5 text-gray-400 transition-transform ml-3 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t border-gray-200">
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
        </div>
      )}
      
      {/* Activity Patterns Tab */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">Login Activity by Hour of Day</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    [...Array(24).keys()].map(hour => {
                      const stat = timeStats.find(s => s.hour_of_day === hour);
                      return {
                        hour: hour,
                        hour_label: `${hour}:00`,
                        login_count: stat?.login_count || 0
                      };
                    })
                  }
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="hour_label" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: '600' }}
                    itemStyle={{ color: '#6b7280' }}
                  />
                  <Bar dataKey="login_count" name="Logins" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">Login Activity by Day of Week</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    [
                      {day: 0, day_name: 'Sunday', login_count: timeStats.filter(s => s.day_of_week === 0).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 1, day_name: 'Monday', login_count: timeStats.filter(s => s.day_of_week === 1).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 2, day_name: 'Tuesday', login_count: timeStats.filter(s => s.day_of_week === 2).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 3, day_name: 'Wednesday', login_count: timeStats.filter(s => s.day_of_week === 3).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 4, day_name: 'Thursday', login_count: timeStats.filter(s => s.day_of_week === 4).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 5, day_name: 'Friday', login_count: timeStats.filter(s => s.day_of_week === 5).reduce((sum, s) => sum + s.login_count, 0)},
                      {day: 6, day_name: 'Saturday', login_count: timeStats.filter(s => s.day_of_week === 6).reduce((sum, s) => sum + s.login_count, 0)}
                    ]
                  }
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day_name" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: '600' }}
                    itemStyle={{ color: '#6b7280' }}
                  />
                  <Bar dataKey="login_count" name="Logins" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      

      {/* User Activity Summary Tab */}
      {activeTab === 'user-summary' && (
        <div className="space-y-4">
          {/* Time range selector */}
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold">Time Range</h3>
            <div className="flex space-x-2">
              {[1, 3, 7, 14, 30].map(days => (
                <button
                  key={days}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    activityDaysBack === days
                      ? 'bg-charcoal text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setActivityDaysBack(days)}
                >
                  {days === 1 ? '24h' : `${days}d`}
                </button>
              ))}
            </div>
          </div>

          {/* User Activity Summary */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
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
                        <div className="text-xs text-gray-500">{user.email}</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="bg-charcoal text-white px-2 py-1 rounded-md text-sm font-medium">
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

      {/* Retention Tab */}
      {activeTab === 'retention' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="text-charcoal font-semibold mb-3">Monthly Retention Rate</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyStats.slice(0, 12).reverse()}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    labelStyle={{ color: '#374151', fontWeight: '600' }}
                    itemStyle={{ color: '#6b7280' }}
                  />
                  <Bar dataKey="retention_rate" name="Retention Rate (%)" fill="#FF8042" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-charcoal font-semibold mb-3">Inactive Users Breakdown</h3>
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Count</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inactiveStats.map((stat) => (
                    <tr key={stat.inactive_range}>
                      <td className="px-4 py-2 text-sm text-charcoal">{stat.inactive_range}</td>
                      <td className="px-4 py-2 text-sm text-charcoal text-right">{stat.count}</td>
                      <td className="px-4 py-2 text-sm text-charcoal text-right">{stat.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-charcoal font-semibold mb-3">User Engagement Summary</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-600 text-sm">Average logins per user</p>
                  <p className="text-charcoal text-lg font-semibold mt-1">
                    {(allUsers.reduce((sum, user) => sum + (user.login_count || 0), 0) / allUsers.length).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Average days since last login</p>
                  <p className="text-charcoal text-lg font-semibold mt-1">
                    {(allUsers.filter(u => u.days_since_last_login !== null).reduce((sum, user) => sum + user.days_since_last_login, 0) / 
                      allUsers.filter(u => u.days_since_last_login !== null).length).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Users with multiple logins</p>
                  <p className="text-charcoal text-lg font-semibold mt-1">
                    {allUsers.filter(u => u.login_count > 1).length} ({Math.round(allUsers.filter(u => u.login_count > 1).length / allUsers.length * 100)}%)
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Users never logged in</p>
                  <p className="text-charcoal text-lg font-semibold mt-1">
                    {allUsers.filter(u => u.login_count === 0 || u.login_count === null).length} ({Math.round(allUsers.filter(u => u.login_count === 0 || u.login_count === null).length / allUsers.length * 100)}%)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginStats; 