/**
 * Utility functions for Rota/Schedule management
 */

/**
 * Sort slots by start time, then end time, then alphabetically by name
 * @param {Array} slots - Array of slot objects with profiles
 * @returns {Array} Sorted array of slots
 */
export const sortSlotsByTime = (slots) => {
  return [...slots].sort((a, b) => {
    // First sort by start_time
    const startTimeCompare = a.start_time.localeCompare(b.start_time);
    if (startTimeCompare !== 0) return startTimeCompare;
    
    // If start_times are equal, sort by end_time
    const endTimeCompare = a.end_time.localeCompare(b.end_time);
    if (endTimeCompare !== 0) return endTimeCompare;
    
    // If both times are equal, sort alphabetically by name
    const aName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : '';
    const bName = b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : '';
    return aName.localeCompare(bName);
  });
};

/**
 * Format time from HH:MM:SS to HH:MM
 * @param {string} timeStr - Time string
 * @returns {string} Formatted time HH:MM
 */
export const formatTime = (timeStr) => {
  return timeStr ? timeStr.slice(0, 5) : '';
};

/**
 * Safe localStorage getter with fallback
 * @param {string} key - localStorage key
 * @param {*} fallback - Fallback value if not available
 * @returns {*} Value from localStorage or fallback
 */
export const getLocalStorageItem = (key, fallback = null) => {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? item : fallback;
  } catch (error) {
    console.warn(`localStorage.getItem failed for key "${key}":`, error);
    return fallback;
  }
};

/**
 * Safe localStorage setter
 * @param {string} key - localStorage key
 * @param {*} value - Value to store
 */
export const setLocalStorageItem = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`localStorage.setItem failed for key "${key}":`, error);
  }
};

/**
 * Get week start date (Saturday)
 * @param {Date} date - Any date in the week
 * @returns {Date} Saturday of that week
 */
export const getWeekStart = (date) => {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : (day + 1); // number of days since last Saturday
  const result = new Date(date);
  result.setDate(result.getDate() - diff);
  return result;
};
