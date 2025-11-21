import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { format as formatDate, subDays, parseISO } from 'date-fns';
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
  const [myStatsError, setMyStatsError] = useState(null);
  const [myStatsData, setMyStatsData] = useState(null);

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

      // Aggregate data by user
      const userStats = {};
      
      (performanceData || []).forEach(record => {
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
            if (a.avgCollectSeconds !== b.avgCollectSeconds) {
              return a.avgCollectSeconds - b.avgCollectSeconds;
            }
            return b.totalMoves - a.totalMoves;
          case 'travel':
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

      if (!data || data.length === 0) {
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

      const latestDate = data[0].report_date;
      const latestDateObj = latestDate ? parseISO(latestDate) : new Date();

      const lastDayRecords = data.filter((record) => record.report_date === latestDate);
      const last7Start = formatDate(subDays(latestDateObj, 6), 'yyyy-MM-dd');
      const last30Start = formatDate(subDays(latestDateObj, 29), 'yyyy-MM-dd');

      const last7Records = data.filter((record) => record.report_date >= last7Start);
      const last30Records = data.filter((record) => record.report_date >= last30Start);

      const bestDayRecord = data.reduce((best, record) => {
        const moves = record.number_of_moves || 0;
        if (!best || moves > (best.number_of_moves || 0)) {
          return record;
        }
        return best;
      }, null);

      const overall = aggregate(data);

      setMyStatsData({
        latestDate,
        lastDay: aggregate(lastDayRecords),
        last7: aggregate(last7Records),
        last30: aggregate(last30Records),
        overall,
        daysLogged: data.length,
        bestDay: {
          moves: bestDayRecord?.number_of_moves || 0,
          date: bestDayRecord?.report_date || null,
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

  const getMedalEmoji = (rank) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return null;
    }
  };

  const getMedalBorderColor = (rank) => {
    switch (rank) {
      case 1: return 'border-yellow-400 bg-yellow-50';
      case 2: return 'border-gray-400 bg-gray-50';
      case 3: return 'border-amber-600 bg-amber-50';
      default: return 'border-gray-200 bg-white';
    }
  };

  const getRangeLabel = (range) => {
    return RANGE_LOOKUP[range]?.label || RANGE_LOOKUP.last_day.label;
  };

  const getSortLabel = (sort) => {
    switch (sort) {
      case 'collect': return 'Avg Collect';
      case 'travel': return 'Avg Travel';
      default: return 'Total Moves';
    }
  };

  const getAverageTime = (stat, type) => {
    if (!stat || !stat.moves) return '0:00';
    const totalSeconds = type === 'collect' ? stat.collectSeconds : stat.travelSeconds;
    if (!totalSeconds) return '0:00';
    return secondsToTime(Math.round(totalSeconds / stat.moves));
  };

  const featuredPerformers = leaderboardData.slice(0, 6);

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

  const toggleExpandedUser = (userId) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  const getRankAccent = (rank) => {
    switch (rank) {
      case 1:
        return 'border-amber-400 shadow-amber-100';
      case 2:
        return 'border-gray-400 shadow-gray-100';
      case 3:
        return 'border-amber-600 shadow-orange-100';
      default:
        return 'border-gray-200';
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
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return name || user.yardSystemId || '—';
  };

  const renderDetailPanel = (user) => {
    const movesPerDay = user.daysWorked ? (user.totalMoves / user.daysWorked).toFixed(1) : '0.0';
    const tags = getPerformanceTags(user);

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Moves / day</p>
            <p className="text-2xl font-bold text-charcoal">{movesPerDay}</p>
            <p className="text-xs text-gray-500">{user.daysWorked} logged days</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Full locations</p>
            <p className="text-2xl font-bold text-charcoal">
              {(user.totalFullLocations || 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">All time in range</p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Avg collect</p>
            <p className="text-2xl font-bold text-charcoal">{user.avgCollectTime}</p>
            <p className="text-xs text-gray-500">
              Target: &lt; 02:00
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs uppercase text-gray-500">Avg travel</p>
            <p className="text-2xl font-bold text-charcoal">{user.avgTravelTime}</p>
            <p className="text-xs text-gray-500">Lower = faster transfers</p>
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
            <div className="p-4 space-y-4 overflow-y-auto bg-offwhite">
              {myStatsLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-10 w-10 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : myStatsError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
                  {myStatsError}
                </div>
              ) : !myStatsData ? (
                <div className="text-center text-gray-600 text-sm py-8">
                  Brak zapisanych dziennych raportów dla Twojego konta.
                </div>
              ) : (
                <>
                  <section className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Latest day</p>
                    <p className="text-sm font-semibold text-charcoal">
                      {myStatsData.latestDate
                        ? formatDate(parseISO(myStatsData.latestDate), 'EEEE, dd MMM')
                        : '—'}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Moves</p>
                        <p className="text-2xl font-bold text-charcoal">
                          {(myStatsData.lastDay?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Last recorded day</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1">
                        <div>
                          <p className="text-[11px] uppercase text-gray-500">Avg Collect</p>
                          <p className="text-lg font-semibold text-charcoal">
                            {getAverageTime(myStatsData.lastDay, 'collect')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase text-gray-500">Avg Travel</p>
                          <p className="text-lg font-semibold text-charcoal">
                            {getAverageTime(myStatsData.lastDay, 'travel')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                      Rolling totals
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Last 7 days</p>
                        <p className="text-2xl font-bold text-charcoal">
                          {(myStatsData.last7?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Moves moved</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Last 30 days</p>
                        <p className="text-2xl font-bold text-charcoal">
                          {(myStatsData.last30?.moves || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">Moves moved</p>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500">All time</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Total moves</p>
                        <p className="text-2xl font-bold text-charcoal">
                          {(myStatsData.overall?.moves || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Full locations</p>
                        <p className="text-2xl font-bold text-charcoal">
                          {(myStatsData.overall?.fullLocations || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Avg collect</p>
                        <p className="text-xl font-semibold text-charcoal">
                          {getAverageTime(myStatsData.overall, 'collect')}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs uppercase text-gray-500">Avg travel</p>
                        <p className="text-xl font-semibold text-charcoal">
                          {getAverageTime(myStatsData.overall, 'travel')}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase text-gray-500">Best day</p>
                        <p className="text-lg font-semibold text-charcoal">
                          {myStatsData.bestDay.moves.toLocaleString()} moves
                        </p>
                        {myStatsData.bestDay.date && (
                          <p className="text-xs text-gray-500">
                            {formatDate(parseISO(myStatsData.bestDay.date), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase text-gray-500">Days logged</p>
                        <p className="text-lg font-semibold text-charcoal">
                          {myStatsData.daysLogged}
                        </p>
                      </div>
                    </div>
                  </section>
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
            {/* Team overview */}
            <section className="mb-8">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Team overview</p>
                  <h2 className="text-2xl font-bold text-charcoal">Operational pulse</h2>
                </div>
                <p className="text-sm text-gray-500">
                  {leaderboardData.length} active shunters in view
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">Avg moves / day</p>
                  <p className="text-3xl font-bold text-charcoal mt-1">
                    {teamHighlights.avgMovesPerDay.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {teamHighlights.totalMoves.toLocaleString()} moves this period
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">Full locations logged</p>
                  <p className="text-3xl font-bold text-charcoal mt-1">
                    {teamHighlights.totalFullLocations.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Across {teamHighlights.activeShunters} shunters
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">Fastest collect</p>
                  <p className="text-3xl font-bold text-charcoal mt-1">
                    {teamHighlights.fastestCollect?.avgCollectTime || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {teamHighlights.fastestCollect ? formatShunterName(teamHighlights.fastestCollect) : 'Awaiting data'}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">Fastest travel</p>
                  <p className="text-3xl font-bold text-charcoal mt-1">
                    {teamHighlights.fastestTravel?.avgTravelTime || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {teamHighlights.fastestTravel ? formatShunterName(teamHighlights.fastestTravel) : 'Awaiting data'}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs uppercase text-gray-500">Most consistent</p>
                  <p className="text-3xl font-bold text-charcoal mt-1">
                    {teamHighlights.reliabilityLeader
                      ? `${teamHighlights.reliabilityLeader.daysWorked} days`
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    {teamHighlights.reliabilityLeader
                      ? formatShunterName(teamHighlights.reliabilityLeader)
                      : 'Highest attendance pending'}
                  </p>
                </div>
              </div>
            </section>

            {/* Featured performers */}
            {featuredPerformers.length > 0 && (
              <section className="mb-8">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Top contributors</p>
                    <h2 className="text-2xl font-bold text-charcoal">Spotlight</h2>
                  </div>
                  <p className="text-sm text-gray-500">
                    Sorted by {getSortLabel(sortOption)}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {featuredPerformers.map((user, index) => {
                    const rank = index + 1;
                    return (
                      <div
                        key={user.userId}
                        className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col gap-4 ${getRankAccent(rank)}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-bold text-charcoal">#{rank}</div>
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={formatShunterName(user)}
                              className="w-12 h-12 rounded-full border border-gray-200"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-white">
                              {user.firstName?.charAt(0)}
                              {user.lastName?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-charcoal">{formatShunterName(user)}</p>
                            <p className="text-xs text-gray-500 font-mono">{user.yardSystemId}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                            <p className="text-xs uppercase text-gray-500">Moves</p>
                            <p className="text-2xl font-bold text-charcoal">
                              {user.totalMoves.toLocaleString()}
                            </p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                            <p className="text-xs uppercase text-gray-500">Days</p>
                            <p className="text-2xl font-bold text-charcoal">
                              {user.daysWorked}
                            </p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                            <p className="text-xs uppercase text-gray-500">Avg collect</p>
                            <p className="text-xl font-semibold text-charcoal">{user.avgCollectTime}</p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                            <p className="text-xs uppercase text-gray-500">Avg travel</p>
                            <p className="text-xl font-semibold text-charcoal">{user.avgTravelTime}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Detailed table */}
            <section>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Detailed view</p>
                  <h2 className="text-2xl font-bold text-charcoal">All shunters</h2>
                </div>
                <p className="text-sm text-gray-500">Tap row for full breakdown</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-charcoal">Rank</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-charcoal">Shunter</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Moves</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Avg Collect</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Avg Travel</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Full Loc.</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Days</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {leaderboardData.map((user, index) => {
                        const rank = index + 1;
                        const isExpanded = expandedUserId === user.userId;
                        return (
                          <React.Fragment key={user.userId}>
                            <tr className={`transition-colors ${isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3 text-charcoal font-semibold">#{rank}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {user.avatarUrl ? (
                                    <img
                                      src={user.avatarUrl}
                                      alt={formatShunterName(user)}
                                      className="w-10 h-10 rounded-full border border-gray-300"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-white">
                                      {user.firstName?.charAt(0)}
                                      {user.lastName?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-medium text-charcoal">
                                      {formatShunterName(user)}
                                    </div>
                                    <div className="text-xs text-gray-600 font-mono">{user.yardSystemId}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-charcoal">
                                {user.totalMoves.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">{user.avgCollectTime}</td>
                              <td className="px-4 py-3 text-right text-gray-700">{user.avgTravelTime}</td>
                              <td className="px-4 py-3 text-right text-gray-700">
                                {(user.totalFullLocations || 0).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">{user.daysWorked}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => toggleExpandedUser(user.userId)}
                                  className="text-sm font-semibold text-gray-900 border border-gray-300 rounded-full px-3 py-1 hover:bg-gray-100 transition-colors"
                                >
                                  {isExpanded ? 'Hide' : 'Details'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} className="px-4 pb-4">
                                  {renderDetailPanel(user)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-gray-200">
                  {leaderboardData.map((user, index) => {
                    const rank = index + 1;
                    const isExpanded = expandedUserId === user.userId;
                    return (
                      <div key={user.userId} className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="text-xl font-bold text-charcoal">#{rank}</div>
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={formatShunterName(user)}
                              className="w-12 h-12 rounded-full border border-gray-300"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center font-bold text-white">
                              {user.firstName?.charAt(0)}
                              {user.lastName?.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-charcoal">
                              {formatShunterName(user)}
                            </div>
                            <div className="text-xs text-gray-600 font-mono">{user.yardSystemId}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-lg font-bold text-charcoal">{user.totalMoves}</div>
                            <div className="text-xs text-gray-600">Moves</div>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-sm font-semibold text-charcoal">{user.avgCollectTime}</div>
                            <div className="text-xs text-gray-600">Collect</div>
                          </div>
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-sm font-semibold text-charcoal">{user.avgTravelTime}</div>
                            <div className="text-xs text-gray-600">Travel</div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleExpandedUser(user.userId)}
                          className="mt-3 w-full text-sm font-semibold text-gray-900 border border-gray-300 rounded-full px-3 py-2 hover:bg-gray-50 transition-colors"
                        >
                          {isExpanded ? 'Hide details' : 'More details'}
                        </button>
                        {isExpanded && (
                          <div className="mt-3">
                            {renderDetailPanel(user)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default PerformanceLeaderboard;



