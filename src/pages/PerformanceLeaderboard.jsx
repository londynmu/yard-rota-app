import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { format as formatDate, subDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ui/ToastContext';
import { useAuth } from '../lib/AuthContext';

const RANGE_OPTIONS = [
  { value: 'last_day', label: 'Last Day', durationDays: 1 },
  { value: 'last_week', label: 'Last Week', durationDays: 7 },
  { value: 'last_month', label: 'Last Month', durationDays: 30 },
  { value: 'all', label: 'All Time' },
];

const RANGE_LOOKUP = RANGE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option;
  return acc;
}, {});

const SORT_OPTIONS = [
  { value: 'moves', label: 'Total Moves' },
  { value: 'collect', label: 'Avg Collect Time' },
  { value: 'travel', label: 'Avg Travel Time' },
];

const normalizePerformanceRecords = (records) => {
  return (records || []).map((record) => {
    if (!record.report_date) {
      return { ...record, actual_date: null, actual_date_obj: null };
    }
    const reportDateObj = parseISO(record.report_date);
    const actualDateObj = subDays(reportDateObj, 1);
    return {
      ...record,
      actual_date_obj: actualDateObj,
      actual_date: formatDate(actualDateObj, 'yyyy-MM-dd'),
    };
  });
};

const PerformanceLeaderboard = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [selectedRange, setSelectedRange] = useState(() => {
    if (typeof window === 'undefined') return 'last_day';
    const stored = localStorage.getItem('performance_range');
    if (stored) return stored;
    const legacy = localStorage.getItem('performance_period');
    switch (legacy) {
      case 'today':
        return 'last_day';
      case 'week':
        return 'last_week';
      case 'month':
        return 'last_month';
      case 'all':
        return 'all';
      default:
        return 'last_day';
    }
  });
  const [sortOption, setSortOption] = useState(() => {
    if (typeof window === 'undefined') return 'moves';
    return localStorage.getItem('performance_sort') || 'moves';
  });
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showMyStatsModal, setShowMyStatsModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [myStatsLoading, setMyStatsLoading] = useState(false);
  const [teamOverviewExpanded, setTeamOverviewExpanded] = useState(false);
  const [myStatsError, setMyStatsError] = useState(null);
  const [myStatsData, setMyStatsData] = useState(null);
  const [rawPerformance, setRawPerformance] = useState([]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('performance_range', selectedRange);
  }, [selectedRange]);

  useEffect(() => {
    localStorage.setItem('performance_sort', sortOption);
  }, [sortOption]);

  // Calculate date range based on selected range (rolling windows)
  const getDateRange = useCallback(() => {
    const today = new Date();
    if (selectedRange === 'all') {
      return {
        startDate: '2020-01-01',
        endDate: formatDate(today, 'yyyy-MM-dd'),
      };
    }

    const config = RANGE_LOOKUP[selectedRange] || RANGE_LOOKUP.last_day;
    const duration = config.durationDays || 1;
    const startDate = formatDate(subDays(today, duration - 1), 'yyyy-MM-dd');
    const endDate = formatDate(today, 'yyyy-MM-dd');

    return { startDate, endDate };
  }, [selectedRange]);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      if (!dateRange) {
        toast.error('Please select a valid date range');
        setLoading(false);
        return;
      }

      const { startDate, endDate } = dateRange;

      // Fetch performance data with user profiles
      const { data: performanceData, error } = await supabase
        .from('shunter_performance')
        .select(`
          *,
          profiles:user_id (
            id,
            first_name,
            last_name,
            avatar_url,
            yard_system_id
          )
        `)
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false });

      if (error) throw error;

      const normalizedPerformance = normalizePerformanceRecords(performanceData);
      setRawPerformance(normalizedPerformance);

      // Aggregate data by user
      const userStats = {};
      
      normalizedPerformance.forEach(record => {
        if (!record.profiles || !record.profiles.yard_system_id) {
          // Skip users without yard_system_id
          return;
        }

        const userId = record.user_id;
        
        if (!userStats[userId]) {
          userStats[userId] = {
            userId,
            firstName: record.profiles.first_name,
            lastName: record.profiles.last_name,
            avatarUrl: record.profiles.avatar_url,
            yardSystemId: record.profiles.yard_system_id,
            totalMoves: 0,
            totalCollectSeconds: 0,
            totalTravelSeconds: 0,
            totalFullLocations: 0,
            daysWorked: 0
          };
        }

        userStats[userId].totalMoves += record.number_of_moves || 0;
        userStats[userId].totalCollectSeconds += timeToSeconds(record.avg_time_to_collect) * (record.number_of_moves || 0);
        userStats[userId].totalTravelSeconds += timeToSeconds(record.avg_time_to_travel) * (record.number_of_moves || 0);
        userStats[userId].totalFullLocations += record.number_of_full_locations || 0;
        userStats[userId].daysWorked += 1;
      });

      // Convert to array and calculate weighted averages
      const leaderboard = Object.values(userStats).map(user => ({
        ...user,
        avgCollectTime: user.totalMoves > 0
          ? secondsToTime(Math.round(user.totalCollectSeconds / user.totalMoves))
          : '0:00',
        avgTravelTime: user.totalMoves > 0
          ? secondsToTime(Math.round(user.totalTravelSeconds / user.totalMoves))
          : '0:00',
        avgCollectSeconds: user.totalMoves > 0
          ? Math.round(user.totalCollectSeconds / user.totalMoves)
          : 0
      }));

      // Sort by total moves (descending), then by avg collect time (ascending)
      leaderboard.forEach(user => {
        user.avgTravelSeconds = user.totalMoves > 0
          ? Math.round(user.totalTravelSeconds / user.totalMoves)
          : 0;
      });

      leaderboard.sort((a, b) => {
        switch (sortOption) {
          case 'collect':
            // Users with 0 moves should rank last
            if (a.totalMoves === 0 && b.totalMoves === 0) return 0;
            if (a.totalMoves === 0) return 1; // a ranks after b
            if (b.totalMoves === 0) return -1; // b ranks after a
            
            // Both have moves - compare collect times
            if (a.avgCollectSeconds !== b.avgCollectSeconds) {
              return a.avgCollectSeconds - b.avgCollectSeconds;
            }
            return b.totalMoves - a.totalMoves;
          case 'travel':
            // Users with 0 moves should rank last
            if (a.totalMoves === 0 && b.totalMoves === 0) return 0;
            if (a.totalMoves === 0) return 1; // a ranks after b
            if (b.totalMoves === 0) return -1; // b ranks after a
            
            // Both have moves - compare travel times
            if (a.avgTravelSeconds !== b.avgTravelSeconds) {
              return a.avgTravelSeconds - b.avgTravelSeconds;
            }
            return b.totalMoves - a.totalMoves;
          default:
            if (b.totalMoves !== a.totalMoves) {
              return b.totalMoves - a.totalMoves;
            }
            return a.avgCollectSeconds - b.avgCollectSeconds;
        }
      });

      setLeaderboardData(leaderboard);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setRawPerformance([]);
      toast.error('Failed to load leaderboard data');
    } finally {
      setLoading(false);
    }
  }, [getDateRange, toast, sortOption]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const fetchMyStats = useCallback(async () => {
    if (!user) {
      setMyStatsData(null);
      return;
    }

    setMyStatsLoading(true);
    setMyStatsError(null);

    try {
      const { data, error } = await supabase
        .from('shunter_performance')
        .select('report_date, number_of_moves, avg_time_to_collect, avg_time_to_travel, number_of_full_locations')
        .eq('user_id', user.id)
        .order('report_date', { ascending: false });

      if (error) throw error;

      const normalizedData = normalizePerformanceRecords(data);

      if (!normalizedData || normalizedData.length === 0) {
        setMyStatsData(null);
        return;
      }

      const aggregate = (records) => {
        return records.reduce(
          (acc, record) => {
            const moves = record.number_of_moves || 0;
            acc.moves += moves;
            acc.collectSeconds += timeToSeconds(record.avg_time_to_collect) * moves;
            acc.travelSeconds += timeToSeconds(record.avg_time_to_travel) * moves;
            acc.fullLocations += record.number_of_full_locations || 0;
            return acc;
          },
          { moves: 0, collectSeconds: 0, travelSeconds: 0, fullLocations: 0 }
        );
      };

      const latestDate = normalizedData[0].actual_date;
      const latestDateObj = normalizedData[0].actual_date_obj || new Date();

      const lastDayRecords = normalizedData.filter((record) => record.actual_date === latestDate);
      const last7Start = formatDate(subDays(latestDateObj, 6), 'yyyy-MM-dd');
      const last30Start = formatDate(subDays(latestDateObj, 29), 'yyyy-MM-dd');

      const last7Records = normalizedData.filter((record) => record.actual_date && record.actual_date >= last7Start);
      const last30Records = normalizedData.filter((record) => record.actual_date && record.actual_date >= last30Start);

      const bestDayRecord = normalizedData.reduce((best, record) => {
        const moves = record.number_of_moves || 0;
        if (!best || moves > (best.number_of_moves || 0)) {
          return record;
        }
        return best;
      }, null);

      const overall = aggregate(normalizedData);

      setMyStatsData({
        latestDate,
        lastDay: aggregate(lastDayRecords),
        last7: aggregate(last7Records),
        last30: aggregate(last30Records),
        overall,
        daysLogged: data.length,
        bestDay: {
          moves: bestDayRecord?.number_of_moves || 0,
          date: bestDayRecord?.actual_date || null,
        },
      });
    } catch (err) {
      console.error('Error fetching personal stats:', err);
      setMyStatsError('Nie udało się wczytać Twoich statystyk.');
    } finally {
      setMyStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyStats();
  }, [fetchMyStats]);

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


  const getRangeLabel = (range) => {
    return RANGE_LOOKUP[range]?.label || RANGE_LOOKUP.last_day.label;
  };

  const getAverageTime = (stat, type) => {
    if (!stat || !stat.moves) return '0:00';
    const totalSeconds = type === 'collect' ? stat.collectSeconds : stat.travelSeconds;
    if (!totalSeconds) return '0:00';
    return secondsToTime(Math.round(totalSeconds / stat.moves));
  };


  const teamHighlights = useMemo(() => {
    if (!leaderboardData.length) {
      return {
        avgMovesPerDay: 0,
        totalMoves: 0,
        totalFullLocations: 0,
        activeShunters: 0,
        fastestCollect: null,
        fastestTravel: null,
        reliabilityLeader: null,
      };
    }

    const totalMoves = leaderboardData.reduce((sum, user) => sum + (user.totalMoves || 0), 0);
    const totalDays = leaderboardData.reduce((sum, user) => sum + (user.daysWorked || 0), 0);
    const totalFullLocations = leaderboardData.reduce((sum, user) => sum + (user.totalFullLocations || 0), 0);

    const sortedByCollect = [...leaderboardData]
      .filter((user) => user.avgCollectSeconds > 0)
      .sort((a, b) => a.avgCollectSeconds - b.avgCollectSeconds);

    const sortedByTravel = [...leaderboardData]
      .filter((user) => user.avgTravelSeconds > 0)
      .sort((a, b) => a.avgTravelSeconds - b.avgTravelSeconds);

    const reliabilityLeader = [...leaderboardData]
      .filter((user) => user.daysWorked > 0)
      .sort((a, b) => b.daysWorked - a.daysWorked)[0] || null;

    return {
      avgMovesPerDay: totalDays > 0 ? Math.round(totalMoves / totalDays) : 0,
      totalMoves,
      totalFullLocations,
      activeShunters: leaderboardData.length,
      fastestCollect: sortedByCollect[0] || null,
      fastestTravel: sortedByTravel[0] || null,
      reliabilityLeader,
    };
  }, [leaderboardData]);

  const trendSeries = useMemo(() => {
    if (!rawPerformance.length) return [];

    const totalsByDate = rawPerformance.reduce((acc, record) => {
      if (!record.actual_date) return acc;
      const moves = record.number_of_moves || 0;
      acc[record.actual_date] = (acc[record.actual_date] || 0) + moves;
      return acc;
    }, {});

    const sortedEntries = Object.entries(totalsByDate)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([date, totalMoves]) => ({ date, totalMoves }));

    const rangeLimit = RANGE_LOOKUP[selectedRange]?.durationDays || 30;
    const maxPoints = selectedRange === 'all'
      ? Math.min(sortedEntries.length, 60)
      : rangeLimit;

    return sortedEntries.slice(-maxPoints);
  }, [rawPerformance, selectedRange]);

  const toggleExpandedUser = (userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  const getRankBadge = (rank) => {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white border-2 border-gray-300 font-bold text-charcoal shadow-sm">
        {rank}
      </div>
    );
  };

  const getRowBackgroundClass = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-br from-yellow-100 via-amber-50 to-yellow-100 border-amber-300';
      case 2:
        return 'bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200 border-gray-300';
      case 3:
        return 'bg-gradient-to-br from-orange-100 via-amber-50 to-orange-100 border-orange-300';
      default:
        // Subtle alternating colors for other ranks
        return rank % 2 === 0 
          ? 'bg-blue-50 border-blue-200' 
          : 'bg-green-50 border-green-200';
    }
  };

  const getPerformanceTags = (user) => {
    const tags = [];
    if (user.avgCollectSeconds && user.avgCollectSeconds < 150) {
      tags.push('Fast collector');
    }
    if (user.avgTravelSeconds && user.avgTravelSeconds < 200) {
      tags.push('Quick travel');
    }
    if (user.daysWorked >= 5) {
      tags.push('Consistent');
    }
    if (user.totalFullLocations >= 20) {
      tags.push('Full locations pro');
    }
    if (!tags.length) {
      tags.push('Solid contributor');
    }
    return tags;
  };

  const formatShunterName = (user) => {
    if (!user) return '—';
    const first =
      user.firstName ??
      user.first_name ??
      '';
    const last =
      user.lastName ??
      user.last_name ??
      '';
    const yardId =
      user.yardSystemId ??
      user.yard_system_id ??
      user.yardSystemIdFromReport ??
      '';
    const name = `${first} ${last}`.trim();
    return name || yardId || '—';
  };

  const renderDetailPanel = (user) => {
    const movesPerDay = user.daysWorked ? (user.totalMoves / user.daysWorked).toFixed(1) : '0.0';
    const tags = getPerformanceTags(user);

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Total Moves</p>
            <p className="text-2xl font-bold text-charcoal">{user.totalMoves.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Moves / day</p>
            <p className="text-2xl font-bold text-charcoal">{movesPerDay}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Days worked</p>
            <p className="text-2xl font-bold text-charcoal">{user.daysWorked}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Avg collect</p>
            <p className="text-2xl font-bold text-charcoal">{user.avgCollectTime}</p>
            <p className="text-[10px] text-gray-500">Target: &lt; 02:00</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Avg travel</p>
            <p className="text-2xl font-bold text-charcoal">{user.avgTravelTime}</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Full locations</p>
            <p className="text-2xl font-bold text-charcoal">
              {(user.totalFullLocations || 0).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs uppercase text-gray-500 mb-2">Performance notes</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={`${user.userId}-${tag}`}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-offwhite pb-20">
      {/* Sticky Badge Header (jak w My Rota) */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-300 shadow-md pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowRangeModal(true)}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {getRangeLabel(selectedRange)}
            </button>
            <button
              onClick={() => setShowSortModal(true)}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              Sort
            </button>
            <button
              onClick={() => {
                if (!user) {
                  toast.error('Zaloguj się, aby zobaczyć swoje statystyki');
                  return;
                }
                setShowMyStatsModal(true);
              }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              My Stats
            </button>
          </div>
        </div>
      </div>

      {/* Range Modal */}
      {showRangeModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-2xl w-full max-w-sm p-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-charcoal">Select Range</h3>
              <button
                onClick={() => setShowRangeModal(false)}
                className="text-gray-500 hover:text-charcoal transition-colors"
                aria-label="Close range modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="pt-4 space-y-2">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedRange(option.value);
                    setShowRangeModal(false);
                  }}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-semibold transition-colors ${
                    selectedRange === option.value
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-charcoal border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sort Modal */}
      {showSortModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-2xl w-full max-w-sm p-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-charcoal">Sort Leaderboard</h3>
              <button
                onClick={() => setShowSortModal(false)}
                className="text-gray-500 hover:text-charcoal transition-colors"
                aria-label="Close sort modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="pt-4 space-y-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSortOption(option.value);
                    setShowSortModal(false);
                  }}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-semibold transition-colors ${
                    sortOption === option.value
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-charcoal border-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* My Stats Modal */}
      {showMyStatsModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3 py-4">
          <div className="bg-white rounded-2xl border-2 border-gray-300 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Personal view</p>
                <h3 className="text-xl font-bold text-charcoal">My Stats</h3>
              </div>
              <button
                onClick={() => setShowMyStatsModal(false)}
                className="text-gray-500 hover:text-charcoal transition-colors"
                aria-label="Close my stats modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto bg-gradient-to-b from-blue-50 to-purple-50">
              {myStatsLoading ? (
                <motion.div 
                  className="flex justify-center py-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="h-10 w-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                </motion.div>
              ) : myStatsError ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-50 border-2 border-red-300 text-red-700 rounded-xl p-4 text-sm"
                >
                  {myStatsError}
                </motion.div>
              ) : !myStatsData ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-gray-600 text-sm py-8"
                >
                  Brak zapisanych dziennych raportów dla Twojego konta.
                </motion.div>
              ) : (
                <>
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 rounded-2xl p-4 shadow-md"
                  >
                    <p className="text-xs uppercase tracking-wide text-orange-700 font-bold mb-1">Latest day</p>
                    <p className="text-sm font-semibold text-charcoal">
                      {myStatsData.latestDate
                        ? formatDate(parseISO(myStatsData.latestDate), 'EEEE, dd MMM')
                        : '—'}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-orange-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-orange-600 font-semibold">Moves</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {(myStatsData.lastDay?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Last recorded day</p>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-orange-300 bg-white p-3 space-y-1 shadow-sm"
                      >
                        <div>
                          <p className="text-[11px] uppercase text-orange-600 font-semibold">Avg Collect</p>
                          <p className="text-lg font-bold text-charcoal">
                            {getAverageTime(myStatsData.lastDay, 'collect')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase text-orange-600 font-semibold">Avg Travel</p>
                          <p className="text-lg font-bold text-charcoal">
                            {getAverageTime(myStatsData.lastDay, 'travel')}
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  </motion.section>

                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-2xl p-4 shadow-md"
                  >
                    <p className="text-xs uppercase tracking-wide text-blue-700 font-bold mb-3">
                      Rolling totals
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-blue-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-blue-600 font-semibold">Last 7 days</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {(myStatsData.last7?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Moves</p>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-blue-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-blue-600 font-semibold">Last 30 days</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {(myStatsData.last30?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Moves</p>
                      </motion.div>
                    </div>
                  </motion.section>

                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-4 shadow-md space-y-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-purple-700 font-bold">All time</p>
                    <div className="grid grid-cols-2 gap-3">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-purple-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-purple-600 font-semibold">Total moves</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {(myStatsData.overall?.moves || 0).toLocaleString()}
                        </p>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-purple-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-purple-600 font-semibold">Full locations</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {(myStatsData.overall?.fullLocations || 0).toLocaleString()}
                        </p>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-purple-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-purple-600 font-semibold">Avg collect</p>
                        <p className="text-xl font-bold text-charcoal">
                          {getAverageTime(myStatsData.overall, 'collect')}
                        </p>
                      </motion.div>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        className="rounded-xl border-2 border-purple-300 bg-white p-3 shadow-sm"
                      >
                        <p className="text-xs uppercase text-purple-600 font-semibold">Avg travel</p>
                        <p className="text-xl font-bold text-charcoal">
                          {getAverageTime(myStatsData.overall, 'travel')}
                        </p>
                      </motion.div>
                    </div>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      className="rounded-xl border-2 border-purple-300 bg-white p-3 flex items-center justify-between shadow-sm"
                    >
                      <div>
                        <p className="text-xs uppercase text-purple-600 font-semibold">Best day</p>
                        <p className="text-lg font-bold text-purple-600">
                          {myStatsData.bestDay.moves.toLocaleString()} moves
                        </p>
                        {myStatsData.bestDay.date && (
                          <p className="text-xs text-gray-500">
                            {formatDate(parseISO(myStatsData.bestDay.date), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase text-purple-600 font-semibold">Days logged</p>
                        <p className="text-lg font-bold text-charcoal">
                          {myStatsData.daysLogged}
                        </p>
                      </div>
                    </motion.div>
                  </motion.section>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4 md:py-6">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-black"></div>
          </div>
        ) : leaderboardData.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-charcoal mb-2">No Performance Data</h3>
            <p className="text-gray-600">No data available for the selected period.</p>
          </div>
        ) : (
          <>
            {/* Team overview - Collapsible */}
            <section className="mb-6">
              <motion.div
                layout
                className={`overflow-hidden shadow-lg cursor-pointer ${
                  teamOverviewExpanded 
                    ? 'rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 border-2 border-orange-200' 
                    : 'rounded-full bg-gradient-to-r from-orange-400 to-orange-300'
                }`}
                onClick={() => setTeamOverviewExpanded(!teamOverviewExpanded)}
                whileTap={{ scale: teamOverviewExpanded ? 0.99 : 0.95 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                {/* Header - Always Visible */}
                <motion.div 
                  className={`flex items-center justify-between ${teamOverviewExpanded ? 'p-4' : 'px-6 py-3'}`}
                  layout
                >
                  <div className="flex items-center gap-3">
                    <motion.span layout className={teamOverviewExpanded ? 'text-xl' : 'text-2xl'}>
                      📊
                    </motion.span>
                    <div>
                      <motion.p layout className="text-charcoal font-bold text-sm">
                        Team Overview
                      </motion.p>
                      {!teamOverviewExpanded && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-gray-700 text-xs"
                        >
                          {leaderboardData.length} active shunters
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <motion.svg 
                    className="w-5 h-5 text-charcoal flex-shrink-0" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    animate={{ rotate: teamOverviewExpanded ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </motion.svg>
                </motion.div>

                {/* Expandable Content */}
                <AnimatePresence initial={false}>
                  {teamOverviewExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2 pointer-events-none">
                        <div className="flex items-center justify-between py-2 border-b border-orange-200">
                          <span className="text-sm text-gray-700">Active shunters</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.activeShunters}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-orange-200">
                          <span className="text-sm text-gray-700">Total moves</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.totalMoves.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-orange-200">
                          <span className="text-sm text-gray-700">Avg moves / day</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.avgMovesPerDay.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-orange-200">
                          <span className="text-sm text-gray-700">Total full locations</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.totalFullLocations.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-gray-700">Top performer</span>
                          <span className="text-lg font-bold text-charcoal">
                            {leaderboardData[0] ? formatShunterName(leaderboardData[0]) : '—'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </section>

            {/* Trend */}
            <section className="mb-8">
              <TrendChart data={trendSeries} />
            </section>

            {/* Detailed list - Floating cards */}
            <section>
              <div className="flex items-end justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Detailed view</p>
                <p className="text-sm text-gray-500">Tap card for details</p>
              </div>
              <div className="space-y-3">
                {/* Floating Cards - Unified Design */}
                {leaderboardData.map((user, index) => {
                  const rank = index + 1;
                  const isExpanded = expandedUserId === user.userId;
                  const cardBgClass = getRowBackgroundClass(rank);
                  return (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                      whileHover={{ y: -2, boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleExpandedUser(user.userId)}
                      className={`${cardBgClass} rounded-2xl border-2 p-4 shadow-md cursor-pointer transition-all`}
                    >
                      {/* Header Row */}
                      <div className="flex items-center gap-3">
                        <div className="scale-90">
                          {getRankBadge(rank)}
                        </div>
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={formatShunterName(user)}
                            className="w-12 h-12 md:w-10 md:h-10 rounded-full border-2 border-white shadow-md"
                          />
                        ) : (
                          <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-gray-400 flex items-center justify-center font-bold text-white shadow-md">
                            {user.firstName?.charAt(0)}
                            {user.lastName?.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-charcoal truncate">
                            {formatShunterName(user)}
                          </div>
                          <div className="text-xs text-gray-600 font-mono">{user.yardSystemId}</div>
                        </div>
                        <div className="text-right">
                          {sortOption === 'moves' && (
                            <>
                              <div className="text-2xl font-bold text-charcoal">{user.totalMoves}</div>
                              <div className="text-xs text-gray-600">moves</div>
                            </>
                          )}
                          {sortOption === 'collect' && (
                            <>
                              <div className="text-2xl font-bold text-charcoal">{user.avgCollectTime}</div>
                              <div className="text-xs text-gray-600">collect</div>
                            </>
                          )}
                          {sortOption === 'travel' && (
                            <>
                              <div className="text-2xl font-bold text-charcoal">{user.avgTravelTime}</div>
                              <div className="text-xs text-gray-600">travel</div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-3 overflow-hidden"
                          >
                            {renderDetailPanel(user)}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default PerformanceLeaderboard;

function TrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-gray-500">No trend data for the selected period yet.</p>
      </div>
    );
  }

  const [showBarLabels, setShowBarLabels] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      setShowBarLabels(window.innerWidth >= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Format data for Recharts
  const chartData = data.map((point) => {
    const dateObj = parseISO(point.date);
    return {
      date: point.date,
      moves: point.totalMoves,
      formattedDate: formatDate(dateObj, 'EEE dd MMM'),
      dayLabel: formatDate(dateObj, 'EEE'),
      dateLabel: formatDate(dateObj, 'dd MMM'),
    };
  });

  const renderDateTick = ({ x, y, payload }) => {
    const dayLabel = payload?.payload?.dayLabel || '';
    const dateLabel = payload?.payload?.dateLabel || '';
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={-6} textAnchor="middle" fill="#ea580c" fontSize={11} fontWeight={700}>
          {dayLabel}
        </text>
        <text x={0} y={0} dy={10} textAnchor="middle" fill="#2D2D2D" fontSize={11}>
          {dateLabel}
        </text>
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">{dataPoint.formattedDate}</p>
          <p className="text-lg font-bold text-orange-600">
            {dataPoint.moves.toLocaleString()} moves
          </p>
        </div>
      );
    }
    return null;
  };

  CustomTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.arrayOf(PropTypes.shape({
      payload: PropTypes.shape({
        formattedDate: PropTypes.string,
        moves: PropTypes.number,
      }),
    })),
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-charcoal">Daily moves trend</h3>
      </div>
      <div className="relative h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 15, left: 15, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorMoves" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ea580c" stopOpacity={0.75} />
                <stop offset="95%" stopColor="#ea580c" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateLabel"
              height={40}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={renderDateTick}
            />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(234, 88, 12, 0.1)' }} />
            <Bar
              dataKey="moves"
              fill="url(#colorMoves)"
              maxBarSize={48}
              radius={[12, 12, 0, 0]}
              label={
                showBarLabels
                  ? {
                      position: 'top',
                      fill: '#2D2D2D',
                      fontSize: 11,
                      fontWeight: 700,
                    }
                  : false
              }
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs text-gray-500 italic">Tap bar to see moves</p>
      </div>
    </div>
  );
}

TrendChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    date: PropTypes.string.isRequired,
    totalMoves: PropTypes.number.isRequired,
  })),
};



