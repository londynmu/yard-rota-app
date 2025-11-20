import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import { format, parseISO } from 'date-fns';
import UserNoteModal from './UserNoteModal';

const AssignModal = ({ slot, onClose, onAssign }) => {
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');
  const [localAssignedCount, setLocalAssignedCount] = useState(slot.assigned_employees.length);
  const [showCapacityAlert, setShowCapacityAlert] = useState(false);
  const [minBreakMinutes, setMinBreakMinutes] = useState(60); // Default value
  const [task, setTask] = useState('');
  const [taskSuggestions, setTaskSuggestions] = useState([]);
  const [showTaskSuggestions, setShowTaskSuggestions] = useState(false);
  const [showUserNoteModal, setShowUserNoteModal] = useState(false);
  const [userNoteData, setUserNoteData] = useState(null);

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
            console.log('Weekly data fetched:', weeklyCountsData?.length || 0, 'records');

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

        console.log('Weekly counts calculated:', [...weeklyCountMap.entries()]);

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

        // Log conflict flags before setting state
        console.log('[AssignModal Check] Processed Employees with Conflict Flags:');
        processedEmployees.forEach(emp => {
          console.log(`- ${emp.first_name} ${emp.last_name}: Overlap=${emp.hasOverlappingConflict}, Break=${emp.hasBreakTimeConflict}`);
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
        return 'border border-red-200 bg-red-50 text-red-700';
      case 'tentative':
        return 'border border-yellow-200 bg-yellow-50 text-yellow-700';
      default:
        return 'border border-gray-200 bg-gray-50 text-gray-600';
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

  // Filter and sort by selected tab
  const getFilteredEmployees = () => {
    if (!slot) {
      return availableEmployees;
    }

    return availableEmployees.filter(employee => {
      const availabilityStatus = employee.availabilityStatus?.toLowerCase() || 'unknown';
      const isAvailableToday = availabilityStatus === 'available';
      const locationMatches = matchesLocationPreference(employee.preferred_location);
      const locationDifferent = hasDifferentLocationPreference(employee.preferred_location);
      const shiftMatches = matchesShiftPreference(employee.shift_preference);

      if (selectedTab === 'other_locations') {
        return employee.preferred_location && locationDifferent;
      }

      if (selectedTab === 'assigned') {
        return employee.isAssigned;
      }

      if (selectedTab === 'available') {
        return !employee.isAssigned &&
               !employee.hasOverlappingConflict &&
               !employee.hasBreakTimeConflict &&
               isAvailableToday &&
               shiftMatches &&
               locationMatches;
      }

      if (selectedTab === 'other_shifts') {
        return !employee.isAssigned &&
               !employee.hasOverlappingConflict &&
               !employee.hasBreakTimeConflict &&
               isAvailableToday &&
               !shiftMatches &&
               !!employee.shift_preference &&
               locationMatches;
      }

      if (selectedTab === 'conflicts') {
        return !employee.isAssigned &&
               (employee.hasOverlappingConflict || employee.hasBreakTimeConflict);
      }

      if (selectedTab === 'unavailable') {
        return !employee.isAssigned && availabilityStatus !== 'available';
      }
      
      return true;
    });
  };

  const capacityPercentage = (localAssignedCount / slot.capacity) * 100;
  const capacityColorClass = 
    capacityPercentage >= 100 ? 'bg-red-500' : 
    capacityPercentage >= 75 ? 'bg-yellow-500' : 
    'bg-green-500';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-charcoal">
              {slot.location}
            </h3>
            <p className="text-sm text-gray-600">
              {getFormattedDate(slot.date)}, {formatTimeWithoutSeconds(slot.start_time)} - {formatTimeWithoutSeconds(slot.end_time)}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 transition hover:text-charcoal"
          >
            <span className="sr-only">Close</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 border-b border-gray-200 px-5 py-4">
          <div className="relative">
            <label htmlFor="task-input" className="mb-1 block text-sm font-medium text-charcoal">
              Assign Task <span className="text-xs text-gray-500">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                id="task-input"
                value={task}
                onChange={handleTaskChange}
                placeholder="e.g. VMU cover"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
              />
              {task && (
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-charcoal"
                  onClick={() => setTask('')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {showTaskSuggestions && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                <ul className="py-1">
                  {taskSuggestions
                    .filter(suggestion => suggestion.toLowerCase().includes(task.toLowerCase()))
                    .map((suggestion, index) => (
                      <li 
                        key={index} 
                        className="cursor-pointer px-3 py-2 text-sm text-charcoal hover:bg-gray-100"
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

          {minBreakMinutes > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 011 1v4a1 1 0 11-2 0v-4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-medium">Scheduling checks enabled</p>
                <p className="text-xs text-blue-600">
                  We will prevent overlapping shifts and enforce a minimum break of {formatMinutesToHours(minBreakMinutes)}.
                </p>
              </div>
            </div>
          )}

          {showCapacityAlert && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="font-medium">Full capacity reached</p>
                <p className="text-xs text-red-600">
                  Remove someone from this slot before assigning another team member.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="sm:hidden">
              <label className="mb-1 block text-sm font-medium text-charcoal">Filter</label>
              <select
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
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
                      : 'border-gray-200 bg-white text-charcoal hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium text-charcoal">Staff Capacity</span>
                <span className={localAssignedCount >= slot.capacity ? 'font-semibold text-red-600' : 'text-gray-600'}>
                  {localAssignedCount}/{slot.capacity}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className={`${capacityColorClass} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.min(100, capacityPercentage)}%` }}
                ></div>
              </div>
              {localAssignedCount >= slot.capacity && (
                <p className="mt-1 text-xs text-red-600">Full capacity reached.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-black"></div>
              <div className="text-sm text-gray-600">Loading employees...</div>
            </div>
          ) : availableEmployees.length === 0 ? (
            <div className="flex justify-center py-6">
              <p className="text-sm text-gray-600">No employees found. Please check database connection.</p>
            </div>
          ) : getFilteredEmployees().length > 0 ? (
            <ul className="space-y-3">
              {getFilteredEmployees().map(employee => (
                <li 
                  key={employee.id} 
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
                      {employee.avatar_url ? (
                        <img 
                          src={employee.avatar_url} 
                          alt={employee.first_name} 
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-medium text-gray-600">
                          {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                        </span>
                      )}
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                        {employee.first_name} {employee.last_name}
                        {typeof employee.weeklyShifts === 'number' && (
                          <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-bold text-gray-700">
                            {employee.weeklyShifts}
                          </span>
                        )}
                        {employee.performance_score && (
                          <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                            {employee.performance_score}
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${getAvailabilityClass(employee.availabilityStatus)}`}>
                          {employee.availabilityStatus}
                        </span>
                        
                        <div className="flex items-center gap-1 text-gray-400">
                          <span className={employee.shift_preference === slot.shift_type ? 'text-blue-500' : ''} title="Preferred shift">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </span>
                          <span className={(employee.preferred_location === slot.location || employee.preferred_location === 'Both') ? 'text-purple-500' : ''} title="Preferred location">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          </span>
                          {employee.custom_start_time && employee.custom_end_time && (
                            <span className="text-teal-500" title={`Preferred time: ${employee.custom_start_time} - ${employee.custom_end_time}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                          {employee.hasBreakConflict && (
                            <span className="text-orange-500" title="Break time conflict">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignEmployee(employee.id, employee.isAssigned, task);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      employee.isAssigned
                        ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : employee.hasBreakConflict || employee.hasOverlappingConflict
                          ? 'cursor-not-allowed border border-orange-200 bg-orange-50 text-orange-600'
                          : localAssignedCount >= slot.capacity
                            ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                            : 'border border-black bg-black text-white hover:bg-gray-800'
                    }`}
                    disabled={(!employee.isAssigned && localAssignedCount >= slot.capacity) || (!employee.isAssigned && (employee.hasBreakConflict || employee.hasOverlappingConflict))}
                    title={
                      employee.hasOverlappingConflict 
                        ? `This staff member has a scheduling conflict - already assigned to an overlapping shift` 
                        : employee.hasBreakTimeConflict
                        ? `This staff member needs at least ${formatMinutesToHours(minBreakMinutes)} time off between shifts`
                        : ''
                    }
                  >
                    {employee.isAssigned ? 'Remove' : employee.hasOverlappingConflict ? 'Overlap' : employee.hasBreakTimeConflict ? 'Break' : 'Assign'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-gray-600">
              {selectedTab === 'available' ? (
                <div className="space-y-1">
                  <p>No employees who prefer {slot.shift_type} shifts are available.</p>
                  <p className="text-xs text-gray-500">Check the &quot;Other Shifts&quot; tab to see staff with different preferences.</p>
                </div>
              ) : selectedTab === 'other_shifts' ? (
                <div className="space-y-1">
                  <p>No employees with different shift preferences are available.</p>
                  <p className="text-xs text-gray-500">All available staff prefer {slot.shift_type} shifts.</p>
                </div>
              ) : selectedTab === 'other_locations' ? (
                <div className="space-y-1">
                  <p>No employees from other locations found.</p>
                  <p className="text-xs text-gray-500">All staff are assigned to {slot.location} or have it as their preferred location.</p>
                </div>
              ) : (
                <p>No matching employees found.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-charcoal hover:bg-gray-100"
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