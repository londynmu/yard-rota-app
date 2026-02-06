import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { getShiftWindow } from '../../pages/PreCheckPage';

export default function PreCheckReminder() {
  const { user } = useAuth();
  const [needsPreCheck, setNeedsPreCheck] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkIfNeeded();
  }, [user]);

  const checkIfNeeded = async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

      // 1. Get user's shifts (today + yesterday for night shifts)
      const { data: shifts, error: shiftError } = await supabase
        .from('scheduled_rota')
        .select('start_time, end_time, shift_type, date')
        .eq('user_id', user.id)
        .in('date', [today, yesterday])
        .order('date', { ascending: false });

      if (shiftError || !shifts || shifts.length === 0) return;

      // 2. Calculate shift window
      const sw = getShiftWindow(shifts, now);
      if (!sw || now > sw.end) return; // No active shift or shift ended

      // 3. Check if user already has a pre-shift check in this window
      const { data: existingCheck, error: checkError } = await supabase
        .from('precheck_submissions')
        .select('id')
        .eq('user_id', user.id)
        .eq('check_type', 'pre_shift')
        .gte('check_time', sw.start.toISOString())
        .lte('check_time', sw.end.toISOString())
        .limit(1)
        .maybeSingle();

      if (checkError) return;

      // If has shift but no precheck, show reminder
      if (!existingCheck) {
        setNeedsPreCheck(true);
      }
    } catch (err) {
      console.error('[PreCheckReminder] Error:', err);
    }
  };

  if (!needsPreCheck || dismissed) return null;

  return (
    <div className="mx-4 mt-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 shadow-md">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-amber-800 text-sm">Tug PreCheck Required</h3>
          <p className="text-xs text-amber-700 mt-0.5">
            You have a shift today. Please complete your daily tug inspection before starting work.
          </p>
          <div className="flex gap-2 mt-3">
            <Link
              to="/precheck"
              className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors"
            >
              Start PreCheck
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-2 text-xs text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
