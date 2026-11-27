import React, { useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import RotaManager from '../components/Admin/Rota/RotaManager';
import { safeLocalStorage } from '../utils/safeStorage';

/**
 * Admin Rota Planner shell. Permission is enforced by AdminPage routing;
 * this page does not re-fetch profiles.role on every visit.
 */
export default function RotaPlannerPage() {
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    safeLocalStorage.setItem('rota_planner_migrated', 'true');
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen space-y-6 bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to p-6 animate-pulse motion-reduce:animate-none">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 w-24 rounded-lg bg-rota-toolbar-border" />
            ))}
          </div>
          <div className="h-11 rounded-lg bg-rota-toolbar-border" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-11 w-20 rounded-lg bg-rota-toolbar-border" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-rota-toolbar-border" />
          <div className="h-8 w-72 rounded bg-rota-day-other-bg-from" />
          <div className="h-11 w-11 rounded-lg bg-rota-toolbar-border" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to p-4">
        <div className="mx-auto max-w-4xl rounded-xl border border-rota-modal-border bg-rota-modal-bg p-6 shadow-2xl">
          <div className="text-center text-rota-alert-error-text">
            <h2 className="mb-4 text-2xl font-bold text-rota-text-primary">Access Denied</h2>
            <p>You must be logged in to access Rota Planner.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-auto bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to">
      <RotaManager user={user} />
    </div>
  );
}
