import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import RotaManager from '../components/Admin/Rota/RotaManager';

export default function RotaPlannerPage() {
  const { user, loading: authLoading } = useAuth();
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Save the fact that user visited the Rota Planner directly
  useEffect(() => {
    // We'll keep track of this so the admin dashboard knows Rota has been moved
    localStorage.setItem('rota_planner_migrated', 'true');
  }, []);

  // Effect to check admin permissions after AuthContext loads
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) {
        setError('You must be logged in and have admin privileges.');
        setIsAdmin(false);
        setPageLoading(false);
        return;
      }

      setPageLoading(true);
      try {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          if (profileError.code !== 'PGRST116') {
            throw profileError;
          }
          setError('Admin permissions require a user profile.');
          setIsAdmin(false);
        } else if (userProfile && userProfile.role === 'admin') {
          setIsAdmin(true);
          setError(null);
        } else {
          setError('You do not have permission to access this page.');
          setIsAdmin(false);
        }
      } catch (err) {
        console.error('[RotaPlannerPage] Error checking admin status:', err);
        setError('Error verifying permissions.');
        setIsAdmin(false);
      } finally {
        setPageLoading(false);
      }
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  // Main rendering logic
  if (pageLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Toolbar skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-slate-200 rounded-lg" />
            ))}
          </div>
          <div className="h-10 bg-slate-200 rounded-lg" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-20 bg-slate-200 rounded-lg" />
            ))}
          </div>
        </div>
        
        {/* Date navigation skeleton */}
        <div className="flex items-center justify-center gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="h-8 w-72 bg-slate-300 rounded" />
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
        </div>
        
        {/* Calendar grid skeleton */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={`header-${i}`} className="h-8 bg-slate-300 rounded text-center" />
          ))}
          {/* Calendar days */}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border-2 border-slate-200 p-3 min-h-32">
              <div className="h-6 w-8 bg-slate-300 rounded mb-3" />
              <div className="space-y-2">
                <div className="h-4 bg-slate-200 rounded" />
                <div className="h-4 bg-slate-200 rounded w-4/5" />
                <div className="h-4 bg-slate-200 rounded w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4 bg-offwhite">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-6 border border-gray-200">
          <div className="text-red-600 text-center">
            <h2 className="text-2xl font-bold mb-4 text-charcoal">Access Denied</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-offwhite p-4">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <div className="text-red-600 text-center">
            <h2 className="text-2xl font-bold mb-4 text-charcoal">Access Denied</h2>
            <p>Administrative privileges required to access Rota Planner.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite overflow-hidden relative">
      <RotaManager user={user} />
    </div>
  );
} 