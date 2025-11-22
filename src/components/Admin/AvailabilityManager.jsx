import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  format, 
  addWeeks, 
  subWeeks, 
  eachDayOfInterval, 
  isToday, 
  isSameMonth, 
  parseISO, 
  getDay,
  addDays,
  subDays
} from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import AvailabilityEditModal from './AvailabilityEditModal';

export default function AvailabilityManager() {
  const [currentDate, setCurrentDate] = useState(() => {
    // Try to get date from localStorage
    const savedDate = localStorage.getItem('availability_manager_date');
    return savedDate ? new Date(savedDate) : new Date();
  });
  const [users, setUsers] = useState([]);
  const [sortedUsers, setSortedUsers] = useState([]);
  const [sortBy, setSortBy] = useState(() => {
    // Try to get sort filter from localStorage
    return localStorage.getItem('availability_manager_sort') || 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityData, setAvailabilityData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentAvailability, setCurrentAvailability] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Save current date to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('availability_manager_date', currentDate.toISOString());
  }, [currentDate]);
  
  // Save sort preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('availability_manager_sort', sortBy);
  }, [sortBy]);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      try {
        // Pobieramy profile bezpośrednio - pomijamy próbę użycia RPC
        const { data, error } = await supabase
          .from('profiles')
          .select('*');
          
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

  // Get color for shift type
  const getShiftTypeColor = (shiftType) => {
    switch (shiftType?.toLowerCase()) {
      case 'day':
        return 'text-yellow-700 bg-yellow-100';
      case 'afternoon':
        return 'text-orange-700 bg-orange-100';
      case 'night':
        return 'text-blue-700 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  // Get the week date range for display - memoized
  const weekDisplayRange = useMemo(() => {
    const weekStart = getWeekStartingSaturday(currentDate);
    const weekEnd = addDays(weekStart, 6);
    return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  }, [currentDate]);

  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-charcoal"></div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200 w-full max-w-full overflow-hidden"
    >
      <div className="flex flex-col gap-4 mb-4">
        {/* Navigation Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="text-charcoal bg-gray-100 hover:bg-gray-200 rounded-lg p-2"
              onClick={goToPreviousWeek}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            
            <h2 className="text-lg font-semibold text-charcoal px-3 whitespace-nowrap">
              {weekDisplayRange}
            </h2>
            
            <button
              className="text-charcoal bg-gray-100 hover:bg-gray-200 rounded-lg p-2"
              onClick={goToNextWeek}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          {/* Search */}
          <div className="flex-1 w-full">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal focus:border-transparent"
            />
          </div>
          
          {/* Shift Filter */}
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-charcoal focus:border-transparent"
            value={sortBy}
            onChange={handleSortChange}
          >
            <option value="all">All Shifts</option>
            <option value="day">Day</option>
            <option value="afternoon">Afternoon</option>
            <option value="night">Night</option>
          </select>

          {/* Results count */}
          <span className="text-sm text-gray-600 whitespace-nowrap">
            {sortedUsers.length} user{sortedUsers.length !== 1 ? 's' : ''}
          </span>
        </div>
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
                      {user.shift_preference && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getShiftTypeColor(user.shift_preference)} uppercase inline-block w-fit`}>
                          {user.shift_preference}
                        </span>
                      )}
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
  );
} 