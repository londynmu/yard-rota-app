import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import { format, parseISO } from 'date-fns';

const AssignModal = ({ slot, onClose, onAssign }) => {
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');
  const [localAssignedCount, setLocalAssignedCount] = useState(slot.assigned_employees.length);
  const [showCapacityAlert, setShowCapacityAlert] = useState(false);
  const [minBreakMinutes, setMinBreakMinutes] = useState(60); // Default value

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
            custom_end_time
          `)
          .eq('is_active', true)
          .order('first_name');

        if (error) throw error;
        
        const allProfiles = profiles; // Use only regular profiles

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
            hasBreakTimeConflict
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

  const handleAssignEmployee = (employeeId, isCurrentlyAssigned) => {
    onAssign(employeeId, !isCurrentlyAssigned);
    
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
  };

  // Filter and sort by selected tab
  const getFilteredEmployees = () => {
    return availableEmployees
      .filter(employee => {
        // Filter based on tab and other criteria
        if (selectedTab === 'assigned') {
          return employee.isAssigned;
        } else if (selectedTab === 'available') {
          return !employee.isAssigned && 
                 !employee.hasOverlappingConflict && 
                 !employee.hasBreakTimeConflict && 
                 employee.availabilityStatus.toLowerCase() === 'available';
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
        <div className="p-4 border-b border-white/20 flex justify-between items-center sticky top-0 bg-black/90 z-10">
          <h3 className="text-xl font-medium text-white">
            {slot.location}: {getFormattedDate(slot.date)}, {formatTimeWithoutSeconds(slot.start_time)} - {formatTimeWithoutSeconds(slot.end_time)}
          </h3>
          <button 
            onClick={onClose} 
            className="text-white/70 hover:text-white ml-2 flex-shrink-0"
          >
            <span className="sr-only">Close</span>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Information about scheduling constraints */}
        {minBreakMinutes > 0 && (
          <div className="mx-4 mt-4 p-3 bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 rounded-md text-blue-100 flex items-center hidden sm:flex">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 4a1 1 0 011 1v4a1 1 0 11-2 0v-4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <div className="text-sm">
              <p>Scheduling conflicts are detected automatically:</p>
              <ul className="list-disc list-inside mt-1 ml-2">
                <li><span className="font-semibold">Shift Overlap</span>: Staff cannot be assigned to shifts that overlap with existing assignments</li>
                <li><span className="font-semibold">Minimum Time Off</span>: Staff must have at least {formatMinutesToHours(minBreakMinutes)} off between shifts</li>
              </ul>
              <p className="mt-1">Staff with scheduling conflicts appear in the &quot;Conflicts&quot; tab.</p>
            </div>
          </div>
        )}
        
        {/* Capacity Alert - Shows immediately when capacity is reached */}
        {showCapacityAlert && (
          <div className="mx-4 mt-4 p-3 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-md text-red-100 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Full capacity has been reached. You cannot assign more staff to this slot.</span>
          </div>
        )}
        
        <div className="p-4 border-b border-white/20 bg-black/90 sticky top-[65px] z-10">
          {/* Mobile: dropdown selector */}
          <div className="sm:hidden mb-3">
            <select
              value={selectedTab}
              onChange={(e) => setSelectedTab(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-md text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="conflicts">Conflicts</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          {/* Desktop / tablet: tab buttons */}
          <div className="hidden sm:flex w-full">
            <button
              onClick={() => setSelectedTab('available')}
              className={`px-3 py-2 flex-1 sm:rounded-l-md rounded-t-md ${
                selectedTab === 'available' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border`}
            >
              Available
            </button>
            <button
              onClick={() => setSelectedTab('assigned')}
              className={`px-3 py-2 flex-1 ${
                selectedTab === 'assigned' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t sm:border-t border-b`}
            >
              Assigned
            </button>
            <button
              onClick={() => setSelectedTab('conflicts')}
              className={`px-3 py-2 flex-1 ${
                selectedTab === 'conflicts' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border-t border-b`}
            >
              Conflicts
            </button>
            <button
              onClick={() => setSelectedTab('unavailable')}
              className={`px-3 py-2 flex-1 sm:rounded-r-md rounded-b-md ${
                selectedTab === 'unavailable' 
                  ? 'bg-blue-600/30 border-blue-400/30 text-white' 
                  : 'bg-white/10 border-white/20 text-white/70'
              } border`}
            >
              Unavailable
            </button>
          </div>
          
          {/* Enhanced Capacity Indicator */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1 text-white">
              <span className="font-medium">Staff Capacity</span>
              <span className={localAssignedCount >= slot.capacity ? "text-red-300 font-bold" : "text-white/80"}>
                {localAssignedCount}/{slot.capacity}
                {localAssignedCount >= slot.capacity && (
                  <span className="ml-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-2.5">
              <div className={`${capacityColorClass} h-2.5 rounded-full transition-all duration-300`} style={{ width: `${Math.min(100, capacityPercentage)}%` }}></div>
            </div>
            {localAssignedCount >= slot.capacity && (
              <p className="text-red-300 text-sm mt-1">Full capacity reached. You cannot assign more staff.</p>
            )}
          </div>
        </div>
        
        <div className="overflow-y-auto p-4 flex-1">
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
            </div>
          ) : getFilteredEmployees().length > 0 ? (
            <ul className="space-y-2">
              {getFilteredEmployees().map(employee => (
                <li 
                  key={employee.id} 
                  className="bg-white/5 backdrop-blur-sm rounded-md p-3 border border-white/10 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                      {employee.avatar_url ? (
                        <img 
                          src={employee.avatar_url} 
                          alt={employee.first_name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-medium text-white">
                          {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                        </span>
                      )}
                    </div>
                    
                    <div>
                      <div className="font-medium text-white">
                        {employee.first_name} {employee.last_name}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getAvailabilityClass(employee.availabilityStatus)}`}>
                          {employee.availabilityStatus}
                        </span>
                        
                        {employee.shift_preference === slot.shift_type && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                            Preferred shift
                          </span>
                        )}
                        
                        {(employee.preferred_location === slot.location || employee.preferred_location === 'Both') && (
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                            Preferred location
                          </span>
                        )}
                        
                        {employee.hasBreakConflict && (
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300">
                            Break conflict
                          </span>
                        )}
                        
                        {/* Display Preferred Time Range */}
                        {employee.custom_start_time && employee.custom_end_time && (
                          <span className="text-xs px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                            Pref: {employee.custom_start_time} - {employee.custom_end_time}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleAssignEmployee(employee.id, employee.isAssigned)}
                    className={`px-3 py-1.5 rounded text-sm flex-shrink-0 ${
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
                        ? `This staff member has a scheduling conflict - already assigned to an overlapping shift during this time` 
                        : employee.hasBreakTimeConflict
                        ? `This staff member needs at least ${formatMinutesToHours(minBreakMinutes)} time off between shifts`
                        : ''
                    }
                  >
                    {employee.isAssigned ? 'Remove' : employee.hasOverlappingConflict ? 'Shift Overlap' : employee.hasBreakTimeConflict ? 'Break Too Short' : 'Assign'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-6 text-white/70">
              <p>No matching employees found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/20 flex justify-end sticky bottom-0 bg-black/90 z-10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-md text-white hover:bg-white/20 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
  
  // Use React Portal to render the modal outside the normal DOM hierarchy
  return createPortal(modalContent, document.body);
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