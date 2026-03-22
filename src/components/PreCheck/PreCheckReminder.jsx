import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

      const { data: shifts, error: shiftError } = await supabase
        .from('scheduled_rota')
        .select('start_time, end_time, shift_type, date')
        .eq('user_id', user.id)
        .in('date', [today, yesterday])
        .order('date', { ascending: false });

      if (shiftError || !shifts || shifts.length === 0) return;

      const sw = getShiftWindow(shifts, now);
      if (!sw || now > sw.end) return;

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

      if (!existingCheck) {
        setNeedsPreCheck(true);
      }
    } catch (err) {
      console.error('[PreCheckReminder] Error:', err);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {needsPreCheck && !dismissed && (
        <motion.div
          key="precheck-reminder"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-4 px-4 max-w-4xl mx-auto"
        >
          <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50/50 backdrop-blur-sm border border-blue-200/60 rounded-2xl p-5 shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 text-sm">Tug PreCheck Required</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  You have a shift today. Please complete your daily tug inspection before starting work.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link
                      to="/precheck"
                      className="inline-flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-medium rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      Start PreCheck
                    </Link>
                  </motion.div>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDismissed(true)}
                    className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
                  >
                    Later
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
