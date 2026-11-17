import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  format, 
  addWeeks, 
  subWeeks, 
  eachDayOfInterval, 
  isToday, 
  isSameMonth, 
  parseISO, 
  getDay,
  getWeek,
  addDays,
  subDays,
} from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import AvailabilityEditModal from './AvailabilityEditModal';
import { safeLocalStorage } from '../../utils/safeStorage';
import { useIsDesktop } from '../../hooks/useIsDesktop';

export default function AvailabilityManager() {
  const isDesktop = useIsDesktop();
  const [toolbarHost, setToolbarHost] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => {
    // Try to get date from localStorage
    const savedDate = safeLocalStorage.getItem('availability_manager_date');
    return savedDate ? new Date(savedDate) : new Date();
  });
  const [users, setUsers] = useState([]);
  const [sortedUsers, setSortedUsers] = useState([]);
  const [sortBy, setSortBy] = useState(() => {
    // Try to get sort filter from localStorage
    return safeLocalStorage.getItem('availability_manager_sort') || 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityData, setAvailabilityData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentAvailability, setCurrentAvailability] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const findHost = () => {
      const el = document.getElementById('availability-desktop-toolbar');
      if (!cancelled && el) setToolbarHost(el);
    };
    findHost();
    const intervalId = window.setInterval(findHost, 100);
    const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  // Save current date to localStorage when it changes
  useEffect(() => {
    safeLocalStorage.setItem('availability_manager_date', currentDate.toISOString());
  }, [currentDate]);
  
  // Save sort preference to localStorage when it changes
  useEffect(() => {
    safeLocalStorage.setItem('availability_manager_sort', sortBy);
  }, [sortBy]);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data, error } = await supabase.rpc('get_admin_profiles_with_emails');
          
        if (error) throw error;
        
        // Transform data to ensure it has the expected format
        const formattedUsers = data.map(profile => ({
          ...profile,
          // Use first_name + last_name if they exist, or full_name, or username, or email as fallbacks
          name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 
                profile.full_name || 
                profile.username || 
                profile.email || 
                'Unknown User'
        }));
        
        setUsers(formattedUsers || []);
        setSortedUsers(formattedUsers || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    }
    
    fetchUsers();
  }, []);

  // Apply sorting and search when users, sortBy or searchQuery changes
  useEffect(() => {
    if (users.length === 0) return;
    
    let filtered = [...users];
    
    // Apply shift filter
    if (sortBy !== 'all') {
      filtered = filtered.filter(user => 
        user.shift_preference?.toLowerCase() === sortBy.toLowerCase()
      );
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user => {
        const fullName = user.name.toLowerCase();
        const firstName = (user.first_name || '').toLowerCase();
        const lastName = (user.last_name || '').toLowerCase();
        return fullName.includes(query) || firstName.includes(query) || lastName.includes(query);
      });
    }
    
    // Sort users first by shift type (Day, Afternoon, Night), then by name
    filtered.sort((a, b) => {
      const shiftOrder = { day: 1, afternoon: 2, night: 3 };
      const aShift = (a.shift_preference || '').toLowerCase();
      const bShift = (b.shift_preference || '').toLowerCase();
      
      // First sort by shift preference if it's 'all'
      if (sortBy === 'all' && aShift !== bShift) {
        return (shiftOrder[aShift] || 99) - (shiftOrder[bShift] || 99);
      }
      
      // Then sort by name
      return a.name.localeCompare(b.name);
    });
    
    setSortedUsers(filtered);
  }, [users, sortBy, searchQuery]);

  // Get the current week starting from Saturday
  const getWeekStartingSaturday = (date) => {
    const day = getDay(date);
    // If it's already Saturday (6), return the date, otherwise go back to the last Saturday
    return day === 6 ? date : subDays(date, (day + 1) % 7);
  };

  // Fetch availability data for the current week and all users
  useEffect(() => {
    async function fetchAvailabilityData() {
      if (users.length === 0) return;
      
      setIsLoading(true);
      
      try {
        // Calculate week range starting from Saturday
        const weekStart = getWeekStartingSaturday(currentDate);
        const weekEnd = addDays(weekStart, 6); // 7 days total (Saturday through Friday)
        
        const startDate = format(weekStart, 'yyyy-MM-dd');
        const endDate = format(weekEnd, 'yyyy-MM-dd');
        
        const { data, error } = await supabase
          .from('availability')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate);
          
        if (error) throw error;
        
        // Organize data by user and date for easy lookup
        const availabilityByUserAndDate = {};
        
        data.forEach(item => {
          if (!availabilityByUserAndDate[item.user_id]) {
            availabilityByUserAndDate[item.user_id] = {};
          }
          
          availabilityByUserAndDate[item.user_id][item.date] = {
            id: item.id,
            status: item.status,
            comment: item.comment
          };
        });
        
        setAvailabilityData(availabilityByUserAndDate);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching availability data:', error);
        setIsLoading(false);
      }
    }
    
    fetchAvailabilityData();
  }, [currentDate, users]);

  // Handle sort change - memoized
  const handleSortChange = useCallback((event) => {
    setSortBy(event.target.value);
  }, []);

  // Navigate to the previous week - memoized
  const goToPreviousWeek = useCallback(() => {
    setCurrentDate(prevDate => subWeeks(prevDate, 1));
  }, []);

  // Navigate to the next week - memoized
  const goToNextWeek = useCallback(() => {
    setCurrentDate(prevDate => addWeeks(prevDate, 1));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const formatWeekRangeLabel = useCallback((date) => {
    const weekStartDate = getWeekStartingSaturday(date);
    const weekEndDate = addDays(weekStartDate, 6);
    return `${format(weekStartDate, 'd MMM')} – ${format(weekEndDate, 'd MMM')}`;
  }, []);

  // Generate days for the current week starting from Saturday - memoized
  const daysInWeek = useMemo(() => {
    const weekStart = getWeekStartingSaturday(currentDate);
    const weekEnd = addDays(weekStart, 6); // 7 days total (Saturday through Friday)
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  // Get day names for the column headers - memoized constant
  const weekdays = useMemo(() => ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], []);

  // Open modal to edit availability - memoized
  const openModal = useCallback((userId, date) => {
    const user = users.find(u => u.id === userId);
    const dateObj = parseISO(date);
    const userAvailability = availabilityData[userId]?.[date] || null;
    
    setSelectedUser(user);
    setSelectedDate(dateObj);
    setCurrentAvailability(userAvailability);
    setShowModal(true);
  }, [users, availabilityData]);

  // Close modal - memoized
  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedUser(null);
    setSelectedDate(null);
    setCurrentAvailability(null);
  }, []);

  // Handle save from modal
  const handleSaveAvailability = async (data) => {
    try {
      // Check if this availability record already exists
      const { data: existingRecords } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', data.userId)
        .eq('date', data.date);
        
      // Update or insert based on whether record exists
      if (existingRecords && existingRecords.length > 0) {
        const { error } = await supabase
          .from('availability')
          .update({ 
            status: data.status,
            comment: data.comment
          })
          .eq('user_id', data.userId)
          .eq('date', data.date);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('availability')
          .insert([{ 
            user_id: data.userId,
            date: data.date,
            status: data.status,
            comment: data.comment
          }]);
          
        if (error) throw error;
      }
      
      // Update local state to reflect changes
      setAvailabilityData(prevData => {
        const newData = { ...prevData };
        
        if (!newData[data.userId]) {
          newData[data.userId] = {};
        }
        
        newData[data.userId][data.date] = {
          id: existingRecords?.[0]?.id,
          status: data.status,
          comment: data.comment
        };
        
        return newData;
      });
      
      closeModal();
    } catch (error) {
      console.error('Error saving availability:', error);
    }
  };

  // Get background color based on availability status
  const getColorByStatus = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-500/70';
      case 'unavailable':
        return 'bg-red-500/70';
      case 'holiday':
        return 'bg-blue-500/70';
      default:
        return 'bg-transparent';
    }
  };

  // Same week date controls as Rota Planner (prev / week label / next / current week).
  const toolbarControls = (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 xl:flex-nowrap xl:gap-x-2">
      <button
        type="button"
        onClick={goToPreviousWeek}
        className="rounded-full p-1.5 text-charcoal transition-colors hover:bg-gray-100"
        aria-label="Previous week"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="min-w-0 shrink-0 px-1 text-center leading-tight">
        <div className="text-sm font-semibold text-charcoal">
          Week {getWeek(currentDate, { weekStartsOn: 6 })}
        </div>
        <div className="text-[11px] font-medium text-gray-500">
          {formatWeekRangeLabel(currentDate)}
        </div>
      </div>

      <button
        type="button"
        onClick={goToNextWeek}
        className="rounded-full p-1.5 text-charcoal transition-colors hover:bg-gray-100"
        aria-label="Next week"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="hidden h-4 w-px bg-gray-200 xl:block" aria-hidden="true" />

      <button
        type="button"
        onClick={goToCurrentWeek}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-charcoal"
      >
        Current week
      </button>
    </div>
  );

  const desktopToolbarPortal = toolbarHost
    ? createPortal(
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2 overflow-visible">
        {toolbarControls}
      </div>,
      toolbarHost,
    )
    : null;

  if (isLoading && users.length === 0) {
    return (
      <div className="admin-section-card animate-pulse">
      <div className="admin-section-body">
        {/* Navigation skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-slate-200 rounded-lg" />
            <div className="h-6 w-48 bg-slate-200 rounded" />
            <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-lg" />
        </div>
        
        {/* Table skeleton */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-4 pb-2 border-b">
            <div className="h-4 bg-slate-300 rounded w-20" />
            <div className="h-4 bg-slate-300 rounded w-24" />
            <div className="h-4 bg-slate-300 rounded w-28" />
            <div className="h-4 bg-slate-300 rounded w-16" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 gap-4 py-3 border-b border-gray-100">
              <div className="h-5 bg-slate-200 rounded w-32" />
              <div className="h-5 bg-slate-200 rounded w-40" />
              <div className="h-5 bg-slate-200 rounded w-36" />
              <div className="h-8 w-20 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {desktopToolbarPortal}
      {/* Mobile-only sticky toolbar; desktop controls live in the logo header bar */}
      {!isDesktop && (
        <div className="sticky top-0 z-40 border-b border-rota-toolbar-border bg-rota-toolbar-bg py-2.5 shadow-sm">
          <div className="flex flex-col gap-3">
            {toolbarControls}
          </div>
        </div>
      )}

    <div className="admin-section-card w-full max-w-full overflow-hidden">
      <div className="admin-section-body">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="w-full flex-1">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-input"
            />
          </div>
          
          {/* Shift Filter */}
          <select
            className="admin-chip !justify-start"
            value={sortBy}
            onChange={handleSortChange}
          >
            <option value="all">All Shifts</option>
            <option value="day">Day</option>
            <option value="afternoon">Afternoon</option>
            <option value="night">Night</option>
          </select>

          {/* Results count */}
          <span className="whitespace-nowrap text-sm text-gray-600">
            {sortedUsers.length} user{sortedUsers.length !== 1 ? 's' : ''}
          </span>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-full px-4 sm:px-0">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-[20%] sm:w-[16%]">
                  User
                </th>
                {daysInWeek.map((day, i) => (
                  <th 
                    key={i}
                    className={`px-1 py-2 text-center text-xs font-semibold uppercase ${
                      isToday(day) ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                    } border-b border-gray-200 w-[11.42%]`}
                  >
                    <div>{format(day, 'd')}</div>
                    <div className="text-xs">{weekdays[i]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sortedUsers.map((user) => (
                <tr 
                  key={user.id}
                  className="hover:bg-gray-50"
                >
                  <td className="px-3 py-2 text-sm border-b border-gray-100 w-[20%] sm:w-[16%]">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-gray-900 truncate">
                        {user.first_name && user.last_name 
                          ? `${user.first_name} ${user.last_name}`
                          : user.name || user.email}
                      </span>
                    </div>
                  </td>
                  {daysInWeek.map((day, i) => {
                    const formattedDate = format(day, 'yyyy-MM-dd');
                    const userAvailability = availabilityData[user.id] 
                      ? availabilityData[user.id][formattedDate] 
                      : null;
                    
                    return (
                      <td 
                        key={i} 
                        className={`px-1 py-2 text-center text-sm border-b border-gray-100 ${
                          isToday(day) ? 'bg-blue-50' : ''
                        } ${!isSameMonth(day, currentDate) ? 'text-gray-400' : ''} w-[11.42%]`}
                      >
                        <div className="flex justify-center">
                          <button
                            className={`w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 ${
                              userAvailability ? getColorByStatus(userAvailability.status) : 'bg-gray-200 hover:bg-gray-300'
                            }`}
                            onClick={() => openModal(user.id, formattedDate)}
                            title={userAvailability?.comment || 'Set availability'}
                          >
                            {!userAvailability?.status && (
                              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500/70"></div>
          <span className="text-gray-700">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500/70"></div>
          <span className="text-gray-700">Unavailable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-500/70"></div>
          <span className="text-gray-700">Holiday</span>
        </div>
      </div>

      {showModal && selectedDate && selectedUser && (
        <AvailabilityEditModal
          date={selectedDate}
          user={selectedUser}
          initialData={currentAvailability}
          onSave={handleSaveAvailability}
          onClose={closeModal}
        />
      )}
      </div>
    </div>
    </div>
  );
} 