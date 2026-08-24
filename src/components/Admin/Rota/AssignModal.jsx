import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import { format, parseISO } from 'date-fns';
import { countUniqueAssigned } from '../../../utils/rotaAssignedEmployees';
import UserNoteModal from './UserNoteModal';

const AssignModal = ({ slot, onClose, onAssign }) => {
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');
  const [localAssignedCount, setLocalAssignedCount] = useState(
    countUniqueAssigned(slot.assigned_employees)
  );
  const [showCapacityAlert, setShowCapacityAlert] = useState(false);
  const [minBreakMinutes, setMinBreakMinutes] = useState(60); // Default value
  const [task, setTask] = useState('');
  const [taskSuggestions, setTaskSuggestions] = useState([]);
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const [showUserNoteModal, setShowUserNoteModal] = useState(false);
  const [userNoteData, setUserNoteData] = useState(null);
  const [isTaskSectionExpanded, setIsTaskSectionExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedSlotLocation = slot?.location?.trim().toLowerCase() || '';
  const normalizedSlotShift = slot?.shift_type?.trim().toLowerCase() || '';

  const normalizePreferenceValue = (value) => value?.trim().toLowerCase() || '';

  const matchesLocationPreference = (preferredLocation) => {
    const normalizedPref = normalizePreferenceValue(preferredLocation);
    if (!normalizedPref) return true;
    if (['both', 'all', 'any'].includes(normalizedPref)) return true;
    return normalizedPref === normalizedSlotLocation;
  };

  const hasDifferentLocationPreference = (preferredLocation) => {
    const normalizedPref = normalizePreferenceValue(preferredLocation);
    if (!normalizedPref) return false;
    if (['both', 'all', 'any'].includes(normalizedPref)) return false;
    return normalizedPref !== normalizedSlotLocation;
  };

  const matchesShiftPreference = (shiftPreference) => {
    if (!shiftPreference) return true;
    return normalizePreferenceValue(shiftPreference) === normalizedSlotShift;
  };

  // Format time to remove seconds (HH:MM)
  const formatTimeWithoutSeconds = (timeString) => {
    return timeString.split(':').slice(0, 2).join(':');
  };

  // Format date to include day of week
  const getFormattedDate = (dateString) => {
    try {
      const date = parseISO(dateString);
      return `${format(date, 'yyyy-MM-dd')}, ${format(date, 'EEEE')}`;
    } catch {
      return dateString;
    }
  };

  // Prevent body scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);
  
  // Keep capacity UI in sync when parent slot state refreshes (e.g. after refetch)
  useEffect(() => {
    setLocalAssignedCount(countUniqueAssigned(slot.assigned_employees));
  }, [slot.id, slot.assigned_employees]);

  // Hide capacity alert after 3 seconds
  useEffect(() => {
    let timer;
    if (showCapacityAlert) {
      timer = setTimeout(() => {
        setShowCapacityAlert(false);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [showCapacityAlert]);

  // Fetch minimum break setting
  useEffect(() => {
    const fetchMinBreakSetting = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'min_break_between_slots')
          .single();

        if (error) {
          console.error('Error fetching minimum break setting:', error);
          return;
        }

        if (data && data.value) {
          setMinBreakMinutes(parseInt(data.value, 10));
        }
      } catch (error) {
        console.error('Error in fetchMinBreakSetting:', error);
      }
    };

    fetchMinBreakSetting();
  }, []);

  // Fetch task suggestions
  useEffect(() => {
    const fetchTaskSuggestions = async () => {
      try {
        const { data, error } = await supabase.rpc('get_all_unique_tasks');
        
        if (error) {
          console.error('Error fetching task suggestions:', error);
          return;
        }
        
        if (data) {
          setTaskSuggestions(data.map(item => item.task));
        }
      } catch (error) {
        console.error('Error in fetchTaskSuggestions:', error);
      }
    };
    
    fetchTaskSuggestions();
  }, []);

  // Handle task input
  const handleTaskChange = (e) => {
    const value = e.target.value;
    
    // Auto-capitalize first letter
    let formattedValue = value;
    if (value.length > 0) {
      formattedValue = value.charAt(0).toUpperCase() + value.slice(1);
    }
    
    setTask(formattedValue);
    
    // Show suggestions if there are matching ones
    if (formattedValue.length > 0) {
      const filtered = taskSuggestions.filter(suggestion => 
        suggestion.toLowerCase().includes(formattedValue.toLowerCase())
      );
      
      if (filtered.length > 0) {
        setShowTaskSuggestions(true);
      } else {
        setShowTaskSuggestions(false);
      }
    } else {
      setShowTaskSuggestions(false);
    }
  };
  
  // Handle task suggestion selection
  const handleTaskSuggestionClick = (suggestion) => {
    setTask(suggestion);
    setShowTaskSuggestions(false);
  };

  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true);

      try {
        // Fetch regular profiles
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select(`
            id, 
            first_name, 
            last_name, 
            avatar_url, 
            preferred_location,
            shift_preference,
            custom_start_time,
            custom_end_time,
            performance_score
          `)
          .eq('is_active', true)
          .order('first_name');

        if (error) throw error;
        
        const allProfiles = profiles; // Use only regular profiles

        /* ================= Weekly Shift Counts ================= */
        // Calculate week range (Saturday to Friday) for the selected slot date
        const slotDateObj = parseISO(slot.date);
        const dayOfWeek = slotDateObj.getDay(); // 0 = Sun, 6 = Sat
        // Days since last Saturday
        const daysSinceSaturday = (dayOfWeek + 1) % 7; // Sat=>0, Sun=>1, ... Fri=>6
        const weekStartDateObj = new Date(slotDateObj);
        weekStartDateObj.setDate(slotDateObj.getDate() - daysSinceSaturday);
        const weekEndDateObj = new Date(weekStartDateObj);
        weekEndDateObj.setDate(weekStartDateObj.getDate() + 6);

        const weekStart = weekStartDateObj.toISOString().split('T')[0];
        const weekEnd = weekEndDateObj.toISOString().split('T')[0];

        // Fetch shift counts per employee for that week
        let weeklyCountMap = new Map();
        try {
          const { data: weeklyCountsData, error: weeklyCountsError } = await supabase
            .from('scheduled_rota')
            .select('user_id, date')
            .gte('date', weekStart)
            .lte('date', weekEnd)
            .not('user_id', 'is', null);

          if (weeklyCountsError) {
            console.error('Error fetching weekly counts:', weeklyCountsError);
          } else {
            // Count shifts per user manually
            weeklyCountsData?.forEach(item => {
              if (item.user_id) {
                const currentCount = weeklyCountMap.get(item.user_id) || 0;
                weeklyCountMap.set(item.user_id, currentCount + 1);
              }
            });
          }
        } catch (err) {
          console.error('Weekly count calculation error:', err);
        }

        // Fetch availability for the day
        const date = slot.date;
        const { data: availability, error: availabilityError } = await supabase
          .from('availability')
          .select('user_id, status')
          .eq('date', date);

        if (availabilityError) throw availabilityError;

        // Get existing scheduled slots for all employees for this date
        const { data: existingSlots, error: slotsError } = await supabase
          .from('scheduled_rota')
          .select('user_id, start_time, end_time')
          .eq('date', date);

        if (slotsError) throw slotsError;

        // Group existing slots by user_id
        const userSlots = {};
        if (existingSlots) {
          existingSlots.forEach(s => {
            if (!userSlots[s.user_id]) {
              userSlots[s.user_id] = [];
            }
            userSlots[s.user_id].push({
              start_time: s.start_time,
              end_time: s.end_time
            });
          });
        }

        // Check which employees would have break conflicts with this slot
        const conflictingIds = new Set();
        const overlappingConflictIds = new Set(); // Store IDs of staff with overlapping conflicts
        const breakConflictIds = new Set();      // Store IDs of staff with break time conflicts
        
        // Get current slot times in minutes
        const slotStart = timeToMinutes(slot.start_time);
        const slotEnd = timeToMinutes(slot.end_time);
        // Normalize current slot end time for potential overnight shift
        const normalizedSlotEnd = slotEnd < slotStart ? slotEnd + 1440 : slotEnd;

        Object.entries(userSlots).forEach(([userId, slots]) => {
          for (const existingSlot of slots) {
            const existingStart = timeToMinutes(existingSlot.start_time);
            const existingEnd = timeToMinutes(existingSlot.end_time);
            // Normalize existing slot end time for potential overnight shift
            const normalizedExistingEnd = existingEnd < existingStart ? existingEnd + 1440 : existingEnd;

            // --- Overlap Check (using normalized times) ---
            // Overlap exists if the start of one interval is before the end of the other, for both intervals.
            const overlapDetected = (slotStart < normalizedExistingEnd) && (existingStart < normalizedSlotEnd);
            
            // Log the check for debugging
            // console.log(`[AssignModal Check] User ${userId}: Slot ${slotStart}-${normalizedSlotEnd} vs Existing ${existingStart}-${normalizedExistingEnd}. Overlap: ${overlapDetected}`);

            if (overlapDetected) {
              // Mark user for overlap conflict
              conflictingIds.add(userId);
              overlappingConflictIds.add(userId);
              continue; // If they overlap, no need to check for break time
            }

            // --- Break Check (only if they DON'T overlap and minBreakMinutes > 0) ---
            if (minBreakMinutes > 0) {
              let breakMinutes = -1; // Default to no calculable break
              
              // Calculate break time only if slots are sequential (non-overlapping)
              if (slotStart >= normalizedExistingEnd) { // New slot starts after or exactly when existing ends
                breakMinutes = slotStart - normalizedExistingEnd;
              } else if (existingStart >= normalizedSlotEnd) { // Existing slot starts after or exactly when new ends
                breakMinutes = existingStart - normalizedSlotEnd;
              }
              
              // Log the break check
              // console.log(`[AssignModal Check] User ${userId}: Calculated break: ${breakMinutes} mins. Required: ${minBreakMinutes}`);

              // Check if the calculated break is insufficient
              if (breakMinutes !== -1 && breakMinutes < minBreakMinutes) {
                 // Mark user for break time conflict
                conflictingIds.add(userId);
                breakConflictIds.add(userId);
              }
            }
          }
        });
        // Removed the outer if(minBreakMinutes > 0) check for the loop, as overlap check should always run

        // Mark employees as assigned or not
        const availabilityMap = new Map();
        availability?.forEach(item => {
          availabilityMap.set(item.user_id, item.status);
        });

        // Process and filter employees
        const processedEmployees = allProfiles.map(profile => {
          // Check if this employee is already assigned to the slot
          const isAssigned = slot.assigned_employees.includes(profile.id);
          
          // Determine availability status
          const availabilityStatus = (availabilityMap.get(profile.id) || 'unknown');
          
          // Calculate match score for sorting (higher is better)
          let matchScore = 0;
          
          // Performance score boost - prioritize employees with higher performance ratings
          if (profile.performance_score) {
            // Score 0-100 scaled down to add up to 10 points for perfect performance
            matchScore += profile.performance_score / 10;
          }
          
          // Shift preference match
          if (profile.shift_preference && matchesShiftPreference(profile.shift_preference)) {
            matchScore += 5; // Increased weight
          }
          
          // Location preference match
          if (profile.preferred_location && matchesLocationPreference(profile.preferred_location)) {
            matchScore += 3; // Increased weight
          }
          
          // Time preference match - more nuanced scoring
          if (profile.custom_start_time && profile.custom_end_time) {
            const profileStartMinutes = timeToMinutes(profile.custom_start_time);
            const profileEndMinutes = timeToMinutes(profile.custom_end_time);
            const slotStartMinutes = timeToMinutes(slot.start_time);
            const slotEndMinutes = timeToMinutes(slot.end_time);

            // Handle overnight preferred times
            const adjustedProfileEndMinutes = profileEndMinutes < profileStartMinutes ? profileEndMinutes + 1440 : profileEndMinutes;
            // Handle overnight slot times
            const adjustedSlotEndMinutes = slotEndMinutes < slotStartMinutes ? slotEndMinutes + 1440 : slotEndMinutes;

            // Prioritize exact end time match
            if (profileEndMinutes === slotEndMinutes) {
              matchScore += 4; // Higher weight for exact end time match
            }

            // Check if slot is fully contained within preferred time
            if (profileStartMinutes <= slotStartMinutes && adjustedProfileEndMinutes >= adjustedSlotEndMinutes) {
              matchScore += 2; // Slot fully contained within preference
            }
            
            // Check proximity of start times (closer is better)
            const startTimeDifference = Math.abs(profileStartMinutes - slotStartMinutes);
            if (startTimeDifference <= 60) { // Within 1 hour
              matchScore += (60 - startTimeDifference) / 30; // Add up to 2 points based on proximity
            }
          }
          
          // Determine if this employee has a conflict
          const hasBreakConflict = conflictingIds.has(profile.id);
          const hasOverlappingConflict = overlappingConflictIds.has(profile.id);
          const hasBreakTimeConflict = breakConflictIds.has(profile.id);
          
          return {
            ...profile,
            isAssigned,
            availabilityStatus,
            matchScore,
            hasBreakConflict,
            hasOverlappingConflict,
            hasBreakTimeConflict,
            weeklyShifts: weeklyCountMap.get(profile.id) || 0
          };
        });

        // Sort by match score (descending) and then by name
        processedEmployees.sort((a, b) => {
          if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
          }
          return a.first_name.localeCompare(b.first_name);
        });
        
        setAvailableEmployees(processedEmployees);
      } catch (error) {
        console.error('Error fetching employees:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, [slot, minBreakMinutes]);

  // Helper function to convert time string (HH:MM) to minutes since midnight
  const timeToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Nowa funkcja do konwersji minut na format godzinowy
  const formatMinutesToHours = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
  };

  const getAvailabilityClass = (status) => {
    switch (status) {
      case 'available':
        return 'border border-green-200 bg-green-50 text-green-700';
      case 'unavailable':
        return 'border border-rota-alert-error-border bg-rota-alert-error-bg text-rota-alert-error-text';
      case 'tentative':
        return 'border border-yellow-200 bg-yellow-50 text-yellow-700';
      default:
        return 'border border-rota-modal-border bg-rota-day-other-bg-from text-rota-text-muted';
    }
  };

  const checkUserNote = async (employeeId) => {
    try {
      // Check if user has a note for this day in availability table
      const { data, error } = await supabase
        .from('availability')
        .select('id, comment')
        .eq('user_id', employeeId)
        .eq('date', slot.date);

      if (error) {
        console.error('Error checking user note in availability:', error);
        return null;
      }

      // Return the first comment if found
      if (data && data.length > 0 && data[0].comment && data[0].comment.trim() !== '') {
        return {
          id: data[0].id,
          note: data[0].comment
        };
      }

      return null;
    } catch (err) {
      console.error('Error in checkUserNote:', err);
      return null;
    }
  };

  const handleAssignEmployee = async (employeeId, isCurrentlyAssigned, taskText) => {
    // If we're removing the employee, just do it without checking for notes
    if (isCurrentlyAssigned) {
      processAssignment(employeeId, isCurrentlyAssigned, taskText);
      return;
    }

    // If we're adding the employee, check for notes
    const employee = availableEmployees.find(emp => emp.id === employeeId);
    const noteData = await checkUserNote(employeeId);

    if (noteData && noteData.note) {
      // Set data for the note modal
      setUserNoteData({
        note: noteData.note,
        employee: employee,
        employeeId: employeeId,
        isCurrentlyAssigned: isCurrentlyAssigned,
        taskText: taskText
      });
      setShowUserNoteModal(true);
    } else {
      // No note, proceed with assignment
      processAssignment(employeeId, isCurrentlyAssigned, taskText);
    }
  };

  const processAssignment = (employeeId, isCurrentlyAssigned, taskText) => {
    onAssign(employeeId, !isCurrentlyAssigned, taskText);
    
    // Update local state to reflect the change and track capacity
    if (isCurrentlyAssigned) {
      // Removing employee
      setLocalAssignedCount(prev => prev - 1);
    } else {
      // Adding employee
      const newCount = localAssignedCount + 1;
      setLocalAssignedCount(newCount);
      
      // Show capacity alert if we've just reached full capacity
      if (newCount === slot.capacity) {
        setShowCapacityAlert(true);
      }
    }
    
    // Update local state to reflect the change
    setAvailableEmployees(prev => 
      prev.map(emp => 
        emp.id === employeeId 
          ? { ...emp, isAssigned: !isCurrentlyAssigned } 
          : emp
      )
    );
    
    // Clear the task input field after assignment
    setTask('');
    setShowTaskSuggestions(false);
  };

  const handleConfirmAssign = () => {
    if (userNoteData) {
      processAssignment(
        userNoteData.employeeId,
        userNoteData.isCurrentlyAssigned,
        userNoteData.taskText
      );
      setUserNoteData(null);
      setShowUserNoteModal(false);
    }
  };

  const handleCancelAssign = () => {
    setUserNoteData(null);
    setShowUserNoteModal(false);
  };

  // Filter and sort by selected tab, then by name search
  const getFilteredEmployees = () => {
    if (!slot) {
      return availableEmployees;
    }

    const query = searchQuery.trim().toLowerCase();

    return availableEmployees.filter(employee => {
      const availabilityStatus = employee.availabilityStatus?.toLowerCase() || 'unknown';
      const isAvailableToday = availabilityStatus === 'available';
      const locationMatches = matchesLocationPreference(employee.preferred_location);
      const locationDifferent = hasDifferentLocationPreference(employee.preferred_location);
      const shiftMatches = matchesShiftPreference(employee.shift_preference);

      let matchesTab = true;
      if (selectedTab === 'other_locations') {
        matchesTab = employee.preferred_location && locationDifferent;
      } else if (selectedTab === 'assigned') {
        matchesTab = employee.isAssigned;
      } else if (selectedTab === 'available') {
        matchesTab = !employee.isAssigned &&
               !employee.hasOverlappingConflict &&
               !employee.hasBreakTimeConflict &&
               isAvailableToday &&
               shiftMatches &&
               locationMatches;
      } else if (selectedTab === 'other_shifts') {
        matchesTab = !employee.isAssigned &&
               !employee.hasOverlappingConflict &&
               !employee.hasBreakTimeConflict &&
               isAvailableToday &&
               !shiftMatches &&
               !!employee.shift_preference &&
               locationMatches;
      } else if (selectedTab === 'conflicts') {
        matchesTab = !employee.isAssigned &&
               (employee.hasOverlappingConflict || employee.hasBreakTimeConflict);
      } else if (selectedTab === 'unavailable') {
        matchesTab = !employee.isAssigned && availabilityStatus !== 'available';
      }

      if (!matchesTab) return false;
      if (!query) return true;

      const name = `${employee.first_name || ''} ${employee.last_name || ''}`.toLowerCase();
      return name.includes(query);
    });
  };

  const filteredEmployees = getFilteredEmployees();

  const capacityPercentage = (localAssignedCount / slot.capacity) * 100;
  const capacityColorClass = 
    capacityPercentage >= 100 ? 'bg-red-500' : 
    capacityPercentage >= 75 ? 'bg-yellow-500' : 
    'bg-green-500';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="flex w-full max-w-[95vw] md:max-w-6xl max-h-[95vh] flex-col overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg shadow-2xl">
        <div className="border-b border-rota-modal-border bg-gradient-to-r from-rota-day-other-bg-from to-rota-modal-bg">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <h3 className="text-sm font-bold text-rota-text-primary">
                  {slot.location}
                </h3>
              </div>
              <div className="hidden md:block h-8 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                  <span className="text-sm font-semibold text-rota-text-primary">
                    {getFormattedDate(slot.date)}
                  </span>
                  <span className="hidden md:inline text-rota-text-muted">•</span>
                  <span className="text-sm font-semibold text-rota-text-primary flex items-center gap-1">
                    <svg className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatTimeWithoutSeconds(slot.start_time)} - {formatTimeWithoutSeconds(slot.end_time)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Capacity Badge */}
              <div className={`flex items-center gap-2 rounded-full px-4 py-1.5 shadow-sm border-2 ${
                localAssignedCount >= slot.capacity 
                  ? 'bg-red-100 border-red-400 text-rota-alert-error-text' 
                  : capacityPercentage >= 75 
                    ? 'bg-yellow-100 border-yellow-400 text-yellow-700'
                    : 'bg-green-100 border-green-400 text-green-700'
              }`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="font-bold text-sm">
                  {localAssignedCount}/{slot.capacity}
                </span>
              </div>

              <button
                onClick={() => setIsTaskSectionExpanded(!isTaskSectionExpanded)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition shadow-sm border-2 ${
                  isTaskSectionExpanded 
                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700' 
                    : 'bg-white text-rota-text-primary border-rota-input-border hover:bg-rota-btn-primary-hover-bg'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="hidden sm:inline">Task</span>
                <svg className={`h-4 w-4 transition-transform ${isTaskSectionExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {isTaskSectionExpanded && (
            <div className="border-t border-rota-modal-border bg-blue-50/30 px-5 py-3">
              <div className="relative">
                <label htmlFor="task-input" className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-rota-text-primary">
                  <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Assign Task <span className="text-xs font-normal text-rota-text-muted">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="task-input"
                    value={task}
                    onChange={handleTaskChange}
                    placeholder="e.g. VMU cover"
                    className="w-full rounded-md border border-rota-input-border bg-rota-modal-bg px-3 py-2 text-sm text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring"
                  />
                  {task && (
                    <button 
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-rota-text-muted transition hover:text-rota-text-primary"
                      onClick={() => setTask('')}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {showTaskSuggestions && (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-rota-modal-border bg-white shadow-lg">
                    <ul className="py-1">
                      {taskSuggestions
                        .filter(suggestion => suggestion.toLowerCase().includes(task.toLowerCase()))
                        .map((suggestion, index) => (
                          <li 
                            key={index} 
                            className="cursor-pointer px-3 py-2 text-sm text-rota-text-primary hover:bg-rota-btn-primary-hover-bg"
                            onClick={() => handleTaskSuggestionClick(suggestion)}
                          >
                            {suggestion}
                          </li>
                        ))
                      }
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 border-b border-gray-200 px-5 py-3">
          {showCapacityAlert && (
            <div className="flex items-start gap-2 rounded-lg border border-rota-alert-error-border bg-rota-alert-error-bg p-3 text-sm text-rota-alert-error-text">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-medium">Full capacity reached</p>
                <p className="text-xs text-rota-alert-error-text">
                  Remove someone from this slot before assigning another team member.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="sm:hidden">
              <label className="mb-1 block text-sm font-medium text-rota-text-primary">Filter</label>
              <select
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="w-full rounded-md border border-rota-input-border bg-rota-modal-bg px-3 py-2 text-sm text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring"
              >
                <option value="available">Available ({slot.shift_type} shift)</option>
                <option value="other_shifts">Other Shifts</option>
                <option value="assigned">Assigned</option>
                <option value="conflicts">Conflicts</option>
                <option value="unavailable">Unavailable</option>
                <option value="other_locations">Other Locations</option>
              </select>
            </div>

            <div className="hidden gap-2 sm:flex">
              {[
                { id: 'available', label: `Available (${slot.shift_type})` },
                { id: 'other_shifts', label: 'Other Shifts' },
                { id: 'assigned', label: 'Assigned' },
                { id: 'conflicts', label: 'Conflicts' },
                { id: 'unavailable', label: 'Unavailable' },
                { id: 'other_locations', label: 'Other Locations' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`flex-1 rounded-full border px-3 py-2 text-sm font-medium transition ${
                    selectedTab === tab.id
                      ? 'border-black bg-black text-white'
                      : 'border-rota-modal-border bg-rota-modal-bg text-rota-text-primary hover:bg-rota-btn-primary-hover-bg'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-black"></div>
              <div className="text-sm text-rota-text-muted">Loading employees...</div>
            </div>
          ) : availableEmployees.length === 0 ? (
            <div className="flex justify-center py-6">
              <p className="text-sm text-rota-text-muted">No employees found. Please check database connection.</p>
            </div>
          ) : filteredEmployees.length > 0 ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredEmployees.map(employee => (
                <li 
                  key={employee.id} 
                  className={`flex items-center justify-between rounded-full border-2 px-4 py-2.5 transition-all ${
                    employee.isAssigned 
                      ? 'border-green-400 bg-gradient-to-r from-green-100 to-emerald-100 shadow-md' 
                      : 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 hover:border-blue-400 hover:shadow-lg'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-rota-text-primary truncate">
                      {employee.first_name} {employee.last_name}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    {selectedTab === 'unavailable' && (
                      <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        employee.availabilityStatus?.toLowerCase() === 'unavailable' 
                          ? 'bg-red-200 text-red-800'
                          : employee.availabilityStatus?.toLowerCase() === 'holiday'
                          ? 'bg-purple-200 text-purple-800'
                          : 'bg-gray-200 text-rota-text-primary'
                      }`}>
                        {employee.availabilityStatus?.toLowerCase() === 'unavailable' 
                          ? 'Unavail' 
                          : employee.availabilityStatus?.toLowerCase() === 'holiday'
                          ? 'Holiday'
                          : 'Unknown'}
                      </span>
                    )}
                    
                    <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignEmployee(employee.id, employee.isAssigned, task);
                    }}
                    className={`ml-2 flex-shrink-0 flex items-center justify-center rounded-full w-8 h-8 transition-all ${
                      employee.isAssigned
                        ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm hover:scale-110'
                        : employee.hasBreakConflict || employee.hasOverlappingConflict
                          ? 'cursor-not-allowed bg-orange-300 text-orange-700'
                          : localAssignedCount >= slot.capacity
                            ? 'cursor-not-allowed bg-gray-300 text-rota-text-muted'
                            : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm hover:scale-110'
                    }`}
                    disabled={(!employee.isAssigned && localAssignedCount >= slot.capacity) || (!employee.isAssigned && (employee.hasBreakConflict || employee.hasOverlappingConflict))}
                    title={
                      employee.isAssigned
                        ? 'Remove from shift'
                        : employee.hasOverlappingConflict 
                        ? `Scheduling conflict - already assigned to overlapping shift` 
                        : employee.hasBreakTimeConflict
                        ? `Needs at least ${formatMinutesToHours(minBreakMinutes)} break`
                        : 'Assign to shift'
                    }
                  >
                    {employee.isAssigned ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : employee.hasOverlappingConflict || employee.hasBreakTimeConflict ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-rota-text-muted">
              {searchQuery.trim() ? (
                <p>No people match this search.</p>
              ) : selectedTab === 'available' ? (
                <div className="space-y-1">
                  <p>No employees who prefer {slot.shift_type} shifts are available.</p>
                  <p className="text-xs text-rota-text-muted">Check the &quot;Other Shifts&quot; tab to see staff with different preferences.</p>
                </div>
              ) : selectedTab === 'other_shifts' ? (
                <div className="space-y-1">
                  <p>No employees with different shift preferences are available.</p>
                  <p className="text-xs text-rota-text-muted">All available staff prefer {slot.shift_type} shifts.</p>
                </div>
              ) : selectedTab === 'other_locations' ? (
                <div className="space-y-1">
                  <p>No employees from other locations found.</p>
                  <p className="text-xs text-rota-text-muted">All staff are assigned to {slot.location} or have it as their preferred location.</p>
                </div>
              ) : (
                <p>No matching employees found.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-rota-modal-border bg-rota-day-other-bg-from px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-full border-2 border-rota-text-primary px-6 py-2 text-sm font-medium text-rota-text-primary bg-rota-modal-bg hover:bg-rota-day-other-bg-from"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
  
  // Use React Portal to render the modal outside the normal DOM hierarchy
  return (
    <>
      {createPortal(modalContent, document.body)}
      
      {showUserNoteModal && userNoteData && (
        <UserNoteModal
          note={userNoteData.note}
          employee={userNoteData.employee}
          date={slot.date}
          onClose={handleCancelAssign}
          onConfirm={handleConfirmAssign}
        />
      )}
    </>
  );
};

AssignModal.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string.isRequired,
    date: PropTypes.string.isRequired,
    shift_type: PropTypes.string.isRequired,
    location: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    capacity: PropTypes.number.isRequired,
    assigned_employees: PropTypes.array.isRequired
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onAssign: PropTypes.func.isRequired
};

export default AssignModal; 