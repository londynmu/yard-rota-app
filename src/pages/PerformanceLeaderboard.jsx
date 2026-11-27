import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format as formatDate, subDays, addDays, parseISO } from 'date-fns';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BarChart2, ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
const PerformanceChart = lazy(() => import('../components/PerformanceChart'));
import Modal from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ui/ToastContext';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';
import { filterShownOnReports, isShownOnReports } from '../utils/performanceVisibility';
import { matchesPerformanceShiftFilter } from '../utils/performanceShiftFilter';
import { filterToLatestReportDate } from '../utils/latestReportDate';
import { safeLocalStorage } from '../utils/safeStorage';
import { useIsDesktop } from '../hooks/useIsDesktop';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `?date=YYYY-MM-DD` as an actual_date (work day). */
function parseActualDateParam(value) {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  const parsed = parseISO(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDate(parsed, 'yyyy-MM-dd');
}

/** Match My Rota sticky filter chips — no indigo/violet, 44px targets */
const FILTER_CHIP_BASE =
  'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none sm:gap-1.5 sm:px-2 sm:text-sm';
const FILTER_RANGE_CLASS =
  `${FILTER_CHIP_BASE} text-slate-800 bg-gradient-to-r from-blue-50/95 via-white to-blue-50/70 border-blue-200/60 shadow-sm hover:from-blue-100/90 hover:to-blue-50 hover:border-blue-300/70`;
const FILTER_SORT_CLASS =
  `${FILTER_CHIP_BASE} text-slate-800 bg-gradient-to-r from-teal-50/90 via-white to-cyan-50/70 border-teal-200/60 shadow-sm hover:from-teal-100/90 hover:to-cyan-100/70 hover:border-teal-300/70`;
const FILTER_SHIFT_CLASS =
  `${FILTER_CHIP_BASE} text-slate-800 bg-gradient-to-r from-slate-50 via-white to-slate-50/80 border-slate-200/60 shadow-sm hover:from-slate-100/90 hover:to-slate-50 hover:border-slate-300/70`;

const FILTER_OPTION_BASE =
  'w-full min-h-11 px-4 py-2.5 rounded-xl text-sm font-medium text-center border transition-colors motion-reduce:transition-none';
const FILTER_OPTION_IDLE =
  `${FILTER_OPTION_BASE} border-slate-200/60 text-slate-700 hover:bg-slate-50`;
const FILTER_OPTION_SELECTED =
  `${FILTER_OPTION_BASE} border-sky-100 bg-sky-50 text-sky-900`;
const FILTER_MODAL_CLOSE =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 motion-reduce:transition-none';
const METRIC_LABEL_CLASS = 'text-xs uppercase text-slate-500 font-medium';

const RANGE_OPTIONS = [
  // Look back a few calendar days so a late morning YMS import still fills "Last Day"
  // with the most recent report_date (filter applied after fetch).
  { value: 'last_day', label: 'Last Day', durationDays: 4 },
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
  const prefersReducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const actualDateFilter = useMemo(
    () => parseActualDateParam(searchParams.get('date')),
    [searchParams]
  );
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const lastFetchTime = useRef(0);
  const [selectedRange, setSelectedRange] = useState(() => {
    if (typeof window === 'undefined') return 'last_day';
    // Deep-link ?date= uses a single actual_date day
    if (parseActualDateParam(new URLSearchParams(window.location.search).get('date'))) {
      return 'last_day';
    }
    const stored = safeLocalStorage.getItem('performance_range');
    // Validate stored value
    const validRanges = ['last_day', 'last_week', 'last_month', 'all'];
    if (stored && validRanges.includes(stored)) return stored;
    
    const legacy = safeLocalStorage.getItem('performance_period');
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
    // Deep-link from TM Home → sort by moves
    if (parseActualDateParam(new URLSearchParams(window.location.search).get('date'))) {
      return 'moves';
    }
    const stored = safeLocalStorage.getItem('performance_sort');
    const validSorts = ['moves', 'per_day'];
    return (stored && validSorts.includes(stored)) ? stored : 'moves';
  });
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftFilter, setShiftFilter] = useState('all');
  const isDesktop = useIsDesktop();
  const [filterHost, setFilterHost] = useState(null);

  useLayoutEffect(() => {
    if (!isDesktop) {
      setFilterHost(null);
      return undefined;
    }
    setFilterHost(document.getElementById('performance-desktop-filters'));
    return undefined;
  }, [isDesktop]);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [rawPerformance, setRawPerformance] = useState([]);

  // Save preferences to localStorage
  useEffect(() => {
    safeLocalStorage.setItem('performance_range', selectedRange);
  }, [selectedRange]);

  useEffect(() => {
    safeLocalStorage.setItem('performance_sort', sortOption);
  }, [sortOption]);

  // Calculate date range based on selected range (rolling windows).
  // When ?date=YYYY-MM-DD is set, treat it as actual_date → report_date = date + 1 day.
  const getDateRange = useCallback(() => {
    if (actualDateFilter) {
      const reportDate = formatDate(
        addDays(parseISO(`${actualDateFilter}T12:00:00`), 1),
        'yyyy-MM-dd'
      );
      return { startDate: reportDate, endDate: reportDate };
    }

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
  }, [selectedRange, actualDateFilter]);

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
              show_on_reports
            )
          `);

        // Apply date filters when deep-linked or not "all time"
        if (actualDateFilter || selectedRange !== 'all') {
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

      let performanceData = allPerformanceData;
      // "Last Day" = most recent imported report day within the lookback window,
      // not necessarily calendar today (YMS mail can arrive after the 06:30 cron).
      if (!actualDateFilter && selectedRange === 'last_day') {
        performanceData = filterToLatestReportDate(performanceData);
      }

      let normalizedPerformance = normalizePerformanceRecords(performanceData);
      // Keep only the requested actual_date when deep-linked via ?date=
      if (actualDateFilter) {
        normalizedPerformance = normalizedPerformance.filter(
          (record) => record.actual_date === actualDateFilter
        );
      }
      // Hide show_on_reports=false from leaderboard list AND chart/raw totals
      normalizedPerformance = filterShownOnReports(normalizedPerformance);
      setRawPerformance(normalizedPerformance);

      // Aggregate data by user
      const userStats = {};
      
      normalizedPerformance.forEach(record => {
        // Validate record data and skip profiles hidden from reports
        if (!record.profiles || !record.profiles.yard_system_id || !record.user_id) {
          return;
        }
        if (!isShownOnReports(record.profiles)) {
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
  }, [selectedRange, getDateRange, toast, actualDateFilter]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Helper functions are defined at module level (timeToSeconds, secondsToTime)

  const getRangeLabel = (range) => {
    if (actualDateFilter) {
      try {
        return formatDate(parseISO(`${actualDateFilter}T12:00:00`), 'd MMM yyyy');
      } catch {
        return actualDateFilter;
      }
    }
    return RANGE_LOOKUP[range]?.label || RANGE_LOOKUP.last_day.label;
  };

  const clearDateParamAndSetRange = (rangeValue) => {
    setSelectedRange(rangeValue);
    if (actualDateFilter) {
      const next = new URLSearchParams(searchParams);
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
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

    // Same shift buckets as the leaderboard list (day vs night+afternoon).
    const filteredRecords = rawPerformance.filter((record) =>
      matchesPerformanceShiftFilter(record.profiles?.shift_preference, shiftFilter)
    );

    const totalsByDate = filteredRecords.reduce((acc, record) => {
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
  }, [rawPerformance, selectedRange, shiftFilter]);

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

    enriched = enriched.filter((u) =>
      matchesPerformanceShiftFilter(u.shiftPreference, shiftFilter)
    );

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
            <p className={METRIC_LABEL_CLASS}>Moves</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.totalMoves.toLocaleString()}</p>
          </div>
          <div className="p-2 text-center bg-base-50/80">
            <p className={METRIC_LABEL_CLASS}>Per Day</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{movesPerDay}</p>
          </div>
          <div className="p-2 text-center bg-base-50/80">
            <p className={METRIC_LABEL_CLASS}>Days</p>
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
            <p className={METRIC_LABEL_CLASS}>Collect</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.avgCollectTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className={METRIC_LABEL_CLASS}>Travel</p>
            <p className="text-lg font-semibold text-charcoal tabular-nums">{user.avgTravelTime}</p>
          </div>
          <div className="p-2 text-center">
            <p className={METRIC_LABEL_CLASS}>Full Loc</p>
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
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-base-100 text-slate-600 border border-slate-200/60"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sortFilterLabel = SORT_OPTIONS.find((option) => option.value === sortOption)?.label || 'Total Moves';
  const shiftFilterLabel = shiftFilter === 'day' ? 'Day' : shiftFilter === 'night' ? 'Night' : 'All';
  const desktopFilterPortal = filterHost ? createPortal(
    [
      { label: 'Range', value: getRangeLabel(selectedRange), onClick: () => setShowRangeModal(true), expanded: showRangeModal },
      { label: 'Sort', value: sortFilterLabel, onClick: () => setShowSortModal(true), expanded: showSortModal },
      { label: 'Shift', value: shiftFilterLabel, onClick: () => setShowShiftModal(true), expanded: showShiftModal },
    ].map((item) => (
      <button
        key={item.label}
        type="button"
        onClick={item.onClick}
        aria-label={`${item.label}: ${item.value}`}
        aria-haspopup="dialog"
        aria-expanded={item.expanded}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
      >
        <span className="text-sm font-medium text-slate-700">{item.value}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden />
      </button>
    )),
    filterHost,
  ) : null;

  return (
    <div className="min-h-screen bg-transparent">
      {desktopFilterPortal}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60 pt-safe md:hidden">
        <div className="max-w-4xl mx-auto px-4 py-3 md:py-3.5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowRangeModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showRangeModal}
              aria-label={`Range: ${getRangeLabel(selectedRange)}`}
              className={FILTER_RANGE_CLASS}
            >
              <span className="min-w-0 truncate text-left text-xs sm:text-sm">{getRangeLabel(selectedRange)}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSortModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showSortModal}
              aria-label={`Sort: ${sortFilterLabel}`}
              className={FILTER_SORT_CLASS}
            >
              Sort
            </button>
            <button
              type="button"
              onClick={() => setShowShiftModal(true)}
              aria-haspopup="dialog"
              aria-expanded={showShiftModal}
              aria-label={`Shift: ${shiftFilterLabel}`}
              className={FILTER_SHIFT_CLASS}
            >
              <span className="min-w-0 truncate text-left text-xs sm:text-sm">
                Shift: {shiftFilterLabel}
              </span>
            </button>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showRangeModal}
        onClose={() => setShowRangeModal(false)}
        className="max-w-sm"
        ariaLabelledBy="performance-range-title"
      >
        <div className="relative">
          <h2 id="performance-range-title" className="mb-3 pr-12 text-base font-semibold text-slate-800">
            Select range
          </h2>
          <div className="space-y-2" role="group" aria-label="Range options">
            {RANGE_OPTIONS.map((option) => {
              const selected = !actualDateFilter && selectedRange === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    clearDateParamAndSetRange(option.value);
                    setShowRangeModal(false);
                  }}
                  className={selected ? FILTER_OPTION_SELECTED : FILTER_OPTION_IDLE}
                  aria-pressed={selected}
                  {...(selected ? { 'data-autofocus': true } : {})}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowRangeModal(false)}
            className={`${FILTER_MODAL_CLOSE} absolute right-0 top-0`}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showSortModal}
        onClose={() => setShowSortModal(false)}
        className="max-w-sm"
        ariaLabelledBy="performance-sort-title"
      >
        <div className="relative">
          <h2 id="performance-sort-title" className="mb-3 pr-12 text-base font-semibold text-slate-800">
            Sort leaderboard
          </h2>
          <div className="space-y-2" role="group" aria-label="Sort options">
            {SORT_OPTIONS.map((option) => {
              const selected = sortOption === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSortOption(option.value);
                    setShowSortModal(false);
                  }}
                  className={selected ? FILTER_OPTION_SELECTED : FILTER_OPTION_IDLE}
                  aria-pressed={selected}
                  {...(selected ? { 'data-autofocus': true } : {})}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowSortModal(false)}
            className={`${FILTER_MODAL_CLOSE} absolute right-0 top-0`}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        className="max-w-sm"
        ariaLabelledBy="performance-shift-title"
      >
        <div className="relative">
          <h2 id="performance-shift-title" className="mb-3 pr-12 text-base font-semibold text-slate-800">
            Select shift
          </h2>
          <div className="space-y-2" role="group" aria-label="Shift options">
            {[
              { value: 'all', label: 'All' },
              { value: 'day', label: 'Day' },
              { value: 'night', label: 'Night' },
            ].map((option) => {
              const selected = shiftFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setShiftFilter(option.value);
                    setShowShiftModal(false);
                  }}
                  className={selected ? FILTER_OPTION_SELECTED : FILTER_OPTION_IDLE}
                  aria-pressed={selected}
                  {...(selected ? { 'data-autofocus': true } : {})}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowShiftModal(false)}
            className={`${FILTER_MODAL_CLOSE} absolute right-0 top-0`}
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </Modal>

      <div className="h-full overflow-y-auto bg-transparent px-2 py-0 md:px-2 md:py-3 pb-bottom-nav">
        <div className="page-content-inner">
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
            <h2 className="text-xl font-bold text-charcoal mb-2">No performance data</h2>
            <p className="text-slate-600 text-sm">
              No data for this range. Try Last Week, another shift filter, or check back after the next import.
            </p>
          </div>
        ) : (
          <>
            {/* Trend */}
            <section className="mb-6">
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
                      {rankedLeaderboardData.list.length} shunters
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
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { duration: 0.25, delay: Math.min(user.rank, 12) * 0.03 }
                      }
                      whileHover={
                        prefersReducedMotion
                          ? undefined
                          : { y: -1, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)' }
                      }
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                      onClick={() => toggleExpandedUser(user.userId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleExpandedUser(user.userId);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={`${formatShunterName(user)}, rank ${user.rank}${isExpanded ? ', expanded' : ', collapsed'}`}
                      className={`${cardBgClass} rounded-2xl border p-4 shadow-sm cursor-pointer transition-shadow motion-reduce:transition-none backdrop-blur-sm`}
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
                              <span className="text-xs font-medium text-slate-500">
                                {user.shiftPreference === 'day' ? 'Day' : user.shiftPreference === 'afternoon' ? 'Afternoon' : 'Night'}
                              </span>
                            )}
                            {user.isHighOutput && (
                              <span className="text-xs font-medium text-emerald-600">High output</span>
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



