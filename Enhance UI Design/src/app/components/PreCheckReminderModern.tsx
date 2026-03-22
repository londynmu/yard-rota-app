import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface PreCheckReminderProps {
  userId?: string;
  // Add your supabase client and getShiftWindow function props here
}

/**
 * Modern PreCheck Reminder Component
 * Features:
 * - Smooth Motion animations
 * - Glassmorphism design
 * - Subtle gradients
 * - Better contrast & accessibility
 */
export default function PreCheckReminderModern({ userId }: PreCheckReminderProps) {
  const [needsPreCheck, setNeedsPreCheck] = useState(true); // Set to true for demo
  const [dismissed, setDismissed] = useState(false);

  // Your existing logic here...
  // useEffect(() => {
  //   if (!userId) return;
  //   checkIfNeeded();
  // }, [userId]);

  if (!needsPreCheck || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
        className="mx-4 mt-4"
      >
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-blue-50 via-white to-blue-50/50 backdrop-blur-sm border border-blue-200/60 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-shadow duration-300">
          <div className="flex items-start gap-4">
            {/* Icon Container */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 20,
                delay: 0.1,
              }}
              className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
            >
              <AlertCircle className="w-6 h-6 text-blue-600" strokeWidth={2} />
            </motion.div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <motion.h3
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
                className="font-semibold text-slate-800 text-sm mb-1"
              >
                Tug PreCheck Required
              </motion.h3>

              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xs text-slate-600 leading-relaxed"
              >
                You have a shift today. Please complete your daily tug inspection before starting work.
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex gap-2 mt-4"
              >
                <Link
                  to="/precheck"
                  className="group relative inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-medium rounded-xl shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden"
                >
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative z-10 flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" strokeWidth={2} />
                    <span>Start PreCheck</span>
                  </motion.div>
                  
                  {/* Hover Gradient Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </Link>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDismissed(true)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200"
                >
                  Later
                </motion.button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
