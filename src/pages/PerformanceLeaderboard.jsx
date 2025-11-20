import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/ui/ToastContext';
import { format as formatDate, startOfWeek, startOfMonth } from 'date-fns';
import { createPortal } from 'react-dom';

const PerformanceLeaderboard = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    return localStorage.getItem('performance_period') || 'today';
  });
  const [sortOption, setSortOption] = useState(() => {
    return localStorage.getItem('performance_sort') || 'moves';
  });
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('performance_period', selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    localStorage.setItem('performance_sort', sortOption);
  }, [sortOption]);

  // Calculate date range based on selected period
  const getDateRange = useCallback(() => {
    const today = new Date();
    let startDate, endDate;

    switch (selectedPeriod) {
      case 'today':
        startDate = formatDate(today, 'yyyy-MM-dd');
        endDate = formatDate(today, 'yyyy-MM-dd');
        break;
      case 'week':
        startDate = formatDate(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        endDate = formatDate(today, 'yyyy-MM-dd');
        break;
      case 'month':
        startDate = formatDate(startOfMonth(today), 'yyyy-MM-dd');
        endDate = formatDate(today, 'yyyy-MM-dd');
        break;
      case 'all':
      default:
        startDate = '2020-01-01';
        endDate = formatDate(today, 'yyyy-MM-dd');
        break;
    }

    return { startDate, endDate };
  }, [selectedPeriod]);

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

  const getPeriodLabel = (period) => {
    switch (period) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'all': return 'All Time';
      default: return 'Today';
    }
  };

  const getSortLabel = (sort) => {
    switch (sort) {
      case 'collect': return 'Avg Collect';
      case 'travel': return 'Avg Travel';
      default: return 'Total Moves';
    }
  };

  const top3 = leaderboardData.slice(0, 3);
  const rest = leaderboardData.slice(3);

  return (
    <div className="min-h-screen bg-offwhite pb-20">
      {/* Sticky Badge Header (jak w My Rota) */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-300 shadow-md pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-xl mx-auto">
            <button
              onClick={() => setShowPeriodModal(true)}
              className="flex-1 px-4 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors text-center"
            >
              {getPeriodLabel(selectedPeriod)}
            </button>
            <button
              onClick={() => setShowSortModal(true)}
              className="flex-1 px-4 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors text-center"
            >
              Sort: {getSortLabel(sortOption)}
            </button>
          </div>
        </div>
      </div>

      {/* Period Selection Modal */}
      {showPeriodModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Select Period</h3>
              <button 
                onClick={() => setShowPeriodModal(false)} 
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[70vh]">
              {[
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
                { value: 'all', label: 'All Time' }
              ].map((period) => (
                <button
                  key={period.value}
                  onClick={() => {
                    setSelectedPeriod(period.value);
                    setShowPeriodModal(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                    selectedPeriod === period.value
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-charcoal hover:bg-gray-200'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sort Selection Modal */}
      {showSortModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Sort Leaderboard</h3>
              <button 
                onClick={() => setShowSortModal(false)} 
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
              >
                Done
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[70vh]">
              {[
                { value: 'moves', label: 'Total Moves (descending)' },
                { value: 'collect', label: 'Avg Collect Time (ascending)' },
                { value: 'travel', label: 'Avg Travel Time (ascending)' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSortOption(option.value);
                    setShowSortModal(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors ${
                    sortOption === option.value
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-charcoal hover:bg-gray-200'
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
            {/* Top 3 Podium */}
            {top3.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-charcoal mb-4">Top Performers</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {top3.map((user, index) => {
                    const rank = index + 1;
                    return (
                      <div
                        key={user.userId}
                        className={`border-2 rounded-lg p-6 ${getMedalBorderColor(rank)} shadow-lg`}
                      >
                        <div className="text-center">
                          <div className="text-5xl mb-3">{getMedalEmoji(rank)}</div>
                          <div className="text-4xl font-bold text-charcoal mb-1">#{rank}</div>
                          
                          {/* Avatar */}
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={`${user.firstName} ${user.lastName}`}
                              className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-gray-300"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-300 flex items-center justify-center text-2xl font-bold text-white">
                              {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                            </div>
                          )}
                          
                          <h3 className="text-lg font-semibold text-charcoal">
                            {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-600 font-mono">{user.yardSystemId}</p>
                          
                          <div className="mt-4 space-y-2">
                            <div className="bg-white rounded-md p-3 border border-gray-200">
                              <div className="text-3xl font-bold text-charcoal">{user.totalMoves}</div>
                              <div className="text-xs text-gray-600">Total Moves</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-white rounded-md p-2 border border-gray-200">
                                <div className="font-semibold text-charcoal">{user.avgCollectTime}</div>
                                <div className="text-gray-600">Avg Collect</div>
                              </div>
                              <div className="bg-white rounded-md p-2 border border-gray-200">
                                <div className="font-semibold text-charcoal">{user.avgTravelTime}</div>
                                <div className="text-gray-600">Avg Travel</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rest of Leaderboard */}
            {rest.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-charcoal mb-4">All Shunters</h2>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                          <th className="px-4 py-3 text-right text-sm font-semibold text-charcoal">Days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {rest.map((user, index) => {
                          const rank = index + 4;
                          return (
                            <tr key={user.userId} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-charcoal font-semibold">#{rank}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {user.avatarUrl ? (
                                    <img
                                      src={user.avatarUrl}
                                      alt={`${user.firstName} ${user.lastName}`}
                                      className="w-10 h-10 rounded-full border border-gray-300"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-white">
                                      {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-medium text-charcoal">
                                      {user.firstName} {user.lastName}
                                    </div>
                                    <div className="text-xs text-gray-600 font-mono">{user.yardSystemId}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-charcoal">{user.totalMoves}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{user.avgCollectTime}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{user.avgTravelTime}</td>
                              <td className="px-4 py-3 text-right text-gray-500">{user.daysWorked}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-gray-200">
                    {rest.map((user, index) => {
                      const rank = index + 4;
                      return (
                        <div key={user.userId} className="p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="text-xl font-bold text-charcoal">#{rank}</div>
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={`${user.firstName} ${user.lastName}`}
                                className="w-12 h-12 rounded-full border border-gray-300"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center font-bold text-white">
                                {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="font-semibold text-charcoal">
                                {user.firstName} {user.lastName}
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PerformanceLeaderboard;


