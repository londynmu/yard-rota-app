import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { format as formatDate, subDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import PerformanceChart from '../components/PerformanceChart';
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

// Helper functions - defined at module level for use in callbacks
const timeToSeconds = (timeValue) => {
  if (timeValue === null || timeValue === undefined) return 0;

  // Handle if it's already a number (seconds)
  if (typeof timeValue === 'number') {
    return Number.isFinite(timeValue) ? timeValue : 0;
  }

  if (typeof timeValue !== 'string') return 0;

  const raw = timeValue.trim();
  if (!raw) return 0;

  // Support numeric strings like "90" (seconds)
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? Math.round(asNumber) : 0;
  }

  // Support "M:SS" and "HH:MM:SS"
  const parts = raw.split(':').map((p) => p.trim());
  
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
};

const secondsToTime = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const PerformanceLeaderboard = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const lastFetchTime = useRef(0);
  const [selectedRange, setSelectedRange] = useState(() => {
    if (typeof window === 'undefined') return 'last_day';
    const stored = localStorage.getItem('performance_range');
    // Validate stored value
    const validRanges = ['last_day', 'last_week', 'last_month', 'all'];
    if (stored && validRanges.includes(stored)) return stored;
    
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
    const stored = localStorage.getItem('performance_sort');
    // Validate stored value
    const validSorts = ['moves', 'collect', 'travel'];
    return (stored && validSorts.includes(stored)) ? stored : 'moves';
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
        startDate: '2000-01-01', // Extended to capture all historical data
        endDate: formatDate(today, 'yyyy-MM-dd'),
      };
    }

    const config = RANGE_LOOKUP[selectedRange] || RANGE_LOOKUP.last_day;
    const duration = config.durationDays || 1;
    const startDate = formatDate(subDays(today, duration - 1), 'yyyy-MM-dd');
    const endDate = formatDate(today, 'yyyy-MM-dd');

    return { startDate, endDate };
  }, [selectedRange]);

  // Fetch ALL leaderboard data with pagination (Supabase has 1000 row limit)
  const fetchLeaderboard = useCallback(async () => {
    // Rate limiting - minimum 2 seconds between requests
    const now = Date.now();
    if (now - lastFetchTime.current < 2000) {
      return;
    }
    lastFetchTime.current = now;

    setLoading(true);
    try {
      let allPerformanceData = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      // Fetch all data in batches
      while (hasMore) {
        let query = supabase
          .from('shunter_performance')
          .select(`
            *,
            profiles:user_id (
              id,
              first_name,
              last_name,
              yard_system_id
            )
          `);

        // Apply date filters only if not "all time"
        if (selectedRange !== 'all') {
          const dateRange = getDateRange();
          if (!dateRange) {
            toast.error('Please select a valid date range');
            setLoading(false);
            return;
          }
          const { startDate, endDate } = dateRange;
          query = query
            .gte('report_date', startDate)
            .lte('report_date', endDate);
        }

        // Add timeout for long requests
        const fetchWithTimeout = (promise, timeout = 30000) => {
          return Promise.race([
            promise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout - please try again')), timeout)
            )
          ]);
        };

        const { data: batch, error } = await fetchWithTimeout(
          query.order('report_date', { ascending: true }).range(from, from + batchSize - 1),
          30000
        );

        if (error) throw error;

        if (batch && batch.length > 0) {
          allPerformanceData = [...allPerformanceData, ...batch];
          from += batchSize;
          hasMore = batch.length === batchSize; // Continue if we got full batch
        } else {
          hasMore = false;
        }
      }

      const performanceData = allPerformanceData;

      const normalizedPerformance = normalizePerformanceRecords(performanceData);
      setRawPerformance(normalizedPerformance);

      // Aggregate data by user
      const userStats = {};
      
      normalizedPerformance.forEach(record => {
        // Validate record data
        if (!record.profiles || !record.profiles.yard_system_id || !record.user_id) {
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

      // Convert to array and calculate weighted averages with safety checks
      const leaderboard = Object.values(userStats)
        .filter(user => user.userId && user.yardSystemId) // Ensure valid users
        .map(user => ({
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
  }, [selectedRange, getDateRange, toast, sortOption]);

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
        const result = records.reduce(
          (acc, record) => {
            const moves = record.number_of_moves || 0;
            const collectSec = timeToSeconds(record.avg_time_to_collect);
            const travelSec = timeToSeconds(record.avg_time_to_travel);
            acc.moves += moves;
            acc.collectSeconds += collectSec * moves;
            acc.travelSeconds += travelSec * moves;
            acc.fullLocations += record.number_of_full_locations || 0;
            return acc;
          },
          { moves: 0, collectSeconds: 0, travelSeconds: 0, fullLocations: 0 }
        );
        return result;
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
      setMyStatsError('Failed to load your statistics.');
    } finally {
      setMyStatsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyStats();
  }, [fetchMyStats]);

  // Helper functions are defined at module level (timeToSeconds, secondsToTime)

  const getRangeLabel = (range) => {
    return RANGE_LOOKUP[range]?.label || RANGE_LOOKUP.last_day.label;
  };

  const getAverageTime = (stat, type) => {
    if (!stat) return '—';
    const normalizedType = type === 'pickup' ? 'collect' : type;
    const totalSeconds = normalizedType === 'travel' ? stat.travelSeconds : stat.collectSeconds;
    const moves = stat.moves || 0;
    
    // If no moves or no time data, show dash
    if (moves === 0 || !totalSeconds || totalSeconds === 0) return '—';
    
    return secondsToTime(Math.round(totalSeconds / moves));
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

    if (selectedRange === 'all') {
      return sortedEntries;
    }

    const rangeLimit = RANGE_LOOKUP[selectedRange]?.durationDays || 30;
    return sortedEntries.slice(-rangeLimit);
  }, [rawPerformance, selectedRange]);

  const toggleExpandedUser = useCallback((userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  // Memoize ranked data to avoid recalculation on every render
  const rankedLeaderboardData = useMemo(() => {
    return leaderboardData.map((user, index) => ({
      ...user,
      rank: index + 1
    }));
  }, [leaderboardData]);

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
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Stats Grid - Compact 3 columns */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-2 text-center bg-gray-50">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Moves</p>
            <p className="text-lg font-bold text-charcoal">{user.totalMoves.toLocaleString()}</p>
          </div>
          <div className="p-2 text-center bg-gray-50">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Per Day</p>
            <p className="text-lg font-bold text-charcoal">{movesPerDay}</p>
          </div>
          <div className="p-2 text-center bg-gray-50">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Days</p>
            <p className="text-lg font-bold text-charcoal">{user.daysWorked}</p>
          </div>
        </div>
        
        {/* Times Row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Collect</p>
            <p className="text-lg font-bold text-charcoal">{user.avgCollectTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Travel</p>
            <p className="text-lg font-bold text-charcoal">{user.avgTravelTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-gray-500 font-medium">Full Loc</p>
            <p className="text-lg font-bold text-charcoal">{(user.totalFullLocations || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Tags - Inline */}
        {tags.length > 0 && (
          <div className="px-2 py-1.5 border-t border-gray-100 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={`${user.userId}-${tag}`}
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Sticky Badge Header (jak w My Rota) */}
      <div className="sticky top-0 z-30 bg-slate-200 border-b border-gray-300 pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setShowRangeModal(true)}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-slate-300 bg-slate-50 text-slate-700 text-sm font-semibold shadow-lg hover:bg-slate-100 transition-colors whitespace-nowrap w-full"
            >
              {getRangeLabel(selectedRange)}
            </button>
            <button
              onClick={() => setShowSortModal(true)}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-slate-300 bg-slate-50 text-slate-700 text-sm font-semibold shadow-lg hover:bg-slate-100 transition-colors whitespace-nowrap w-full"
            >
              Sort
            </button>
            <button
              onClick={() => {
                if (!user) {
                  toast.error('Please log in to view your statistics');
                  return;
                }
                setShowMyStatsModal(true);
              }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-slate-300 bg-slate-50 text-slate-700 text-sm font-semibold shadow-lg hover:bg-slate-100 transition-colors whitespace-nowrap w-full"
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

      {/* My Stats Modal - Compact Version */}
      {showMyStatsModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3 py-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">My Stats</h3>
              <button
                onClick={() => setShowMyStatsModal(false)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Close my stats modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3 space-y-3 max-h-[75vh] overflow-y-auto">
              {myStatsLoading ? (
                <div className="space-y-3 animate-pulse py-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-slate-100 rounded-lg p-3 h-16" />
                  ))}
                </div>
              ) : myStatsError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {myStatsError}
                </div>
              ) : !myStatsData ? (
                <div className="text-center text-gray-500 text-sm py-6">
                  No performance data found for your account.
                </div>
              ) : (
                <>
                  {/* Latest Day - Hero Card */}
                  <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl p-3 text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Latest Day</span>
                      <span className="text-xs font-medium opacity-90">
                        {myStatsData.latestDate
                          ? formatDate(parseISO(myStatsData.latestDate), 'EEE, dd MMM')
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-black">{(myStatsData.lastDay?.moves || 0).toLocaleString()}</p>
                        <p className="text-[10px] uppercase opacity-80">moves</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[10px] uppercase opacity-70">Collect</span>
                          <span className="text-sm font-bold">{getAverageTime(myStatsData.lastDay, 'collect')}</span>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[10px] uppercase opacity-70">Travel</span>
                          <span className="text-sm font-bold">{getAverageTime(myStatsData.lastDay, 'travel')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rolling Stats - Compact Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                      <p className="text-[10px] uppercase text-blue-600 font-semibold">Last 7 Days</p>
                      <p className="text-xl font-bold text-blue-700">{(myStatsData.last7?.moves || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                      <p className="text-[10px] uppercase text-blue-600 font-semibold">Last 30 Days</p>
                      <p className="text-xl font-bold text-blue-700">{(myStatsData.last30?.moves || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* All Time Stats - Table Style */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 border-b border-slate-200">
                      <p className="text-[10px] uppercase text-slate-600 font-bold tracking-wide">All Time Stats</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-600">Total Moves</span>
                        <span className="text-sm font-bold text-slate-800">{(myStatsData.overall?.moves || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-600">Avg Collect Time</span>
                        <span className="text-sm font-bold text-slate-800">{getAverageTime(myStatsData.overall, 'collect')}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-600">Avg Travel Time</span>
                        <span className="text-sm font-bold text-slate-800">{getAverageTime(myStatsData.overall, 'travel')}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-600">Full Locations</span>
                        <span className="text-sm font-bold text-slate-800">{(myStatsData.overall?.fullLocations || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-600">Days Logged</span>
                        <span className="text-sm font-bold text-slate-800">{myStatsData.daysLogged}</span>
                      </div>
                    </div>
                  </div>

                  {/* Best Day - Highlight */}
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-3 text-white flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase opacity-80 font-semibold">Personal Best</p>
                      <p className="text-xl font-bold">{myStatsData.bestDay.moves.toLocaleString()} moves</p>
                    </div>
                    {myStatsData.bestDay.date && (
                      <div className="text-right">
                        <p className="text-xs opacity-80">on</p>
                        <p className="text-sm font-semibold">
                          {formatDate(parseISO(myStatsData.bestDay.date), 'dd MMM yyyy')}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4 md:py-6">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {/* Team Overview Skeleton */}
            <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <div className="h-6 bg-slate-300 rounded w-40" />
                <div className="h-8 w-8 bg-slate-300 rounded-full" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-100 rounded-lg p-4">
                  <div className="h-4 bg-slate-300 rounded w-24 mb-2" />
                  <div className="h-8 bg-slate-300 rounded w-16" />
                </div>
                <div className="bg-slate-100 rounded-lg p-4">
                  <div className="h-4 bg-slate-300 rounded w-28 mb-2" />
                  <div className="h-8 bg-slate-300 rounded w-20" />
                </div>
                <div className="bg-slate-100 rounded-lg p-4">
                  <div className="h-4 bg-slate-300 rounded w-32 mb-2" />
                  <div className="h-8 bg-slate-300 rounded w-20" />
                </div>
              </div>
            </div>

            {/* Leaderboard Items Skeleton */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-lg p-4 border-2 border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-300 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-slate-300 rounded w-40" />
                    <div className="h-4 bg-slate-200 rounded w-60" />
                  </div>
                  <div className="h-8 w-8 bg-slate-300 rounded-full" />
                </div>
              </div>
            ))}
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
                    ? 'rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border-2 border-slate-300' 
                    : 'rounded-full bg-gradient-to-r from-slate-400 to-slate-300'
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
                      <motion.p layout className={`font-bold text-sm ${teamOverviewExpanded ? 'text-charcoal' : 'text-white'}`}>
                        Team Overview
                      </motion.p>
                      {!teamOverviewExpanded && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-white text-xs"
                        >
                          {leaderboardData.length} active shunters
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <motion.svg 
                    className={`w-5 h-5 flex-shrink-0 ${teamOverviewExpanded ? 'text-charcoal' : 'text-white'}`} 
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
                        <div className="flex items-center justify-between py-2 border-b border-slate-300">
                          <span className="text-sm text-slate-700">Active shunters</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.activeShunters}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-300">
                          <span className="text-sm text-slate-700">Total moves</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.totalMoves.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-300">
                          <span className="text-sm text-slate-700">Avg moves / day</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.avgMovesPerDay.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-300">
                          <span className="text-sm text-slate-700">Total full locations</span>
                          <span className="text-lg font-bold text-charcoal">{teamHighlights.totalFullLocations.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-slate-700">Top performer</span>
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
              <PerformanceChart data={trendSeries} isAllTime={selectedRange === 'all'} />
            </section>

            {/* Detailed list - Floating cards */}
            <section>
              <div className="flex items-end justify-between mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Detailed view</p>
                <p className="text-sm text-gray-500">Tap card for details</p>
              </div>
              <div className="space-y-3">
                {/* Floating Cards - Unified Design */}
                {rankedLeaderboardData.map((user) => {
                  const isExpanded = expandedUserId === user.userId;
                  const cardBgClass = getRowBackgroundClass(user.rank);
                  return (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: user.rank * 0.03 }}
                      whileHover={{ y: -2, boxShadow: "0 8px 20px rgba(0,0,0,0.12)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleExpandedUser(user.userId)}
                      className={`${cardBgClass} rounded-2xl border-2 p-4 shadow-md cursor-pointer transition-all`}
                    >
                      {/* Header Row */}
                      <div className="flex items-center gap-3">
                        <div className="scale-90">
                          {getRankBadge(user.rank)}
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



