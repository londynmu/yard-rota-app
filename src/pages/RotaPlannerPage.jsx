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

      console.log('[RotaPlannerPage] User detected. Checking admin privileges...');
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
          console.warn('[RotaPlannerPage] Profile not found for user.');
          setError('Admin permissions require a user profile.');
          setIsAdmin(false);
        } else if (userProfile && userProfile.role === 'admin') {
          console.log('[RotaPlannerPage] Admin role confirmed.');
          setIsAdmin(true);
          setError(null);
        } else {
          console.log('[RotaPlannerPage] User is not admin. Role:', userProfile?.role);
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
      <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-black via-blue-900 to-green-500">
        <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-white/90"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto bg-black/60 backdrop-blur-xl rounded-xl shadow-2xl p-6 border-2 border-white/30">
          <div className="text-red-300 text-center">
            <h2 className="text-2xl font-bold mb-4 text-white drop-shadow-md">Access Denied</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto bg-black/60 backdrop-blur-xl rounded-xl shadow-2xl p-6 border-2 border-white/30">
          <div className="text-red-300 text-center">
            <h2 className="text-2xl font-bold mb-4 text-white drop-shadow-md">Access Denied</h2>
            <p>Administrative privileges required to access Rota Planner.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-6 px-4 sm:px-8 overflow-hidden relative text-white">
      <div className="max-w-7xl mx-auto backdrop-blur-xl bg-black/60 rounded-xl shadow-2xl overflow-hidden border-2 border-white/30">
        <div className="p-6">
          <RotaManager />
        </div>
      </div>
    </div>
  );
} 