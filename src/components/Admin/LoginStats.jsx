import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';

const LoginStats = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [timeStats, setTimeStats] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState([]);
  const [inactiveStats, setInactiveStats] = useState([]);
  const [activeUsersTimerange, setActiveUsersTimerange] = useState([]);
  const [mostVisitedPages, setMostVisitedPages] = useState([]);
  const [pageVisitsByHour, setPageVisitsByHour] = useState([]);
  const [pageVisitsByDay, setPageVisitsByDay] = useState([]);
  const [detailedLoginHistory, setDetailedLoginHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortConfig, setSortConfig] = useState({ key: 'last_sign_in_at', direction: 'desc' });
  
  // Colors for charts - consistent with app theme
  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch all existing statistics
      const [
        usersData,
        timeData,
        monthlyData,
        inactiveData,
        timerangeData,
        visitedPagesData,
        visitsHourData,
        visitsDayData,
        loginHistoryData
      ] = await Promise.all([
        supabase.rpc('get_all_users_login_stats'),
        supabase.rpc('get_login_time_stats'),
        supabase.rpc('get_monthly_user_stats'),
        supabase.rpc('get_inactive_users_stats'),
        supabase.rpc('get_active_users_by_timerange'),
        supabase.rpc('get_most_visited_pages', { days_back: 30 }),
        supabase.rpc('get_page_visits_by_hour', { days_back: 7 }),
        supabase.rpc('get_page_visits_by_day', { days_back: 30 }),
        supabase.rpc('get_detailed_login_history', { days_back: 30 })
      ]);
      
      if (usersData.error) throw usersData.error;
      if (timeData.error) throw timeData.error;
      if (monthlyData.error) throw monthlyData.error;
      if (inactiveData.error) throw inactiveData.error;
      
      setAllUsers(usersData.data || []);
      setTimeStats(timeData.data || []);
      setMonthlyStats(monthlyData.data || []);
      setInactiveStats(inactiveData.data || []);
      setActiveUsersTimerange(timerangeData.data || []);
      setMostVisitedPages(visitedPagesData.data || []);
      setPageVisitsByHour(visitsHourData.data || []);
      setPageVisitsByDay(visitsDayData.data || []);
      setDetailedLoginHistory(loginHistoryData.data || []);
      
    } catch (error) {
      console.error('Error fetching statistics:', error);
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
        if (a[sortConfig.key] === null) return sortConfig.direction === 'asc' ? -1 : 1;
        if (b[sortConfig.key] === null) return sortConfig.direction === 'asc' ? 1 : -1;
        
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
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-white rounded-xl border border-red-300 text-center">
        <h3 className="text-lg font-semibold mb-2 text-charcoal">Error</h3>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => fetchAllData()}
          className="mt-4 bg-black text-white hover:bg-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }
  
  const formatDateForDisplay = (date) => {
    if (!date) return 'Never';
    const formattedDate = format(new Date(date), 'dd/MM/yyyy HH:mm');
    const timeAgo = formatDistanceToNow(new Date(date), { addSuffix: true });
    return `${formattedDate} (${timeAgo})`;
  };
  
  // Tab button component for consistency
  const TabButton = ({ id, label, icon }) => (
    <button
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
        activeTab === id 
          ? 'bg-black text-white shadow-md' 
          : 'bg-white text-charcoal border border-gray-200 hover:bg-gray-100'
      }`}
      onClick={() => setActiveTab(id)}
    >
      {icon && <span className="text-base">{icon}</span>}
      {label}
    </button>
  );
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
        <h2 className="text-2xl font-bold text-charcoal mb-4">Statistics Dashboard</h2>
        
        {/* Tab navigation - mobile optimized with horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
          <TabButton id="overview" label="Overview" icon="📊" />
          <TabButton id="users" label="Users" icon="👥" />
          <TabButton id="logins" label="Login History" icon="🔐" />
          <TabButton id="pages" label="Page Visits" icon="📄" />
          <TabButton id="activity" label="Activity" icon="⏰" />
          <TabButton id="retention" label="Retention" icon="📈" />
        </div>
        
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics Grid - mobile: 2 cols, desktop: 4 cols */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Total Users</h3>
                <p className="text-charcoal text-2xl md:text-3xl font-bold">{allUsers.length}</p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Active (7d)</h3>
                <p className="text-green-600 text-2xl md:text-3xl font-bold">
                  {inactiveStats.find(s => s.inactive_range === 'Active (last 7 days)')?.count || 0}
                </p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Never Logged</h3>
                <p className="text-red-600 text-2xl md:text-3xl font-bold">
                  {inactiveStats.find(s => s.inactive_range === 'Never logged in')?.count || 0}
                </p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Page Views</h3>
                <p className="text-blue-600 text-2xl md:text-3xl font-bold">
                  {pageVisitsByDay.reduce((sum, day) => sum + Number(day.visit_count), 0)}
                </p>
              </div>
            </div>
            
            {/* Active Users by Time Range */}
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold text-lg mb-4">Active Users by Time Range</h3>
              <div className="space-y-2">
                {activeUsersTimerange.map((range) => (
                  <div key={range.time_range} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                    <span className="text-charcoal font-medium">{range.time_range}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-600">{range.user_count} users</span>
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">{range.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* User Activity Distribution */}
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-charcoal font-semibold mb-3">User Activity Distribution</h3>
                <div className="h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={inactiveStats}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ percentage }) => `${percentage}%`}
                        outerRadius={window.innerWidth < 768 ? 60 : 80}
                        fill="#8884d8"
                        dataKey="count"
                        nameKey="inactive_range"
                      >
                        {inactiveStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              {/* Monthly Registration Trends */}
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-charcoal font-semibold mb-3">Monthly Registration Trends</h3>
                <div className="h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyStats.slice(-6).reverse()}
                      margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: '11px' }} />
                      <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="new_registrations" name="New Registrations" fill="#2563eb" />
                      <Bar dataKey="active_users" name="Active Users" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Users List Tab */}
        {activeTab === 'users' && (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      scope="col" 
                      className="px-3 md:px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('email')}
                    >
                      User
                      {sortConfig.key === 'email' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th 
                      scope="col" 
                      className="hidden md:table-cell px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('created_at')}
                    >
                      Registered
                      {sortConfig.key === 'created_at' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th 
                      scope="col" 
                      className="px-3 md:px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('last_sign_in_at')}
                    >
                      Last Login
                      {sortConfig.key === 'last_sign_in_at' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th 
                      scope="col" 
                      className="px-3 md:px-6 py-3 text-center text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('days_since_last_login')}
                    >
                      Days
                      {sortConfig.key === 'days_since_last_login' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th 
                      scope="col" 
                      className="hidden md:table-cell px-6 py-3 text-center text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort('login_count')}
                    >
                      Logins
                      {sortConfig.key === 'login_count' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {getSortedUsers().map((user) => (
                    <tr key={user.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 md:px-6 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-charcoal">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-xs text-gray-600 truncate max-w-[150px] md:max-w-none">
                          {user.email}
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDateForDisplay(user.created_at)}
                      </td>
                      <td className="px-3 md:px-6 py-3 whitespace-nowrap text-xs md:text-sm text-gray-600">
                        {user.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'dd/MM HH:mm') : 'Never'}
                      </td>
                      <td className="px-3 md:px-6 py-3 whitespace-nowrap text-center">
                        {user.days_since_last_login === null ? (
                          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">Never</span>
                        ) : user.days_since_last_login > 30 ? (
                          <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">{user.days_since_last_login}</span>
                        ) : user.days_since_last_login > 7 ? (
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">{user.days_since_last_login}</span>
                        ) : (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">{user.days_since_last_login}</span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-6 py-3 whitespace-nowrap text-center text-sm text-gray-600">
                        {user.login_count || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Login History Tab */}
        {activeTab === 'logins' && (
          <div className="space-y-6">
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold text-lg mb-4">Recent Login Activity (Last 30 Days)</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {detailedLoginHistory.length > 0 ? (
                  detailedLoginHistory.map((login, index) => (
                    <div key={index} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                      <div className="flex-1">
                        <div className="font-medium text-charcoal">
                          {login.first_name} {login.last_name}
                        </div>
                        <div className="text-xs text-gray-600">{login.email}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-charcoal">
                          {format(new Date(login.login_time), 'dd/MM/yyyy HH:mm')}
                        </div>
                        <div className="text-xs text-gray-600">
                          {login.days_ago === 0 ? 'Today' : `${login.days_ago} days ago`}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-600 py-8">No login history available</p>
                )}
              </div>
            </div>
            
            {/* User Engagement Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-1">Average logins per user</p>
                <p className="text-charcoal text-2xl font-bold">
                  {allUsers.length > 0 ? (allUsers.reduce((sum, user) => sum + (user.login_count || 0), 0) / allUsers.length).toFixed(1) : '0'}
                </p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-1">Avg days since last login</p>
                <p className="text-charcoal text-2xl font-bold">
                  {allUsers.filter(u => u.days_since_last_login !== null).length > 0 
                    ? (allUsers.filter(u => u.days_since_last_login !== null).reduce((sum, user) => sum + user.days_since_last_login, 0) / 
                        allUsers.filter(u => u.days_since_last_login !== null).length).toFixed(1)
                    : '0'}
                </p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-1">Multiple logins</p>
                <p className="text-charcoal text-2xl font-bold">
                  {allUsers.filter(u => u.login_count > 1).length}
                  <span className="text-sm text-gray-600 ml-2">
                    ({allUsers.length > 0 ? Math.round(allUsers.filter(u => u.login_count > 1).length / allUsers.length * 100) : 0}%)
                  </span>
                </p>
              </div>
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-1">Never logged in</p>
                <p className="text-charcoal text-2xl font-bold">
                  {allUsers.filter(u => u.login_count === 0 || u.login_count === null).length}
                  <span className="text-sm text-gray-600 ml-2">
                    ({allUsers.length > 0 ? Math.round(allUsers.filter(u => u.login_count === 0 || u.login_count === null).length / allUsers.length * 100) : 0}%)
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Page Visits Tab */}
        {activeTab === 'pages' && (
          <div className="space-y-6">
            {/* Most Visited Pages */}
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold text-lg mb-4">Most Visited Pages (Last 30 Days)</h3>
              {mostVisitedPages.length > 0 ? (
                <div className="space-y-2">
                  {mostVisitedPages.map((page, index) => (
                    <div key={index} className="flex items-center justify-between py-3 px-4 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-2xl font-bold text-gray-300">{index + 1}</span>
                        <div>
                          <div className="font-medium text-charcoal">{page.page_title || page.page_path}</div>
                          <div className="text-xs text-gray-600">{page.page_path}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-charcoal">{page.visit_count} visits</div>
                        <div className="text-xs text-gray-600">{page.unique_visitors} unique users</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-600 py-8">No page visit data available yet</p>
              )}
            </div>
            
            {/* Page Visits Over Time */}
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold mb-3">Page Visits Over Time (Last 30 Days)</h3>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={[...pageVisitsByDay].reverse()}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="visit_date" 
                      stroke="#6b7280"
                      style={{ fontSize: '10px' }}
                      tickFormatter={(value) => format(new Date(value), 'dd/MM')}
                    />
                    <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      labelFormatter={(value) => format(new Date(value), 'dd MMM yyyy')}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="visit_count" name="Total Visits" stroke="#2563eb" fill="#93c5fd" />
                    <Area type="monotone" dataKey="unique_visitors" name="Unique Visitors" stroke="#10b981" fill="#6ee7b7" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Page Visits by Hour */}
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold mb-3">Page Visits by Hour (Last 7 Days)</h3>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...Array(24).keys()].map(hour => {
                      const stat = pageVisitsByHour.find(s => s.hour_of_day === hour);
                      return {
                        hour: hour,
                        hour_label: `${hour}:00`,
                        visit_count: stat?.visit_count || 0
                      };
                    })}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hour_label" stroke="#6b7280" style={{ fontSize: '10px' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Bar dataKey="visit_count" name="Visits" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        
        {/* Activity Patterns Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold mb-3">Login Activity by Hour of Day</h3>
              <div className="h-64 md:h-80">
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
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hour_label" stroke="#6b7280" style={{ fontSize: '10px' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Bar dataKey="login_count" name="Logins" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold mb-3">Login Activity by Day of Week</h3>
              <div className="h-64 md:h-80">
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
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day_name" stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Bar dataKey="login_count" name="Logins" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        
        {/* Retention Tab */}
        {activeTab === 'retention' && (
          <div className="space-y-6">
            <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
              <h3 className="text-charcoal font-semibold mb-3">Monthly Retention Rate</h3>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyStats.slice(-12).reverse()}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: '10px' }} />
                    <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="retention_rate" name="Retention Rate (%)" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-charcoal font-semibold mb-3">Inactive Users Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Count</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inactiveStats.map((stat) => (
                        <tr key={stat.inactive_range}>
                          <td className="px-4 py-3 text-sm text-charcoal font-medium">{stat.inactive_range}</td>
                          <td className="px-4 py-3 text-sm text-charcoal text-right">{stat.count}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              {stat.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="bg-offwhite p-4 rounded-lg border border-gray-200">
                <h3 className="text-charcoal font-semibold mb-3">Monthly User Growth</h3>
                <div className="space-y-3">
                  {monthlyStats.slice(-6).reverse().map((month) => (
                    <div key={month.month} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                      <span className="text-charcoal font-medium">{month.month}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">+{month.new_registrations} new</span>
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                          {month.active_users} active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginStats;
