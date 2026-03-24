import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import { format as formatDate, subDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));
import Modal from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ui/ToastContext';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';

/** Match WeeklyRotaPage top nav — light gradients per column */
const FILTER_RANGE_CLASS =
  'flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-semibold transition-all duration-200 sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-gradient-to-r from-blue-50/95 via-white to-blue-50/70 border border-blue-200/60 shadow-sm hover:from-blue-100/90 hover:to-blue-50 hover:border-blue-300/70 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0';

const FILTER_SORT_CLASS =
  'flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-semibold transition-all duration-200 sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-gradient-to-r from-teal-50/90 via-white to-cyan-50/70 border border-teal-200/60 shadow-sm hover:from-teal-100/90 hover:to-cyan-100/70 hover:border-teal-300/70 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0';

const FILTER_SHIFT_CLASS =
  'flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-semibold transition-all duration-200 sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm text-slate-800 bg-gradient-to-r from-indigo-50/90 via-white to-violet-50/70 border border-indigo-200/60 shadow-sm hover:from-indigo-100/90 hover:to-violet-100/70 hover:border-indigo-300/70 hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 min-w-0';

const modalOptionClass = (selected) =>
  [
    'w-full px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left',
    selected
      ? 'border-slate-200/60 bg-white/90 text-charcoal shadow-sm'
      : 'border-transparent bg-white/60 text-slate-500 hover:border-slate-200/60 hover:bg-white/90 hover:text-slate-800',
  ].join(' ');

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

const MIN_DAYS_FOR_BENCHMARK = 10;
const BELOW_AVERAGE_RATIO = 0.75;
const HIGH_OUTPUT_RATIO = 1.1;
const SHIFT_ORDER = { day: 0, afternoon: 1, night: 2 };

const SORT_OPTIONS = [
  { value: 'moves', label: 'Total Moves' },
  { value: 'per_day', label: 'Per Day' },
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
    const validSorts = ['moves', 'per_day'];
    return (stored && validSorts.includes(stored)) ? stored : 'moves';
  });
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [teamOverviewExpanded, setTeamOverviewExpanded] = useState(false);
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
              yard_system_id,
              shift_preference,
              is_active
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
        // Validate record data and skip inactive users
        if (!record.profiles || !record.profiles.yard_system_id || !record.user_id) {
          return;
        }
        if (record.profiles.is_active === false) {
          return;
        }

        const userId = record.user_id;
        
        if (!userStats[userId]) {
          userStats[userId] = {
            userId,
            firstName: record.profiles.first_name,
            lastName: record.profiles.last_name,
            avatarUrl: normalizeAvatarStorageUrl(record.profiles.avatar_url) || record.profiles.avatar_url,
            yardSystemId: record.profiles.yard_system_id,
            shiftPreference: record.profiles?.shift_preference ?? null,
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

      // Sort is done in rankedLeaderboardData useMemo (pipeline)
      leaderboard.forEach(user => {
        user.avgTravelSeconds = user.totalMoves > 0
          ? Math.round(user.totalTravelSeconds / user.totalMoves)
          : 0;
      });

      setLeaderboardData(leaderboard);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setRawPerformance([]);
      toast.error('Failed to load leaderboard data');
    } finally {
      setLoading(false);
    }
  }, [selectedRange, getDateRange, toast]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Helper functions are defined at module level (timeToSeconds, secondsToTime)

  const getRangeLabel = (range) => {
    return RANGE_LOOKUP[range]?.label || RANGE_LOOKUP.last_day.label;
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

  // Pipeline: enrich, filter, sort, rank – returns { list, belowAverageCount }
  const rankedLeaderboardData = useMemo(() => {
    if (!leaderboardData.length) {
      return { list: [], belowAverageCount: 0 };
    }
    const teamAvg = teamHighlights.avgMovesPerDay || 0;

    let enriched = leaderboardData.map((user) => {
      const movesPerDay = user.daysWorked > 0 ? user.totalMoves / user.daysWorked : 0;
      const productivityRatio = teamAvg > 0 ? movesPerDay / teamAvg : null;
      const isBelowAverage =
        user.daysWorked >= MIN_DAYS_FOR_BENCHMARK &&
        (teamAvg <= 0 || productivityRatio === null || productivityRatio < BELOW_AVERAGE_RATIO);
      const isHighOutput = productivityRatio !== null && productivityRatio >= HIGH_OUTPUT_RATIO;
      return {
        ...user,
        movesPerDay,
        productivityRatio,
        isBelowAverage,
        isHighOutput,
      };
    });

    const belowAverageCount = enriched.filter((u) => u.isBelowAverage).length;

    if (shiftFilter === 'day') {
      enriched = enriched.filter((u) => u.shiftPreference === 'day');
    } else     if (shiftFilter === 'night') {
      enriched = enriched.filter((u) => u.shiftPreference === 'night' || u.shiftPreference === 'afternoon');
    }

    switch (sortOption) {
        case 'collect':
          enriched.sort((a, b) => {
            if (a.totalMoves === 0 && b.totalMoves === 0) return 0;
            if (a.totalMoves === 0) return 1;
            if (b.totalMoves === 0) return -1;
            if (a.avgCollectSeconds !== b.avgCollectSeconds) return a.avgCollectSeconds - b.avgCollectSeconds;
            return b.totalMoves - a.totalMoves;
          });
          break;
        case 'travel':
          enriched.sort((a, b) => {
            if (a.totalMoves === 0 && b.totalMoves === 0) return 0;
            if (a.totalMoves === 0) return 1;
            if (b.totalMoves === 0) return -1;
            if (a.avgTravelSeconds !== b.avgTravelSeconds) return a.avgTravelSeconds - b.avgTravelSeconds;
            return b.totalMoves - a.totalMoves;
          });
          break;
        case 'per_day':
          enriched.sort((a, b) => {
            if (b.movesPerDay !== a.movesPerDay) return b.movesPerDay - a.movesPerDay;
            return b.totalMoves - a.totalMoves;
          });
          break;
        case 'shift':
          enriched.sort((a, b) => {
            const orderA = SHIFT_ORDER[a.shiftPreference] ?? 99;
            const orderB = SHIFT_ORDER[b.shiftPreference] ?? 99;
            if (orderA !== orderB) return orderA - orderB;
            return b.totalMoves - a.totalMoves;
          });
          break;
        default:
          enriched.sort((a, b) => {
            if (b.totalMoves !== a.totalMoves) return b.totalMoves - a.totalMoves;
            return a.avgCollectSeconds - b.avgCollectSeconds;
          });
      }

    const list = enriched.map((user, index) => ({ ...user, rank: index + 1 }));
    return { list, belowAverageCount };
  }, [leaderboardData, teamHighlights, sortOption, shiftFilter]);

  const getRankBadge = (rank) => {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border-2 border-slate-200/60 font-semibold text-charcoal shadow-sm">
        {rank}
      </div>
    );
  };

  const getRowBackgroundClass = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-br from-amber-50/95 via-yellow-50/80 to-amber-50/90 border-amber-200/60';
      case 2:
        return 'bg-gradient-to-br from-slate-100 to-base-50 border-slate-200/60';
      case 3:
        return 'bg-gradient-to-br from-orange-50/90 to-amber-50/70 border-orange-200/60';
      default:
        return rank % 2 === 0
          ? 'bg-base-50/50 border-slate-200/60'
          : 'bg-white/90 border-slate-200/60';
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
      <div className="rounded-xl border border-slate-200/60 bg-white/90 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-200/60">
          <div className="p-2 text-center bg-base-50/80">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Moves</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.totalMoves.toLocaleString()}</p>
          </div>
          <div className="p-2 text-center bg-base-50/80">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Per Day</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{movesPerDay}</p>
          </div>
          <div className="p-2 text-center bg-base-50/80">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Days</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.daysWorked}</p>
          </div>
        </div>
        {user.productivityRatio != null && (
          <div className="px-2 py-1.5 border-t border-slate-200/60 bg-base-50/50">
            <p className="text-sm text-slate-600 text-center">
              Vs team avg: {Math.round(user.productivityRatio * 100)}%
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 divide-x divide-slate-200/60 border-t border-slate-200/60">
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Collect</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.avgCollectTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Travel</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.avgTravelTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className="text-[10px] uppercase text-slate-500 font-medium">Full Loc</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">
              {(user.totalFullLocations || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="px-2 py-1.5 border-t border-slate-200/60 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={`${user.userId}-${tag}`}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-base-100 text-slate-600 border border-slate-200/60"
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
    <div className="min-h-screen bg-transparent">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 pt-safe">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-3.5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full">
            <button
              type="button"
              onClick={() => setShowRangeModal(true)}
              className={FILTER_RANGE_CLASS}
            >
              <span className="min-w-0 truncate text-left text-[10px] sm:text-xs">{getRangeLabel(selectedRange)}</span>
            </button>
            <button type="button" onClick={() => setShowSortModal(true)} className={FILTER_SORT_CLASS}>
              Sort
            </button>
            <button type="button" onClick={() => setShowShiftModal(true)} className={FILTER_SHIFT_CLASS}>
              <span className="min-w-0 truncate text-left text-[10px] sm:text-xs">
                Shift: {shiftFilter === 'all' ? 'All' : shiftFilter === 'day' ? 'Day' : 'Night'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {(() => {
        const d = new Date();
        const h = d.getHours();
        const m = d.getMinutes();
        const showNextReportAt0630 = h < 6 || (h === 6 && m < 30);
        return showNextReportAt0630 ? (
          <div className="border-b border-slate-200/60 bg-base-50/80 backdrop-blur-sm px-4 py-2 text-center">
            <p className="text-sm text-slate-700 font-medium">Next report will be available at 06:30.</p>
          </div>
        ) : null;
      })()}

      <Modal isOpen={showRangeModal} onClose={() => setShowRangeModal(false)} className="!p-0 max-w-sm overflow-hidden rounded-2xl border-slate-200/60 shadow-strong">
        <div className="p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <h3 className="text-lg font-bold text-charcoal">Select Range</h3>
            <button
              type="button"
              onClick={() => setShowRangeModal(false)}
              className="text-slate-500 hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
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
                type="button"
                onClick={() => {
                  setSelectedRange(option.value);
                  setShowRangeModal(false);
                }}
                className={modalOptionClass(selectedRange === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={showSortModal} onClose={() => setShowSortModal(false)} className="!p-0 max-w-sm overflow-hidden rounded-2xl border-slate-200/60 shadow-strong">
        <div className="p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <h3 className="text-lg font-bold text-charcoal">Sort Leaderboard</h3>
            <button
              type="button"
              onClick={() => setShowSortModal(false)}
              className="text-slate-500 hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
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
                type="button"
                onClick={() => {
                  setSortOption(option.value);
                  setShowSortModal(false);
                }}
                className={modalOptionClass(sortOption === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={showShiftModal} onClose={() => setShowShiftModal(false)} className="!p-0 max-w-sm overflow-hidden rounded-2xl border-slate-200/60 shadow-strong">
        <div className="p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <h3 className="text-lg font-bold text-charcoal">Shift</h3>
            <button
              type="button"
              onClick={() => setShowShiftModal(false)}
              className="text-slate-500 hover:text-charcoal transition-colors p-1.5 rounded-lg hover:bg-slate-100"
              aria-label="Close shift modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="pt-4 space-y-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'day', label: 'Day' },
              { value: 'night', label: 'Night' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setShiftFilter(option.value);
                  setShowShiftModal(false);
                }}
                className={modalOptionClass(shiftFilter === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 md:px-6 pb-bottom-nav">
        <div className="page-content-inner">
        <h1 className="sr-only">Performance leaderboard</h1>
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="card-modern p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="h-6 bg-base-200 rounded-lg w-40" />
                <div className="h-8 w-8 bg-base-200 rounded-full" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-base-100/80 rounded-xl p-4 border border-slate-200/40">
                  <div className="h-4 bg-base-200 rounded w-24 mb-2" />
                  <div className="h-8 bg-base-200 rounded w-16" />
                </div>
                <div className="bg-base-100/80 rounded-xl p-4 border border-slate-200/40">
                  <div className="h-4 bg-base-200 rounded w-28 mb-2" />
                  <div className="h-8 bg-base-200 rounded w-20" />
                </div>
                <div className="bg-base-100/80 rounded-xl p-4 border border-slate-200/40">
                  <div className="h-4 bg-base-200 rounded w-32 mb-2" />
                  <div className="h-8 bg-base-200 rounded w-20" />
                </div>
              </div>
            </div>

            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-modern p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-base-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-base-200 rounded-lg w-40" />
                    <div className="h-4 bg-base-100 rounded-lg w-60" />
                  </div>
                  <div className="h-8 w-8 bg-base-200 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : leaderboardData.length === 0 ? (
          <div className="card-modern p-10 text-center">
            <BarChart2 className="w-14 h-14 mx-auto mb-4 text-slate-400" strokeWidth={1.5} aria-hidden />
            <h2 className="text-xl font-bold text-charcoal mb-2">No Performance Data</h2>
            <p className="text-slate-600 text-sm">No data available for the selected period.</p>
          </div>
        ) : (
          <>
            {/* Team overview - Collapsible */}
            <section className="mb-6">
              <motion.div
                layout
                className={`card-modern overflow-hidden cursor-pointer transition-shadow ${
                  teamOverviewExpanded ? 'shadow-lg' : 'shadow-md'
                }`}
                onClick={() => setTeamOverviewExpanded(!teamOverviewExpanded)}
                whileTap={{ scale: teamOverviewExpanded ? 0.99 : 0.98 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <motion.div
                  className={`flex items-center justify-between border-b border-slate-200/60 bg-gradient-to-r from-base-50 to-white ${
                    teamOverviewExpanded ? 'p-4' : 'px-4 py-3'
                  }`}
                  layout
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BarChart2
                      className={`shrink-0 ${teamOverviewExpanded ? 'w-6 h-6 text-blue-600' : 'w-7 h-7 text-blue-600'}`}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <motion.p layout className="font-bold text-sm text-charcoal">
                        Team Overview
                      </motion.p>
                      {!teamOverviewExpanded && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-slate-600 text-xs truncate"
                        >
                          {leaderboardData.length} active shunters
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <motion.svg
                    className="w-5 h-5 flex-shrink-0 text-charcoal"
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
                      <div className="px-4 pb-4 pt-2 space-y-2 pointer-events-none bg-white/50">
                        <div className="flex items-center justify-between py-2 border-b border-slate-200/60">
                          <span className="text-sm text-slate-700">Active shunters</span>
                          <span className="text-lg font-semibold text-charcoal tabular-nums">{teamHighlights.activeShunters}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-200/60">
                          <span className="text-sm text-slate-700">Total moves</span>
                          <span className="text-lg font-semibold text-charcoal tabular-nums">{teamHighlights.totalMoves.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-200/60">
                          <span className="text-sm text-slate-700">Avg moves / day</span>
                          <span className="text-lg font-semibold text-charcoal tabular-nums">{teamHighlights.avgMovesPerDay.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-slate-200/60">
                          <span className="text-sm text-slate-700">Total full locations</span>
                          <span className="text-lg font-semibold text-charcoal tabular-nums">{teamHighlights.totalFullLocations.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-slate-700">Top performer</span>
                          <span className="text-lg font-semibold text-charcoal truncate max-w-[55%] text-right">
                            {rankedLeaderboardData.list[0] ? formatShunterName(rankedLeaderboardData.list[0]) : '—'}
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
              <Suspense
                fallback={
                  <div className="card-modern w-full min-h-[220px] animate-pulse bg-base-50/90" aria-hidden />
                }
              >
                <PerformanceChart data={trendSeries} isAllTime={selectedRange === 'all'} />
              </Suspense>
            </section>

            <section>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-charcoal tracking-tight">Detailed view</h2>
                  {rankedLeaderboardData.list.length === 0 ? (
                    <p className="text-sm text-slate-600 mt-1">No shunters match the current filters.</p>
                  ) : (
                    <p className="text-sm text-slate-600 mt-1">
                      {rankedLeaderboardData.list.length} shunters ({rankedLeaderboardData.belowAverageCount} below average)
                    </p>
                  )}
                </div>
                <p className="text-sm text-slate-500 shrink-0">Tap card for details</p>
              </div>
              <div className="space-y-3">
                {rankedLeaderboardData.list.map((user) => {
                  const isExpanded = expandedUserId === user.userId;
                  const cardBgClass = getRowBackgroundClass(user.rank);
                  return (
                    <motion.div
                      key={user.userId}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: user.rank * 0.03 }}
                      whileHover={{ y: -1, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)' }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => toggleExpandedUser(user.userId)}
                      className={`${cardBgClass} rounded-2xl border p-4 shadow-sm cursor-pointer transition-all backdrop-blur-sm ${user.isBelowAverage ? 'border-l-4 border-l-amber-600/70' : ''}`}
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
                          <div className="w-12 h-12 md:w-10 md:h-10 rounded-full bg-slate-400 flex items-center justify-center font-semibold text-white text-sm shadow-md">
                            {user.firstName?.charAt(0)}
                            {user.lastName?.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-charcoal truncate">
                            {formatShunterName(user)}
                          </div>
                          <div className="text-xs text-slate-600 font-mono">{user.yardSystemId}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {user.shiftPreference && (
                              <span className="text-[10px] font-medium text-slate-500">
                                {user.shiftPreference === 'day' ? 'Day' : user.shiftPreference === 'afternoon' ? 'Afternoon' : 'Night'}
                              </span>
                            )}
                            {user.isBelowAverage && (
                              <span className="text-[10px] font-medium text-amber-700">Below average output</span>
                            )}
                            {user.isHighOutput && (
                              <span className="text-[10px] font-medium text-emerald-600">High output</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          {sortOption === 'moves' && (
                            <>
                              <div className="text-2xl font-semibold text-charcoal">{user.totalMoves}</div>
                              <div className="text-xs text-slate-600">moves</div>
                            </>
                          )}
                          {sortOption === 'collect' && (
                            <>
                              <div className="text-2xl font-semibold text-charcoal">{user.avgCollectTime}</div>
                              <div className="text-xs text-slate-600">collect</div>
                            </>
                          )}
                          {sortOption === 'travel' && (
                            <>
                              <div className="text-2xl font-semibold text-charcoal">{user.avgTravelTime}</div>
                              <div className="text-xs text-slate-600">travel</div>
                            </>
                          )}
                          {sortOption === 'per_day' && (
                            <>
                              <div className="text-2xl font-semibold text-charcoal">{user.movesPerDay != null ? user.movesPerDay.toFixed(1) : '—'}</div>
                              <div className="text-xs text-slate-600">per day</div>
                            </>
                          )}
                          {sortOption === 'shift' && (
                            <>
                              <div className="text-2xl font-semibold text-charcoal">
                                {user.shiftPreference === 'day' ? 'Day' : user.shiftPreference === 'afternoon' ? 'Afternoon' : user.shiftPreference === 'night' ? 'Night' : '—'}
                              </div>
                              <div className="text-xs text-slate-600">shift</div>
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
    </div>
  );
};

export default PerformanceLeaderboard;



