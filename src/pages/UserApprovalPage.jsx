import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UserApprovalPage() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      // Fetch pending users directly from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, account_status, created_at, preferred_location, shift_preference, email')
        .eq('account_status', 'pending_approval')
        .order('created_at', { ascending: false });
      
      if (profileError) throw profileError;
      
      setPendingUsers(profileData || []);
    } catch (err) {
      console.error('Error fetching pending users:', err);
      setError('Failed to load pending users: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'approved' })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Update local state to remove the approved user
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (err) {
      console.error('Error approving user:', err);
      setError('Failed to approve user: ' + err.message);
    }
  };

  const handleReject = async (userId) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: 'rejected' })
        .eq('id', userId);
      
      if (error) throw error;
      
      // Update local state to remove the rejected user
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (err) {
      console.error('Error rejecting user:', err);
      setError('Failed to reject user: ' + err.message);
    }
  };

  // Format date to readable format
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">User Approval Queue</h2>
        <button
          onClick={fetchPendingUsers}
          className="bg-blue-500/30 hover:bg-blue-500/50 text-white py-2 px-4 rounded-md transition-colors border border-blue-400/30 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-md">
          {error}
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="bg-gray-700/30 border border-gray-600/30 text-white/70 p-6 rounded-md text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p>No pending users to approve at this time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pendingUsers.map(user => (
            <div key={user.id} className="bg-gray-800/40 rounded-lg border border-gray-700/60 overflow-hidden">
              <div className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {user.first_name} {user.last_name}
                    </h3>
                    {user.email && (
                      <p className="text-blue-300 text-sm">{user.email}</p>
                    )}
                  </div>
                  <div className="bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded-full uppercase font-medium">
                    Pending
                  </div>
                </div>
                
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-400">Shift Preference:</p>
                    <p className="text-white">{user.shift_preference || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Preferred Location:</p>
                    <p className="text-white">{user.preferred_location || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Registration Date:</p>
                    <p className="text-white">{formatDate(user.created_at)}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex border-t border-gray-700">
                <button
                  onClick={() => handleApprove(user.id)}
                  className="flex-1 py-3 text-green-300 hover:bg-green-500/10 transition-colors border-r border-gray-700"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(user.id)}
                  className="flex-1 py-3 text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 