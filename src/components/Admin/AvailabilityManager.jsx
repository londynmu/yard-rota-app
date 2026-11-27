import { useState, useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
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
import { fetchAdminProfilesCached } from '../../utils/adminProfilesCache';
import AvailabilityEditModal from './AvailabilityEditModal';
import { safeLocalStorage } from '../../utils/safeStorage';
import { useIsDesktop } from '../../hooks/useIsDesktop';

function getWeekStartingSaturday(date) {
  const day = getDay(date);
  return day === 6 ? date : subDays(date, (day + 1) % 7);
}

function getColorByStatus(status) {
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
}

function withDisplayName(profile) {
  return {
    ...profile,
    name:
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
      profile.full_name ||
      profile.username ||
      profile.email ||
      'Unknown User',
  };
}

const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function AvailabilityManager({ users: usersProp = [] }) {
  const isDesktop = useIsDesktop();
  const [toolbarHost, setToolbarHost] = useState(null);
  const [currentDate, setCurrentDate] = useState(() => {
    const savedDate = safeLocalStorage.getItem('availability_manager_date');
    return savedDate ? new Date(savedDate) : new Date();
  });
  const [users, setUsers] = useState(() => (usersProp || []).map(withDisplayName));
  const [usersLoading, setUsersLoading] = useState(() => !(usersProp && usersProp.length > 0));
  const [sortBy, setSortBy] = useState(() => (
    safeLocalStorage.getItem('availability_manager_sort') || 'all'
  ));
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityData, setAvailabilityData] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
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

  useEffect(() => {
    safeLocalStorage.setItem('availability_manager_date', currentDate.toISOString());
  }, [currentDate]);

  useEffect(() => {
    safeLocalStorage.setItem('availability_manager_sort', sortBy);
  }, [sortBy]);

  // Prefer AdminPage users (already from adminProfilesCache). Fetch only if still empty.
  useEffect(() => {
    if (usersProp && usersProp.length > 0) {
      setUsers(usersProp.map(withDisplayName));
      setUsersLoading(false);
      return undefined;
    }

    let cancelled = false;
    setUsersLoading(true);
    (async () => {
      try {
        const list = await fetchAdminProfilesCached();
        if (!cancelled) {
          setUsers((list || []).map(withDisplayName));
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [usersProp]);

  // Availability for the week — independent of profiles (does not wait on users).
  useEffect(() => {
    let cancelled = false;

    async function fetchAvailabilityData() {
      setAvailabilityLoading(true);
      try {
        const weekStart = getWeekStartingSaturday(currentDate);
        const weekEnd = addDays(weekStart, 6);
        const startDate = format(weekStart, 'yyyy-MM-dd');
        const endDate = format(weekEnd, 'yyyy-MM-dd');

        const { data, error } = await supabase
          .from('availability')
          .select('id, user_id, date, status, comment')
          .gte('date', startDate)
          .lte('date', endDate);

        if (error) throw error;
        if (cancelled) return;

        const availabilityByUserAndDate = {};
        (data || []).forEach((item) => {
          if (!availabilityByUserAndDate[item.user_id]) {
            availabilityByUserAndDate[item.user_id] = {};
          }
          availabilityByUserAndDate[item.user_id][item.date] = {
            id: item.id,
            status: item.status,
            comment: item.comment,
          };
        });

        setAvailabilityData(availabilityByUserAndDate);
      } catch (error) {
        console.error('Error fetching availability data:', error);
        if (!cancelled) setAvailabilityData({});
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    }

    fetchAvailabilityData();
    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  const sortedUsers = useMemo(() => {
    if (users.length === 0) return [];

    let filtered = [...users];

    if (sortBy !== 'all') {
      filtered = filtered.filter(
        (user) => user.shift_preference?.toLowerCase() === sortBy.toLowerCase(),
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((user) => {
        const fullName = (user.name || '').toLowerCase();
        const firstName = (user.first_name || '').toLowerCase();
        const lastName = (user.last_name || '').toLowerCase();
        return fullName.includes(query) || firstName.includes(query) || lastName.includes(query);
      });
    }

    filtered.sort((a, b) => {
      const shiftOrder = { day: 1, afternoon: 2, night: 3 };
      const aShift = (a.shift_preference || '').toLowerCase();
      const bShift = (b.shift_preference || '').toLowerCase();

      if (sortBy === 'all' && aShift !== bShift) {
        return (shiftOrder[aShift] || 99) - (shiftOrder[bShift] || 99);
      }

      return (a.name || '').localeCompare(b.name || '');
    });

    return filtered;
  }, [users, sortBy, searchQuery]);

  const handleSortChange = useCallback((event) => {
    setSortBy(event.target.value);
  }, []);

  const goToPreviousWeek = useCallback(() => {
    setCurrentDate((prevDate) => subWeeks(prevDate, 1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate((prevDate) => addWeeks(prevDate, 1));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const formatWeekRangeLabel = useCallback((date) => {
    const weekStartDate = getWeekStartingSaturday(date);
    const weekEndDate = addDays(weekStartDate, 6);
    return `${format(weekStartDate, 'd MMM')} – ${format(weekEndDate, 'd MMM')}`;
  }, []);

  const daysInWeek = useMemo(() => {
    const weekStart = getWeekStartingSaturday(currentDate);
    const weekEnd = addDays(weekStart, 6);
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const dayMeta = useMemo(
    () => daysInWeek.map((day) => ({
      day,
      dateKey: format(day, 'yyyy-MM-dd'),
      dayLabel: format(day, 'EEE d MMM'),
      isTodayCell: isToday(day),
      outsideMonth: !isSameMonth(day, currentDate),
    })),
    [daysInWeek, currentDate],
  );

  const openModal = useCallback((userId, date) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const dateObj = parseISO(date);
    const userAvailability = availabilityData[userId]?.[date] || null;

    setSelectedUser(user);
    setSelectedDate(dateObj);
    setCurrentAvailability(userAvailability);
    setShowModal(true);
  }, [users, availabilityData]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedUser(null);
    setSelectedDate(null);
    setCurrentAvailability(null);
  }, []);

  const handleGridActivate = useCallback((event) => {
    const cell = event.target.closest('[data-avail-user]');
    if (!cell || !event.currentTarget.contains(cell)) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'keydown') event.preventDefault();
    openModal(cell.dataset.availUser, cell.dataset.availDate);
  }, [openModal]);

  const handleSaveAvailability = async (data) => {
    try {
      const { data: existingRecords } = await supabase
        .from('availability')
        .select('id')
        .eq('user_id', data.userId)
        .eq('date', data.date);

      if (existingRecords && existingRecords.length > 0) {
        const { error } = await supabase
          .from('availability')
          .update({
            status: data.status,
            comment: data.comment,
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
            comment: data.comment,
          }]);

        if (error) throw error;
      }

      setAvailabilityData((prevData) => {
        const newData = { ...prevData };
        if (!newData[data.userId]) {
          newData[data.userId] = {};
        }
        newData[data.userId][data.date] = {
          id: existingRecords?.[0]?.id,
          status: data.status,
          comment: data.comment,
        };
        return newData;
      });

      closeModal();
    } catch (error) {
      console.error('Error saving availability:', error);
    }
  };

  const toolbarControls = (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 xl:flex-nowrap xl:gap-x-2">
      <button
        type="button"
        onClick={goToPreviousWeek}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-gray-100 motion-reduce:transition-none"
        aria-label="Previous week"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="min-w-0 shrink-0 px-1 text-center leading-tight">
        <div className="text-sm font-semibold text-charcoal">
          Week {getWeek(currentDate, { weekStartsOn: 6 })}
        </div>
        <div className="text-xs font-medium text-gray-500">
          {formatWeekRangeLabel(currentDate)}
        </div>
      </div>

      <button
        type="button"
        onClick={goToNextWeek}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-gray-100 motion-reduce:transition-none"
        aria-label="Next week"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="hidden h-4 w-px bg-gray-200 xl:block" aria-hidden="true" />

      <button
        type="button"
        onClick={goToCurrentWeek}
        className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-charcoal motion-reduce:transition-none"
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

  return (
    <div className="space-y-3 sm:space-y-4">
      {desktopToolbarPortal}
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
            <div className="w-full flex-1">
              <label htmlFor="availability-search" className="sr-only">
                Search users by name
              </label>
              <input
                id="availability-search"
                type="search"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="admin-input min-h-11"
                autoComplete="off"
              />
            </div>

            <label htmlFor="availability-shift-filter" className="sr-only">
              Filter by shift
            </label>
            <select
              id="availability-shift-filter"
              className="admin-chip min-h-11 !justify-start"
              value={sortBy}
              onChange={handleSortChange}
            >
              <option value="all">All Shifts</option>
              <option value="day">Day</option>
              <option value="afternoon">Afternoon</option>
              <option value="night">Night</option>
            </select>

            <span className="whitespace-nowrap text-sm text-gray-600">
              {usersLoading ? 'Loading…' : `${sortedUsers.length} user${sortedUsers.length !== 1 ? 's' : ''}`}
              {availabilityLoading ? ' · updating week' : ''}
            </span>
          </div>

          <div className="overflow-x-auto -mx-4 overscroll-x-contain sm:mx-0">
            <div className="min-w-full px-4 sm:px-0">
              <table className="min-w-full table-fixed">
                <caption className="sr-only">
                  Weekly availability by user. Activate a day cell to set available, unavailable, or holiday.
                </caption>
                <thead>
                  <tr className="bg-gray-50">
                    <th scope="col" className="w-[20%] border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700 sm:w-[16%]">
                      User
                    </th>
                    {dayMeta.map((meta, i) => (
                      <th
                        key={meta.dateKey}
                        scope="col"
                        className={`w-[11.42%] border-b border-gray-200 px-0.5 py-2 text-center text-xs font-semibold uppercase ${
                          meta.isTodayCell ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <div>{format(meta.day, 'd')}</div>
                        <div className="text-xs">{WEEKDAYS[i]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-gray-100 bg-white"
                  onClick={handleGridActivate}
                  onKeyDown={handleGridActivate}
                >
                  {usersLoading && sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                        Loading users…
                      </td>
                    </tr>
                  )}
                  {!usersLoading && sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                        No users found
                      </td>
                    </tr>
                  )}
                  {sortedUsers.map((user) => {
                    const displayName = user.first_name && user.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : user.name || user.email || 'User';

                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-gray-50 [content-visibility:auto] [contain-intrinsic-size:auto_52px]"
                      >
                        <th scope="row" className="w-[20%] border-b border-gray-100 px-3 py-1.5 text-left text-sm font-medium text-gray-900 sm:w-[16%]">
                          <span className="block truncate">{displayName}</span>
                        </th>
                        {dayMeta.map((meta) => {
                          const userAvailability = availabilityData[user.id]?.[meta.dateKey] || null;
                          const statusLabel = userAvailability?.status || 'unset';

                          return (
                            <td
                              key={meta.dateKey}
                              data-avail-user={user.id}
                              data-avail-date={meta.dateKey}
                              role="button"
                              tabIndex={0}
                              title={userAvailability?.comment || `Set availability for ${displayName} on ${meta.dayLabel}`}
                              aria-label={`${displayName}, ${meta.dayLabel}, ${statusLabel}. Edit availability`}
                              className={`w-[11.42%] cursor-pointer border-b border-gray-100 px-0.5 py-1 text-center text-sm ${
                                meta.isTodayCell ? 'bg-blue-50' : ''
                              } ${meta.outsideMonth ? 'text-gray-400' : ''}`}
                            >
                              <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
                                <span
                                  aria-hidden="true"
                                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                    userAvailability
                                      ? getColorByStatus(userAvailability.status)
                                      : 'bg-gray-200'
                                  }`}
                                >
                                  {!userAvailability?.status && (
                                    <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                  )}
                                </span>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-green-500/70" aria-hidden="true" />
              <span className="text-gray-700">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-red-500/70" aria-hidden="true" />
              <span className="text-gray-700">Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-blue-500/70" aria-hidden="true" />
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

AvailabilityManager.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object),
};

AvailabilityManager.defaultProps = {
  users: [],
};
