import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { Link } from 'react-router-dom';
import { format as formatDate, subDays, startOfMonth } from 'date-fns';
import PropTypes from 'prop-types';

const PerformanceStats = ({ period = 'month' }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [hasYardId, setHasYardId] = useState(false);

  const fetchPerformanceStats = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      // First check if user has yard_system_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('yard_system_id')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (!profile || !profile.yard_system_id) {
        setHasYardId(false);
        setLoading(false);
        return;
      }

      setHasYardId(true);

      // Calculate date range
      const today = new Date();
      let startDate;
      
      switch (period) {
        case 'week':
          startDate = formatDate(subDays(today, 7), 'yyyy-MM-dd');
          break;
        case 'month':
          startDate = formatDate(startOfMonth(today), 'yyyy-MM-dd');
          break;
        case 'all':
        default:
          startDate = '2020-01-01';
          break;
      }
      
      const endDate = formatDate(today, 'yyyy-MM-dd');

      // Fetch user's performance data
      const { data: performanceData, error } = await supabase
        .from('shunter_performance')
        .select('*')
        .eq('user_id', user.id)
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false });

      if (error) throw error;

      if (!performanceData || performanceData.length === 0) {
        setStats(null);
        setLoading(false);
        return;
      }

      // Calculate aggregated stats
      let totalMoves = 0;
      let totalCollectSeconds = 0;
      let totalTravelSeconds = 0;
      let totalFullLocations = 0;
      
      performanceData.forEach(record => {
        const moves = record.number_of_moves || 0;
        totalMoves += moves;
        totalCollectSeconds += timeToSeconds(record.avg_time_to_collect) * moves;
        totalTravelSeconds += timeToSeconds(record.avg_time_to_travel) * moves;
        totalFullLocations += record.number_of_full_locations || 0;
      });

      const avgCollectTime = totalMoves > 0
        ? secondsToTime(Math.round(totalCollectSeconds / totalMoves))
        : '0:00';
      const avgTravelTime = totalMoves > 0
        ? secondsToTime(Math.round(totalTravelSeconds / totalMoves))
        : '0:00';

      // Fetch user's rank
      const { data: allPerformance, error: rankError } = await supabase
        .from('shunter_performance')
        .select('user_id, number_of_moves')
        .gte('report_date', startDate)
        .lte('report_date', endDate);

      if (rankError) throw rankError;

      // Aggregate by user
      const userTotals = {};
      (allPerformance || []).forEach(record => {
        if (!userTotals[record.user_id]) {
          userTotals[record.user_id] = 0;
        }
        userTotals[record.user_id] += record.number_of_moves || 0;
      });

      // Sort and find rank
      const sorted = Object.entries(userTotals)
        .map(([userId, moves]) => ({ userId, moves }))
        .sort((a, b) => b.moves - a.moves);

      const userRank = sorted.findIndex(item => item.userId === user.id) + 1;

      setStats({
        totalMoves,
        avgCollectTime,
        avgTravelTime,
        totalFullLocations,
        daysWorked: performanceData.length,
        rank: userRank > 0 ? userRank : null,
        totalShunters: sorted.length,
        recentRecords: performanceData.slice(0, 5) // Last 5 days
      });
    } catch (err) {
      console.error('Error fetching performance stats:', err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    fetchPerformanceStats();
  }, [fetchPerformanceStats]);

  // Helper functions
  const timeToSeconds = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const secondsToTime = (totalSeconds) => {
    if (!totalSeconds || totalSeconds <= 0) return '0:00';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getRankBadge = (rank) => {
    if (!rank) return null;
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
        </div>
      </div>
    );
  }

  if (!hasYardId) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-charcoal mb-2">Performance Stats</h3>
        <div className="text-center py-6">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-600">
            You need a Yard System ID to view performance statistics.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Please contact an administrator to add your Yard System ID to your profile.
          </p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-charcoal mb-2">Performance Stats</h3>
        <div className="text-center py-6">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-600">No performance data available yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Stats will appear once your performance reports are imported.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-charcoal">My Performance</h3>
          <Link
            to="/performance"
            className="text-sm text-black hover:underline font-medium"
          >
            View Leaderboard →
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Moves */}
          <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-3xl font-bold text-blue-700">{stats.totalMoves}</div>
            <div className="text-xs text-blue-600 mt-1">Total Moves</div>
          </div>

          {/* Rank */}
          {stats.rank && (
            <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-3xl font-bold text-amber-700">
                {getRankBadge(stats.rank)}
              </div>
              <div className="text-xs text-amber-600 mt-1">
                Rank ({stats.totalShunters} total)
              </div>
            </div>
          )}

          {/* Avg Collect Time */}
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-700">{stats.avgCollectTime}</div>
            <div className="text-xs text-green-600 mt-1">Avg Collect</div>
          </div>

          {/* Avg Travel Time */}
          <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{stats.avgTravelTime}</div>
            <div className="text-xs text-purple-600 mt-1">Avg Travel</div>
          </div>
        </div>

        {/* Recent Records */}
        {stats.recentRecords && stats.recentRecords.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-charcoal mb-3">Recent Performance</h4>
            <div className="space-y-2">
              {stats.recentRecords.map((record, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded border border-gray-200 text-sm"
                >
                  <span className="text-gray-700 font-medium">
                    {formatDate(new Date(record.report_date), 'dd/MM/yyyy')}
                  </span>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span><strong className="text-charcoal">{record.number_of_moves}</strong> moves</span>
                    <span>{record.avg_time_to_collect} collect</span>
                    <span>{record.avg_time_to_travel} travel</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Days Worked */}
        <div className="mt-4 text-center text-sm text-gray-600">
          <span className="font-semibold text-charcoal">{stats.daysWorked}</span> days worked this {period}
        </div>
      </div>
    </div>
  );
};

PerformanceStats.propTypes = {
  period: PropTypes.oneOf(['week', 'month', 'all'])
};

export default PerformanceStats;


