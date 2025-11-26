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
  const [activeTab, setActiveTab] = useState('overview');
  const [sortConfig, setSortConfig] = useState({ key: 'last_sign_in_at', direction: 'desc' });
  
  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#FF6384'];
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
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
      <div className="p-4 bg-red-900/20 shadow-sm rounded-xl border border-red-500/30 text-center">
        <h3 className="text-lg font-semibold mb-2 text-charcoal">Error</h3>
        <p className="text-charcoal/80">{error}</p>
        <button
          onClick={() => fetchAllData()}
          className="mt-4 bg-red-700/40 hover:bg-red-700/60 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-charcoal"
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
    <div className="bg-white shadow-sm rounded-xl overflow-hidden p-4">
      <h2 className="text-xl font-bold text-charcoal mb-4">User Login Statistics</h2>
      
      {/* Tab navigation */}
      <div className="flex mb-4 space-x-2 overflow-x-auto pb-2">
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'overview' 
              ? 'bg-blue-600/60 text-charcoal' 
              : 'bg-white/10 text-charcoal/80 hover:bg-white/20 hover:text-charcoal'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'users' 
              ? 'bg-blue-600/60 text-charcoal' 
              : 'bg-white/10 text-charcoal/80 hover:bg-white/20 hover:text-charcoal'
          }`}
          onClick={() => setActiveTab('users')}
        >
          User List
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'activity' 
              ? 'bg-blue-600/60 text-charcoal' 
              : 'bg-white/10 text-charcoal/80 hover:bg-white/20 hover:text-charcoal'
          }`}
          onClick={() => setActiveTab('activity')}
        >
          Activity Patterns
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${
            activeTab === 'retention' 
              ? 'bg-blue-600/60 text-charcoal' 
              : 'bg-white/10 text-charcoal/80 hover:bg-white/20 hover:text-charcoal'
          }`}
          onClick={() => setActiveTab('retention')}
        >
          Retention
        </button>
      </div>
      
      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal/70 text-sm font-medium">Total Users</h3>
              <p className="text-charcoal text-2xl font-bold">{allUsers.length}</p>
            </div>
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal/70 text-sm font-medium">Active Users (7 days)</h3>
              <p className="text-charcoal text-2xl font-bold">
                {inactiveStats.find(s => s.inactive_range === 'Active (last 7 days)')?.count || 0}
              </p>
            </div>
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal/70 text-sm font-medium">Never Logged In</h3>
              <p className="text-charcoal text-2xl font-bold">
                {inactiveStats.find(s => s.inactive_range === 'Never logged in')?.count || 0}
              </p>
            </div>
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal/70 text-sm font-medium">Inactive &gt;30 days</h3>
              <p className="text-charcoal text-2xl font-bold">
                {(inactiveStats.find(s => s.inactive_range === 'Inactive >90 days')?.count || 0) + 
                 (inactiveStats.find(s => s.inactive_range === 'Inactive 30-90 days')?.count || 0)}
              </p>
            </div>
          </div>
          
          <div className="bg-black/30 p-4 rounded-lg border border-white/10">
            <h3 className="text-charcoal font-medium mb-3">User Activity Distribution</h3>
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
                    label={({ inactive_range, percentage }) => `${inactive_range}: ${percentage}%`}
                  >
                    {inactiveStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    // eslint-disable-next-line react/prop-types
                    formatter={(value, name, props) => [value, props.payload.inactive_range]}
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-black/30 p-4 rounded-lg border border-white/10">
            <h3 className="text-charcoal font-medium mb-3">Monthly Registration Trends</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyStats.slice(0, 12).reverse()}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.7)" />
                  <YAxis stroke="rgba(255,255,255,0.7)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
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
      
      {/* Users List Tab */}
      {activeTab === 'users' && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border border-white/20 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 shadow-xl sticky top-0 z-10 shadow-md">
              <tr>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('email')}
                >
                  User
                  {sortConfig.key === 'email' && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('created_at')}
                >
                  Registered
                  {sortConfig.key === 'created_at' && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('last_sign_in_at')}
                >
                  Last Login
                  {sortConfig.key === 'last_sign_in_at' && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-center text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('days_since_last_login')}
                >
                  Days Inactive
                  {sortConfig.key === 'days_since_last_login' && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  scope="col" 
                  className="px-6 py-3 text-center text-xs font-bold text-charcoal uppercase tracking-wider cursor-pointer"
                  onClick={() => handleSort('login_count')}
                >
                  Login Count
                  {sortConfig.key === 'login_count' && (
                    <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white shadow-md">
              {getSortedUsers().map((user) => (
                <tr key={user.user_id} className="hover:bg-white/10 transition-colors">
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-charcoal">
                      {user.first_name} {user.last_name}
                    </div>
                    <div className="text-xs text-charcoal/70">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal/80">
                    {formatDateForDisplay(user.created_at)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-charcoal/80">
                    {formatDateForDisplay(user.last_sign_in_at)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-center">
                    {user.days_since_last_login === null ? (
                      <span className="bg-red-500/40 text-red-100 px-2 py-1 rounded-md text-xs">Never</span>
                    ) : user.days_since_last_login > 30 ? (
                      <span className="bg-orange-500/40 text-orange-100 px-2 py-1 rounded-md text-xs">{user.days_since_last_login}</span>
                    ) : user.days_since_last_login > 7 ? (
                      <span className="bg-yellow-500/40 text-yellow-100 px-2 py-1 rounded-md text-xs">{user.days_since_last_login}</span>
                    ) : (
                      <span className="bg-green-500/40 text-green-100 px-2 py-1 rounded-md text-xs">{user.days_since_last_login}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-center text-sm text-charcoal/80">
                    {user.login_count || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Activity Patterns Tab */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <div className="bg-black/30 p-4 rounded-lg border border-white/10">
            <h3 className="text-charcoal font-medium mb-3">Login Activity by Hour of Day</h3>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="hour_label" stroke="rgba(255,255,255,0.7)" />
                  <YAxis stroke="rgba(255,255,255,0.7)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  />
                  <Bar dataKey="login_count" name="Logins" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-black/30 p-4 rounded-lg border border-white/10">
            <h3 className="text-charcoal font-medium mb-3">Login Activity by Day of Week</h3>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="day_name" stroke="rgba(255,255,255,0.7)" />
                  <YAxis stroke="rgba(255,255,255,0.7)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  />
                  <Bar dataKey="login_count" name="Logins" fill="#00C49F" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      
      {/* Retention Tab */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          <div className="bg-black/30 p-4 rounded-lg border border-white/10">
            <h3 className="text-charcoal font-medium mb-3">Monthly Retention Rate</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyStats.slice(0, 12).reverse()}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.7)" />
                  <YAxis stroke="rgba(255,255,255,0.7)" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  />
                  <Bar dataKey="retention_rate" name="Retention Rate (%)" fill="#FF8042" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal font-medium mb-3">Inactive Users Breakdown</h3>
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-charcoal/70 uppercase">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-charcoal/70 uppercase">Count</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-charcoal/70 uppercase">Percentage</th>
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
            
            <div className="bg-black/30 p-4 rounded-lg border border-white/10">
              <h3 className="text-charcoal font-medium mb-3">User Engagement Summary</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-charcoal/70 text-sm">Average logins per user</p>
                  <p className="text-charcoal text-lg font-medium">
                    {(allUsers.reduce((sum, user) => sum + (user.login_count || 0), 0) / allUsers.length).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-charcoal/70 text-sm">Average days since last login</p>
                  <p className="text-charcoal text-lg font-medium">
                    {(allUsers.filter(u => u.days_since_last_login !== null).reduce((sum, user) => sum + user.days_since_last_login, 0) / 
                      allUsers.filter(u => u.days_since_last_login !== null).length).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-charcoal/70 text-sm">Users with multiple logins</p>
                  <p className="text-charcoal text-lg font-medium">
                    {allUsers.filter(u => u.login_count > 1).length} ({Math.round(allUsers.filter(u => u.login_count > 1).length / allUsers.length * 100)}%)
                  </p>
                </div>
                <div>
                  <p className="text-charcoal/70 text-sm">Users never logged in</p>
                  <p className="text-charcoal text-lg font-medium">
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