import React, { useState } from 'react';
import { motion } from 'motion/react';
import PreCheckReminderModern from './PreCheckReminderModern';
import CalendarGridModern from './CalendarGridModern';
import ShunterMonthCardModern from './ShunterMonthCardModern';
import { Calendar as CalendarIcon, TrendingUp, Users } from 'lucide-react';

/**
 * Modern Demo Page
 * Pokazuje wszystkie zmodernizowane komponenty
 * z nowym design systemem
 */
export default function ModernDemoPage() {
  const [currentDate] = useState(new Date(2026, 2, 22)); // March 22, 2026

  // Example calendar data
  const dayData = {
    '2026-03-01': { status: 'holiday' as const },
    '2026-03-02': { status: 'available' as const },
    '2026-03-03': { status: 'available' as const },
    '2026-03-04': { status: 'unavailable' as const },
    '2026-03-05': { status: 'unavailable' as const },
    '2026-03-06': { status: 'available' as const },
    '2026-03-07': { status: 'available' as const },
    '2026-03-08': { status: 'available' as const },
    '2026-03-09': { status: 'available' as const },
    '2026-03-10': { status: 'available' as const },
    '2026-03-11': { status: 'unavailable' as const },
    '2026-03-12': { status: 'unavailable' as const },
    '2026-03-13': { status: 'available' as const },
    '2026-03-14': { status: 'available' as const },
    '2026-03-15': { status: 'available' as const },
    '2026-03-16': { status: 'available' as const },
    '2026-03-17': { status: 'available' as const },
    '2026-03-18': { status: 'unavailable' as const },
    '2026-03-19': { status: 'unavailable' as const },
    '2026-03-20': { status: 'available' as const },
    '2026-03-21': { status: 'available' as const },
    '2026-03-22': { status: 'available' as const, comment: 'Today!' },
    '2026-03-23': { status: 'available' as const },
    '2026-03-24': { status: 'available' as const },
    '2026-03-25': { status: 'unavailable' as const },
    '2026-03-26': { status: 'unavailable' as const },
    '2026-03-27': { status: 'available' as const },
    '2026-03-28': { status: 'available' as const },
    '2026-03-29': { status: 'available' as const },
    '2026-03-30': { status: 'available' as const },
    '2026-03-31': { status: 'available' as const },
  };

  const handleDayClick = (day: Date, dayInfo?: any) => {
    console.log('Day clicked:', day, dayInfo);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/60 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                <CalendarIcon className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">Modern Rota System</h1>
                <p className="text-xs text-slate-600">Redesigned with love ✨</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                Sign Out
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* PreCheck Reminder */}
        <PreCheckReminderModern />

        {/* Shunter of the Month */}
        <ShunterMonthCardModern />

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Stat Card 1 */}
          <div className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-emerald-600" strokeWidth={2} />
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-700 border border-emerald-200/60">+12%</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-1">156</h3>
            <p className="text-sm text-slate-600">Active Users</p>
          </div>

          {/* Stat Card 2 */}
          <div className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-blue-600" strokeWidth={2} />
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm bg-gradient-to-br from-blue-50 to-cyan-50 text-blue-700 border border-blue-200/60">Today</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-1">24</h3>
            <p className="text-sm text-slate-600">Shifts Scheduled</p>
          </div>

          {/* Stat Card 3 */}
          <div className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" strokeWidth={2} />
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 border border-slate-200/60">98%</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-1">4.8</h3>
            <p className="text-sm text-slate-600">Avg Performance</p>
          </div>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-4"
        >
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300/50 rounded" />
              <span className="text-slate-700">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-300/50 rounded" />
              <span className="text-slate-700">Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-300/50 rounded" />
              <span className="text-slate-700">Holiday</span>
            </div>
          </div>
        </motion.div>

        {/* Calendar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-800">March 2026</h2>
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </div>
            </div>

            <CalendarGridModern
              currentDate={currentDate}
              dayData={dayData}
              onDayClick={handleDayClick}
              isLoading={false}
            />
          </div>
        </motion.div>

        {/* Bottom Section - Modern UI Showcase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white/80 backdrop-blur-lg border border-slate-200/60 rounded-2xl shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-slate-800 mb-4">No Active Breaks</h3>
          <p className="text-sm text-slate-600 text-center py-8">
            All employees are currently working. No breaks scheduled.
          </p>
        </motion.div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center py-8"
        >
          <p className="text-sm text-slate-500">
            Modern Design System • Built with Motion & Tailwind v4
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Spójne kolory • Płynne animacje • Szybka wydajność ⚡
          </p>
        </motion.div>
      </main>
    </div>
  );
}