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
          if (profile.shift_preference === slot.shift_type) {
            matchScore += 5; // Increased weight
          }
          
          // Location preference match
          if ((profile.preferred_location === slot.location || profile.preferred_location === 'Both')) {
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
        return 'bg-green-500/20 text-green-300';
      case 'unavailable':
        return 'bg-red-500/20 text-red-300';
      case 'tentative':
        return 'bg-yellow-500/20 text-yellow-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
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
    return availableEmployees
      .filter(employee => {
        // For "other_locations" tab, only show employees from different locations
        if (selectedTab === 'other_locations') {
          return employee.preferred_location !== slot.location && 
                 employee.preferred_location !== 'Both';
        }
        
        // Then filter based on tab and other criteria
        if (selectedTab === 'assigned') {
          return employee.isAssigned;
        } else if (selectedTab === 'available') {
          // Only show employees who prefer this shift type AND are available without conflicts
          // Include employees with matching location preference OR "Both" preference
          return !employee.isAssigned && 
                 !employee.hasOverlappingConflict && 
                 !employee.hasBreakTimeConflict && 
                 employee.availabilityStatus.toLowerCase() === 'available' &&
                 employee.shift_preference === slot.shift_type && // Only matching shift preference
                 (employee.preferred_location === slot.location || employee.preferred_location === 'Both');
        } else if (selectedTab === 'other_shifts') {
          // Show employees who prefer different shift types but are otherwise available
          // Include employees with matching location preference OR "Both" preference
          return !employee.isAssigned && 
                 !employee.hasOverlappingConflict && 
                 !employee.hasBreakTimeConflict && 
                 employee.availabilityStatus.toLowerCase() === 'available' &&
                 employee.shift_preference !== slot.shift_type && // Different shift preference
                 (employee.preferred_location === slot.location || employee.preferred_location === 'Both');
        } else if (selectedTab === 'conflicts') {
          return !employee.isAssigned && 
                 (employee.hasOverlappingConflict || employee.hasBreakTimeConflict);
        } else if (selectedTab === 'unavailable') {
          return !employee.isAssigned && 
                 employee.availabilityStatus.toLowerCase() !== 'available';
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="bg-black/80 border border-white/30 rounded-lg overflow-hidden max-h-[95vh] max-w-2xl w-full m-4 flex flex-col">
        <div className="p-2 border-b border-white/20 flex justify-between items-center sticky top-0 bg-black/90 z-10">
          <h3 className="text-base font-medium text-white">
            {slot.location}: {getFormattedDate(slot.date)}, {formatTimeWithoutSeconds(slot.start_time)} - {formatTimeWithoutSeconds(slot.end_time)}
          </h3>
          <button 
            onClick={onClose} 
            className="text-white/70 hover:text-white ml-2 flex-shrink-0"
          >
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Task Assignment Input */}
        <div className="mx-3 mt-2">
          <div className="relative">
            <label htmlFor="task-input" className="block text-sm font-medium text-white mb-1">
              Assign Task <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                id="task-input"
                value={task}
                onChange={handleTaskChange}
                placeholder="e.g. VMU cover"
                className="w-full bg-white/10 border border-white/20 rounded-md text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {task && (
                <button 
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white/70 hover:text-white"
                  onClick={() => setTask('')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {showTaskSuggestions && (
              <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-white/20 rounded-md shadow-lg max-h-60 overflow-auto">
                <ul className="py-1">
                  {taskSuggestions
                    .filter(suggestion => suggestion.toLowerCase().includes(task.toLowerCase()))
                    .map((suggestion, index) => (
                      <li 
                        key={index} 
                        className="px-3 py-2 cursor-pointer hover:bg-white/10 text-white"
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
        
        {/* Hide the information about scheduling constraints on mobile */}
        {minBreakMinutes > 0 && (
          <div className="mx-3 mt-2 p-2 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-md text-blue-100 flex items-center hidden sm:flex">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 011 1v4a1 1 0 11-2 0v-4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <div className="text-xs">
              <p>Scheduling conflicts: <span className="font-medium">Shift Overlap</span> | <span className="font-medium">Min Break: {formatMinutesToHours(minBreakMinutes)}</span></p>
            </div>
          </div>
        )}
        
        {/* Capacity Alert - Shows immediately when capacity is reached */}
        {showCapacityAlert && (
          <div className="mx-3 mt-2 p-2 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-md text-red-100 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Full capacity reached. You cannot assign more staff.</span>
          </div>
        )}
        
        <div className="p-2 border-b border-white/20 bg-black/90 sticky top-[50px] z-10">
          {/* Mobile: dropdown selector */}
          <div className="sm:hidden mb-2">
            <select
              value={selectedTab}
              onChange={(e) => setSelectedTab(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-md text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="available">Available ({slot.shift_type} Shift)</option>
              <option value="other_shifts">Other Shifts</option>
              <option value="assigned">Assigned</option>
              <option value="conflicts">Conflicts</option>
              <option value="unavailable">Unavailable</option>
              <option value="other_locations">Other Locations</option>
            </select>
          </div>

          {/* Desktop / tablet: tab buttons */}
          <div className="hidden sm:flex w-full">
            <button
              onClick={() => setSelectedTab('available')}
              className={`px-3 py-1.5 flex-1 sm:rounded-tl-md ${
                selectedTab === 'available' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-l border-t border-b`}
            >
              Available ({slot.shift_type})
            </button>
            <button
              onClick={() => setSelectedTab('other_shifts')}
              className={`px-3 py-1.5 flex-1 ${
                selectedTab === 'other_shifts' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t border-b`}
            >
              Other Shifts
            </button>
            <button
              onClick={() => setSelectedTab('assigned')}
              className={`px-3 py-1.5 flex-1 ${
                selectedTab === 'assigned' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t border-b`}
            >
              Assigned
            </button>
            <button
              onClick={() => setSelectedTab('conflicts')}
              className={`px-3 py-1.5 flex-1 ${
                selectedTab === 'conflicts' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t border-b`}
            >
              Conflicts
            </button>
            <button
              onClick={() => setSelectedTab('unavailable')}
              className={`px-3 py-1.5 flex-1 ${
                selectedTab === 'unavailable' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t border-b`}
            >
              Unavailable
            </button>
            <button
              onClick={() => setSelectedTab('other_locations')}
              className={`px-3 py-1.5 flex-1 sm:rounded-tr-md ${
                selectedTab === 'other_locations' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-r border-t border-b`}
            >
              Other Locations
            </button>
          </div>
          
          {/* Enhanced Capacity Indicator */}
          <div className="mt-2">
            <div className="flex justify-between items-center mb-1 text-white">
              <span className="font-medium text-xs">Staff Capacity</span>
              <span className={localAssignedCount >= slot.capacity ? "text-red-300 font-bold text-xs" : "text-white/80 text-xs"}>
                {localAssignedCount}/{slot.capacity}
                {localAssignedCount >= slot.capacity && (
                  <span className="ml-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-2">
              <div className={`${capacityColorClass} h-2 rounded-full transition-all duration-300`} style={{ width: `${Math.min(100, capacityPercentage)}%` }}></div>
            </div>
            {localAssignedCount >= slot.capacity && (
              <p className="text-red-300 text-xs mt-1">Full capacity reached.</p>
            )}
          </div>
        </div>
        
        <div className="overflow-y-auto p-2 flex-1">
          {loading ? (
            <div className="flex flex-col items-center py-2 gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
              <div className="text-white/70 text-sm">Loading employees...</div>
            </div>
          ) : availableEmployees.length === 0 ? (
            <div className="flex justify-center py-2">
              <p className="text-white/70 text-sm">No employees found. Please check database connection.</p>
            </div>
          ) : getFilteredEmployees().length > 0 ? (
            <ul className="space-y-2">
              {getFilteredEmployees().map(employee => (
                <li 
                  key={employee.id} 
                  className="bg-white/5 backdrop-blur-sm rounded-md p-2 border border-white/10 flex justify-between items-center"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                      {employee.avatar_url ? (
                        <img 
                          src={employee.avatar_url} 
                          alt={employee.first_name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-medium text-white">
                          {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                        </span>
                      )}
                    </div>
                    
                    <div>
                      <div className="font-medium text-white flex items-center gap-1">
                        {employee.first_name} {employee.last_name}
                        {typeof employee.weeklyShifts === 'number' && (
                          <span className="bg-white text-black font-bold text-xs px-1 py-0.5 rounded-md shadow-sm border border-white/10">
                            {employee.weeklyShifts}
                          </span>
                        )}
                        
                        {/* Performance score badge */}
                        {employee.performance_score && (
                          <span className="bg-green-500/20 border border-green-500/30 text-green-300 font-bold text-xs px-1 py-0.5 rounded-md ml-1">
                            {employee.performance_score}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {/* Availability status */}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getAvailabilityClass(employee.availabilityStatus)}`}>
                          {employee.availabilityStatus}
                        </span>
                        
                        {/* Star rating system for preferences */}
                        <div className="flex space-x-1 items-center">
                          {/* Preferred shift star */}
                          <span className={`${employee.shift_preference === slot.shift_type ? 'text-blue-500' : 'text-white/20'}`} title="Preferred shift">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </span>
                          
                          {/* Preferred location star */}
                          <span className={`${(employee.preferred_location === slot.location || employee.preferred_location === 'Both') ? 'text-purple-500' : 'text-white/20'}`} title="Preferred location">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          </span>
                          
                          {/* Preferred time icon */}
                          {employee.custom_start_time && employee.custom_end_time && (
                            <span className="text-teal-500" title={`Preferred time: ${employee.custom_start_time} - ${employee.custom_end_time}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </div>
                        
                        {/* Break conflict warning */}
                        {employee.hasBreakConflict && (
                          <span className="text-orange-500" title="Break time conflict">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssignEmployee(employee.id, employee.isAssigned, task);
                    }}
                    className={`px-2 py-1 rounded text-xs flex-shrink-0 ${
                      employee.isAssigned
                        ? 'bg-red-500/20 border-red-400/30 text-red-200 hover:bg-red-500/30'
                        : employee.hasBreakConflict
                          ? 'bg-orange-500/20 border-orange-400/30 text-orange-200 cursor-not-allowed opacity-70'
                          : localAssignedCount >= slot.capacity
                            ? 'bg-gray-500/20 border-gray-400/30 text-gray-300 cursor-not-allowed'
                            : 'bg-green-500/20 border-green-400/30 text-green-200 hover:bg-green-500/30'
                    } border transition-colors`}
                    disabled={(!employee.isAssigned && localAssignedCount >= slot.capacity) || (!employee.isAssigned && employee.hasBreakConflict)}
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
            <div className="text-center py-4 text-white/70">
              {selectedTab === 'available' ? (
                <div>
                  <p className="text-sm">No employees who prefer {slot.shift_type} shifts are available</p>
                  <p className="text-xs mt-2">Check the &quot;Other Shifts&quot; tab to see staff with different shift preferences</p>
                </div>
              ) : selectedTab === 'other_shifts' ? (
                <div>
                  <p className="text-sm">No employees with different shift preferences are available</p>
                  <p className="text-xs mt-2">All available staff prefer {slot.shift_type} shifts</p>
                </div>
              ) : selectedTab === 'other_locations' ? (
                <div>
                  <p className="text-sm">No employees from other locations found</p>
                  <p className="text-xs mt-2">All staff are assigned to {slot.location} or have it as their preferred location</p>
                </div>
              ) : (
                <p className="text-sm">No matching employees found</p>
              )}
            </div>
          )}
        </div>
        
        <div className="p-2 border-t border-white/20 flex justify-end sticky bottom-0 bg-black/90 z-10">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-md text-white hover:bg-white/20 transition-colors text-sm"
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