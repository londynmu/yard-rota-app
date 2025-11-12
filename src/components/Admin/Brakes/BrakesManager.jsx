import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient'; // Adjust path if needed
import { useToast } from '../../../components/ui/ToastContext';
import { useAuth } from '../../../lib/AuthContext';
// Placeholder for helper components, will create later
// import SlotCard from './SlotCard';
// import StaffSelectionModal from './StaffSelectionModal';
// import EditSlotModal from './EditSlotModal';
// import AddCustomSlotForm from './AddCustomSlotForm';

const BrakesManager = () => {
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(() => {
    const savedDate = localStorage.getItem('brakes_selected_date');
    return savedDate || new Date().toISOString().split('T')[0];
  });
  
  const [selectedShift, setSelectedShift] = useState(() => {
    const savedShift = localStorage.getItem('brakes_selected_shift');
    return savedShift || 'Day';
  });

  // Check user role and profile
  useEffect(() => {
    const checkUserRole = async () => {
      if (!user) {
        setCurrentUser(null);
        setIsAdmin(false);
        return;
      }

      try {
        const { data: userProfile, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, role')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        setCurrentUser(userProfile);
        setIsAdmin(userProfile.role === 'admin');
      } catch (error) {
        console.error('Error checking user role:', error);
        setCurrentUser(null);
        setIsAdmin(false);
      }
    };

    checkUserRole();
  }, [user]);

  // Auto-navigate to today's date when entering Breaks page
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastVisitedBreaksPage = localStorage.getItem('brakes_last_visited');
    const currentVisit = Date.now().toString();
    
    // If this is a new visit to breaks page (different day or first time), set today's date
    if (!lastVisitedBreaksPage || 
        (lastVisitedBreaksPage && new Date(parseInt(lastVisitedBreaksPage)).toDateString() !== new Date().toDateString())) {
      setSelectedDate(today);
      localStorage.setItem('brakes_last_visited', currentVisit);
    }
  }, []); // Run only once when component mounts

  // Helper function to adjust time for night shift sorting
  const adjustTimeForNightShift = (timeStr, shiftType) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes;
    
    // For night shift, if time is after midnight (00:00-12:00), 
    // add 24h to sort correctly
    if (shiftType.toLowerCase() === 'night' && hours < 12) {
      totalMinutes += 24 * 60;
    }
    
    return totalMinutes;
  };

  // Helper function to sort break slots considering night shift
  const sortBreakSlots = (slots, shiftType) => {
    return slots.sort((a, b) => {
      const timeA = adjustTimeForNightShift(a.start_time, shiftType);
      const timeB = adjustTimeForNightShift(b.start_time, shiftType);
      return timeA - timeB;
    });
  };

  const [showCustomSlotForm, setShowCustomSlotForm] = useState(false);
  const [breakSlots, setBreakSlots] = useState([]); // Combined standard and custom slots
  const [scheduledBreaks, setScheduledBreaks] = useState([]); // Staff assignments { id, user_id, slot_id, break_date, user_name, preferred_shift }
  const [availableStaff, setAvailableStaff] = useState([]); // { id, first_name, last_name, preferred_shift, total_break_minutes, etc. }
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  
  // Modal state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Key for sessionStorage
  const getSessionStorageKey = useCallback(() => {
    return `brakes_temp_assignments_${selectedDate}_${selectedShift}`;
  }, [selectedDate, selectedShift]);

  // TODO: Define standard slots structure based on requirements
  const standardSlotsConfig = {
    Day: [
      // Break 1 (15 min) - 6 slots starting 09:00
      { start_time: '09:00', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      { start_time: '09:15', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      { start_time: '09:30', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      { start_time: '09:45', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      { start_time: '10:00', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      { start_time: '10:15', duration_minutes: 15, capacity: 2, break_type: 'Break 1 (15 min)' },
      // Break 2 (45 min) - 6 slots starting 12:00
      { start_time: '12:00', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
      { start_time: '12:45', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
      { start_time: '13:30', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
      { start_time: '14:15', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
      { start_time: '15:00', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
      { start_time: '15:45', duration_minutes: 45, capacity: 2, break_type: 'Break 2 (45 min)' },
    ],
    Night: [
      // 6 slots starting 21:00, 60 min, 2 people
      { start_time: '21:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
      { start_time: '22:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
      { start_time: '23:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
      { start_time: '00:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
      { start_time: '01:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
      { start_time: '02:00', duration_minutes: 60, capacity: 2, break_type: 'Night Break (60 min)' },
    ],
    Afternoon: [
      // 3 slots starting 18:00, 60 min, 2 people
      { start_time: '18:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
      { start_time: '19:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
      { start_time: '20:00', duration_minutes: 60, capacity: 2, break_type: 'Afternoon Break (60 min)' },
    ],
  };

  // const [modifiedStandardSlots, setModifiedStandardSlots] = useState({}); // Track modified standard slots - Removed, UI only now

  useEffect(() => {
    // Fetch all staff first to check data (Optional: Can be removed later)
    const fetchAllStaff = async () => {
      try {
        const { data: allProfiles, error } = await supabase
          .from('profiles')
          .select('*');
          
        if (error) {
          console.error('Error fetching profiles:', error);
          return;
        }
        
        console.log('All profiles in system (for debugging):', allProfiles);
      } catch (err) {
        console.error('Error in fetchAllStaff:', err);
      }
    };
    
    fetchAllStaff();
  }, []);

  // --- Data Fetching ---
  const fetchBreakData = useCallback(async () => {
    if (!selectedDate || !selectedShift) return;
    console.log(`[fetchBreakData] Starting fetch for Date: ${selectedDate}, Shift: ${selectedShift}`);
    setIsLoading(true);
    // Clear previous data except scheduledBreaks if found in session
    setBreakSlots([]);
    setAvailableStaff([]);

    const sessionStorageKey = getSessionStorageKey();
    let savedAssignments = sessionStorage.getItem(sessionStorageKey);

    try {
      // First, generate standard slots based on shift type
      const baseStandardSlots = standardSlotsConfig[selectedShift] || [];
  
      // Fetch modified standard slot definitions for this date/shift (where user_id is null but std_slot_id is present)
      let modifiedCapacities = {};
      try {
        const { data: modifiedSlotsData, error: modifiedSlotsError } = await supabase
          .from('scheduled_breaks')
          .select('std_slot_id, capacity') // Select std_slot_id and capacity
          .eq('date', selectedDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .is('user_id', null)
          .not('std_slot_id', 'is', null);
        
        if (modifiedSlotsError) throw modifiedSlotsError;
  
        if (modifiedSlotsData && modifiedSlotsData.length > 0) {
          console.log('[fetchBreakData] Fetched modified standard slot capacities:', modifiedSlotsData);
          modifiedSlotsData.forEach(mod => {
            if (mod.std_slot_id && mod.capacity !== null) {
              modifiedCapacities[mod.std_slot_id] = mod.capacity;
            }
          });
        }
      } catch (modSlotsErr) {
        console.warn("[fetchBreakData] Error fetching modified standard slot capacities:", modSlotsErr);
      }
  
      // Apply modified capacities to standard slots
      const standardSlotsWithIds = baseStandardSlots.map((slot, index) => {
        const slotId = `std-${selectedShift}-${index}`;
        const modifiedCapacity = modifiedCapacities[slotId];
        return {
          ...slot,
          id: slotId,
          is_custom: false,
          // Use modified capacity if available, otherwise default from config
          capacity: modifiedCapacity !== undefined ? modifiedCapacity : slot.capacity
        };
      });
      
      // Try to fetch custom slots definitions (where user_id is null and std_slot_id is null)
      let customSlotsData = [];
      try {
        const query = supabase
          .from('scheduled_breaks')
          .select('id, break_start_time, break_duration_minutes, break_type, capacity') // Fetch capacity
          .eq('date', selectedDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .is('user_id', null)
          .is('std_slot_id', null); // Only pure custom slots
          
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          console.log('[fetchBreakData] Fetched custom slot definitions:', data);
          customSlotsData = data.map(slot => ({
            id: slot.id,
            start_time: slot.break_start_time,
            duration_minutes: slot.break_duration_minutes,
            capacity: slot.capacity || 2, // Use fetched capacity or default 2 if null
            break_type: slot.break_type,
            is_custom: true
          }));
        }
      } catch (customSlotError) {
        console.warn("[fetchBreakData] Error fetching custom slot definitions:", customSlotError);
      }
  
      // Combine standard and custom slots
      const allSlots = sortBreakSlots([
        ...standardSlotsWithIds,
        ...customSlotsData
      ], selectedShift);
      
      console.log('[fetchBreakData] Combined all slots (standard + custom):', allSlots);
      setBreakSlots(allSlots);
      
      // Fetch existing break assignments or use saved session data
      let processedScheduled = [];
      if (savedAssignments) {
        try {
          processedScheduled = JSON.parse(savedAssignments);
          console.log('[fetchBreakData] Loaded assignments from sessionStorage:', processedScheduled);
          setScheduledBreaks(processedScheduled);
        } catch (parseError) {
          console.error("[fetchBreakData] Error parsing sessionStorage assignments:", parseError);
          sessionStorage.removeItem(sessionStorageKey); // Clear invalid data
          // Fallback to fetching from DB
          savedAssignments = null; // Reset flag
        }
      }

      if (!savedAssignments) {
        // Fetch from database if no valid session data
        try {
          const { data: scheduledData, error: scheduledError } = await supabase
            .from('scheduled_breaks')
            .select(`
              id, user_id, break_start_time, break_duration_minutes, break_type,
              profiles:user_id (first_name, last_name, shift_preference)
            `)
            .eq('date', selectedDate)
            .eq('shift_type', selectedShift.toLowerCase())
            .not('user_id', 'is', null); // Only actual assignments
          
          if (scheduledError) throw scheduledError;
          
          console.log('[fetchBreakData] Fetched existing assignments from DB:', scheduledData);

          // Process scheduled data to match to slots
          processedScheduled = scheduledData?.map(record => {
            if (!record.profiles) {
               console.warn(`[fetchBreakData] Assignment ${record.id} is missing profile data. Skipping.`);
               return null;
            }
            // Find the matching slot by comparing DB values and ignoring seconds in time
            const matchingSlot = allSlots.find(slot => {
              const slotDbBreakType = mapToDbBreakType(slot.break_type);
              // Normalize times to HH:MM format for comparison
              const slotTimeHHMM = slot.start_time?.substring(0, 5);
              const recordTimeHHMM = record.break_start_time?.substring(0, 5);

              return slotTimeHHMM === recordTimeHHMM && 
                     slot.duration_minutes === record.break_duration_minutes &&
                     slotDbBreakType === record.break_type; // Compare DB type to DB type
            });
            
            if (!matchingSlot) {
              console.warn(`[fetchBreakData] Could not find matching frontend slot for assignment:`, record);
            }

            return {
              id: record.id,
              slot_id: matchingSlot?.id || null, // Link to our slot ID
              user_id: record.user_id,
              break_date: selectedDate,
              user_name: `${record.profiles.first_name} ${record.profiles.last_name}`,
              preferred_shift: record.profiles.shift_preference,
              break_type: record.break_type,
              slot_data: { // Store the raw slot data from the record
                start_time: record.break_start_time,
                duration_minutes: record.break_duration_minutes,
                break_type: record.break_type
              }
            };
          }).filter(Boolean) || []; // Filter out nulls
          
          console.log('[fetchBreakData] Processed existing assignments with slot_id:', processedScheduled);
          setScheduledBreaks(processedScheduled);

        } catch (err) {
           console.error("[fetchBreakData] Error fetching existing assignments from DB:", err);
           // Continue even if assignments fail to load
           setScheduledBreaks([]); // Clear state on error
        }
      } // End fetch from DB block
      
      // Fetch available staff for the selected date (needs to run regardless of where assignments came from)
      try {
        // Step 1: Get user IDs of staff who are scheduled to work on the selected date
        console.log(`[fetchBreakData] Querying scheduled_rota for date: ${selectedDate}`);
        
        // Fetch all scheduled shifts for this date
        const { data: scheduledShifts, error: scheduledError } = await supabase
          .from('scheduled_rota')
          .select('user_id, shift_type')
          .eq('date', selectedDate)
          .not('user_id', 'is', null);
          
        if (scheduledError) {
          console.error('[fetchBreakData] Error querying scheduled_rota table:', scheduledError);
          throw scheduledError;
        }
        
        console.log(`[fetchBreakData] Scheduled shifts found for ${selectedDate}:`, scheduledShifts || []);
        
        // Filter shifts by the current selected shift type
        const filteredShifts = scheduledShifts?.filter(record => 
          record.shift_type?.toLowerCase() === selectedShift.toLowerCase()
        ) || [];

        console.log(`[fetchBreakData] Filtered shifts (shift_type='${selectedShift}'):`, filteredShifts);

        if (!filteredShifts || filteredShifts.length === 0) {
          console.log(`[fetchBreakData] No staff found scheduled for shift '${selectedShift}' on ${selectedDate}. Setting availableStaff to empty.`);
          setAvailableStaff([]);
          // We stop here if no one is scheduled for this shift on this date
        } else {
          // Step 2: Get profile details for the scheduled user IDs
          const userIds = filteredShifts.map(record => record.user_id);
          // Remove duplicates (if a user has multiple shifts)
          const uniqueUserIds = [...new Set(userIds)];
          console.log('[fetchBreakData] Unique User IDs found in scheduled_rota:', uniqueUserIds);
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, shift_preference')
            .in('id', uniqueUserIds);
            
          if (profilesError) {
            console.error('[fetchBreakData] Error fetching profiles for scheduled users:', profilesError);
            throw profilesError;
          }
          
          console.log('[fetchBreakData] Profiles found for scheduled users:', profilesData || []);
            
          // Step 3: Map profiles to our staff structure
          const processedAvailable = profilesData.map(profile => {
            return {
              id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              preferred_shift: profile.shift_preference || 'Unknown',
              is_available: true, // They are scheduled, so they are "available" for breaks
            };
          });

          console.log('[fetchBreakData] Final processed available staff list (base):', processedAvailable);
          setAvailableStaff(processedAvailable); // Set base list
        }
      } catch (err) {
        console.error("[fetchBreakData] Error processing available staff:", err);
        toast.error(`Failed to load available staff: ${err.message}`);
        setAvailableStaff([]); // Ensure it's cleared on error
      }
    } catch (err) {
      console.error('Error in fetchBreakData:', err);
      toast.error('Failed to load break data: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedShift, getSessionStorageKey, toast]); // Added getSessionStorageKey

  // NEW useEffect to calculate break times reactively based on scheduledBreaks and allSlots
  useEffect(() => {
      // Ensure we have the base staff list and slots data before calculating
      if (!availableStaff.some(s => s.total_break_minutes === undefined) || !breakSlots.length) {
        // If break times already exist or slots aren't ready, skip calculation
        // Note: Checking for undefined avoids re-calculating if staff list is already augmented
        return;
      }

      console.log('[EffectCalculateBreaks] Recalculating break times based on scheduledBreaks:', scheduledBreaks);

      const staffWithCalculatedBreaks = availableStaff.map(staff => {
          // Find user's breaks in the current scheduledBreaks
          const userBreaks = scheduledBreaks.filter(assignment => assignment.user_id === staff.id);

          // Calculate total minutes
          const totalBreakMinutes = userBreaks.reduce((total, assignment) => {
              const slotData = breakSlots.find(slot => slot.id === assignment.slot_id) || assignment.slot_data; // Use breakSlots state
              // Ensure duration_minutes is a number
              const duration = slotData?.duration_minutes;
              return total + (typeof duration === 'number' ? duration : 0);
          }, 0);

          // Calculate day shift flags
          let hasBreak15 = false;
          let hasBreak45 = false;
          if (selectedShift.toLowerCase() === 'day') {
              userBreaks.forEach(assignment => {
                  const slotData = breakSlots.find(slot => slot.id === assignment.slot_id) || assignment.slot_data; // Use breakSlots state
                  if (slotData?.duration_minutes === 15) hasBreak15 = true;
                  if (slotData?.duration_minutes === 45) hasBreak45 = true;
              });
          }

          // Return augmented staff object
          return {
              ...staff, // Keep original properties
              total_break_minutes: totalBreakMinutes,
              has_break_15: hasBreak15,
              has_break_45: hasBreak45,
          };
      });

      console.log('[EffectCalculateBreaks] Updated availableStaff with break times:', staffWithCalculatedBreaks);
      setAvailableStaff(staffWithCalculatedBreaks); // Update state with augmented list

  }, [scheduledBreaks, breakSlots, selectedShift, availableStaff]); // Rerun when breaks, slots, shift, or base staff list changes

  // Helper function to map frontend break type names to DB values
  const mapToDbBreakType = (frontendBreakType) => {
    const breakTypeLower = (frontendBreakType || '').toLowerCase();
    if (breakTypeLower.includes('break 1 (15 min)')) return 'break1';
    if (breakTypeLower.includes('break 2 (45 min)')) return 'break2';
    if (breakTypeLower.includes('night break (60 min)')) return 'night';
    if (breakTypeLower.includes('afternoon break (60 min)')) return 'afternoon';
    if (breakTypeLower.includes('custom')) return 'custom';
    return 'custom'; // Default for any other case
  };

  useEffect(() => {
    fetchBreakData();
  }, [selectedDate, selectedShift]); // Ensure fetch runs only when date/shift changes

  // --- Actions ---
  const handleSaveAllBreaks = async () => {
    setIsLoading(true);
    
    const sessionStorageKey = getSessionStorageKey();

    try {
      // Prepare assignments (records with user_id) - use current state
      const assignmentsToInsert = scheduledBreaks.map(assignment => {
        const slot = breakSlots.find(s => s.id === assignment.slot_id);
        if (!slot) {
          console.error(`Could not find slot with ID ${assignment.slot_id} for assignment ${assignment.id || 'new'}. Skipping this assignment.`);
          return null;
        }
        let dbBreakType = mapToDbBreakType(slot.break_type);

        // Ensure essential data exists
        if (!assignment.user_id || !selectedDate || !slot.start_time || slot.duration_minutes == null || !dbBreakType || !selectedShift) {
            console.error(`Missing data for assignment: ${JSON.stringify(assignment)}. Slot: ${JSON.stringify(slot)}. Skipping.`);
            return null;
        }

        return {
          user_id: assignment.user_id,
          date: selectedDate,
          break_start_time: slot.start_time,
          break_duration_minutes: slot.duration_minutes,
          break_type: dbBreakType,
          shift_type: selectedShift.toLowerCase()
          // No capacity or std_slot_id for user assignments
        };
      }).filter(Boolean); // Filter out nulls if a slot wasn't found or data missing
      
      // Prepare modified standard slot definitions (records with std_slot_id, null user_id)
      // NOTE: Standard slot modifications are UI only now - this can be removed
      // const standardSlotsToUpsert = []; // Object.values(modifiedStandardSlots).map(...) - removed persistence
      
      // Prepare custom slot definitions (records with null user_id, null std_slot_id, possibly existing id)
      const customSlotsToUpsert = breakSlots
        .filter(slot => slot.is_custom)
        .map(slot => {
            const isNewCustomSlot = typeof slot.id === 'string' && slot.id.startsWith('new-');
            const customRecord = {
                user_id: null,
                std_slot_id: null,
                date: selectedDate,
                break_start_time: slot.start_time,
                break_duration_minutes: slot.duration_minutes,
                break_type: mapToDbBreakType(slot.break_type),
                shift_type: selectedShift.toLowerCase(),
                capacity: slot.capacity // Include capacity for custom slots
            };
            // Only include ID if it's an existing custom slot for upsert
            if (!isNewCustomSlot) {
                customRecord.id = slot.id;
            }
            return customRecord;
        });

      console.log("[handleSaveAllBreaks] Assignments to Insert:", JSON.stringify(assignmentsToInsert, null, 2));
      // console.log("[handleSaveAllBreaks] Standard Slots to Upsert:", JSON.stringify(standardSlotsToUpsert, null, 2)); // Should be empty
      console.log("[handleSaveAllBreaks] Custom Slots to Upsert:", JSON.stringify(customSlotsToUpsert, null, 2));

      // --- Database Operations ---

      // 1. Delete existing *assignments* (records with user_id) for this date/shift
      console.log("[handleSaveAllBreaks] Deleting existing assignments...");
      const { error: deleteAssignError } = await supabase
        .from('scheduled_breaks')
        .delete()
        .eq('date', selectedDate)
        .eq('shift_type', selectedShift.toLowerCase())
        .not('user_id', 'is', null); // Only delete assignments

      if (deleteAssignError) {
        console.error("[handleSaveAllBreaks] Error deleting old assignments:", deleteAssignError);
        throw deleteAssignError;
      }
      console.log("[handleSaveAllBreaks] Successfully deleted old assignments.");

      // 2. Delete existing *standard slot definitions* (records with std_slot_id) for this date/shift
      //    (Only necessary if standard slot *definitions* were persisted - they aren't anymore)
      // console.log("[handleSaveAllBreaks] Deleting existing standard slot definitions...");
      // const { error: deleteStdSlotsError } = await supabase...;

      // 3. Handle Custom Slot Definitions (split into new and existing)
      if (customSlotsToUpsert.length > 0) {
        // Split custom slots into new and existing
        const newCustomSlots = customSlotsToUpsert.filter(slot => !slot.id);
        const existingCustomSlots = customSlotsToUpsert.filter(slot => slot.id);
        
        // Insert new custom slots
        if (newCustomSlots.length > 0) {
          console.log("[handleSaveAllBreaks] Inserting new custom slot definitions...");
          const { error: insertCustomError } = await supabase
              .from('scheduled_breaks')
              .insert(newCustomSlots);

          if (insertCustomError) {
            console.error("[handleSaveAllBreaks] Error inserting new custom slots:", insertCustomError);
            console.error("Data attempted for new custom slots:", JSON.stringify(newCustomSlots, null, 2));
            throw insertCustomError;
          } else {
            console.log("[handleSaveAllBreaks] Successfully inserted new custom slots.");
          }
        }
        
        // Update existing custom slots
        if (existingCustomSlots.length > 0) {
          console.log("[handleSaveAllBreaks] Updating existing custom slot definitions...");
          const { error: updateCustomError } = await supabase
              .from('scheduled_breaks')
              .upsert(existingCustomSlots, { onConflict: 'id' });

          if (updateCustomError) {
            console.error("[handleSaveAllBreaks] Error updating existing custom slots:", updateCustomError);
            console.error("Data attempted for existing custom slots:", JSON.stringify(existingCustomSlots, null, 2));
            throw updateCustomError;
          } else {
            console.log("[handleSaveAllBreaks] Successfully updated existing custom slots.");
          }
        }
      }

      // 4. Insert NEW standard slot definitions (the ones with modified capacity)
      //    (Not needed anymore as capacity changes are UI only)
      // if (standardSlotsToUpsert.length > 0) { ... }

      // 5. Insert NEW assignments
      if (assignmentsToInsert.length > 0) {
        console.log("[handleSaveAllBreaks] Inserting all assignments...");
        const { error: insertAssignError } = await supabase
          .from('scheduled_breaks')
          .insert(assignmentsToInsert);

        if (insertAssignError) {
          console.error("[handleSaveAllBreaks] Error inserting assignments:", insertAssignError);
          console.error("Data attempted for assignments:", JSON.stringify(assignmentsToInsert, null, 2));
          throw insertAssignError; // This is critical, so throw
        } else {
          console.log("[handleSaveAllBreaks] Successfully inserted assignments.");
        }
      }

      toast.success("Breaks schedule saved successfully!");
      sessionStorage.removeItem(sessionStorageKey); // Clear temporary state on successful save
      fetchBreakData(); // Refetch data to reflect saved state
      
    } catch (error) {
      console.error('Error saving all breaks:', error);
      toast.error("Failed to save breaks: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCustomSlot = async (newSlotData) => {
    // Check for duplicates
    const duplicateSlot = breakSlots.find(slot => 
      slot.start_time === newSlotData.start_time && 
      slot.duration_minutes === newSlotData.duration_minutes
    );
    
    if (duplicateSlot) {
      toast.error(`A slot starting at ${newSlotData.start_time} with duration ${newSlotData.duration_minutes} minutes already exists. Please use the edit function instead.`);
      return false;
    }
    
    // Add new slot to local state
    const newSlot = {
      ...newSlotData,
      id: `new-${Date.now()}`, // Temporary ID until saved
      is_custom: true,
      break_type: newSlotData.break_type || 'Custom Slot'
    };
    
    setBreakSlots(prevSlots => sortBreakSlots([...prevSlots, newSlot], selectedShift));
    // Note: Custom slot additions/edits require Save All Breaks - not saved to session temporarily
    try {
      toast.success("Custom break slot added successfully!");
    } catch (error) {
      console.error('Error adding custom slot:', error);
      toast.error("Failed to add custom slot: " + error.message);
    } finally {
      setIsLoading(false);
    }
    return true;
  };

  const handleUpdateCustomSlot = async (slotId, updatedData) => {
    // Find the slot to update
    const slotToUpdate = breakSlots.find(slot => slot.id === slotId);
    
    if (!slotToUpdate) {
      toast.error(`Could not find slot with ID ${slotId} to update.`);
      return false;
    }
    
    // For standard slots, only capacity can be updated (UI only)
    if (!slotToUpdate.is_custom) {
      // Just update the capacity for standard slots
      setBreakSlots(prevSlots => 
        sortBreakSlots(
          prevSlots.map(slot => 
            slot.id === slotId 
              ? { ...slot, capacity: updatedData.capacity } 
              : slot
          ),
          selectedShift
        )
      );
      
      // Track that this standard slot has been modified
      // setModifiedStandardSlots(prev => ({
      //   ...prev,
      //   [slotId]: {
      //     ...slotToUpdate,
      //     capacity: updatedData.capacity
      //   }
      // }));
      
      // Update any scheduled breaks that reference this slot if capacity decreased
      if (slotToUpdate.capacity > updatedData.capacity) {
        const assignmentsForSlot = scheduledBreaks.filter(assignment => assignment.slot_id === slotId);
        
        if (assignmentsForSlot.length > updatedData.capacity) {
          // Remove excess assignments (keep the first 'capacity' number of assignments)
          const keepAssignments = assignmentsForSlot.slice(0, updatedData.capacity);
          const keepIds = keepAssignments.map(a => a.id);
          
          const updatedAssignments = scheduledBreaks.filter(assignment => 
            assignment.slot_id !== slotId || keepIds.includes(assignment.id)
          );
          setScheduledBreaks(updatedAssignments);
          // Save updated assignments to session storage
          sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
        }
      }
      
      return true;
    }
    
    // For custom slots, check for duplicates (except this slot itself)
    const duplicateSlot = breakSlots.find(slot => 
      slot.id !== slotId && // Skip the slot we're updating
      slot.start_time === updatedData.start_time && 
      slot.duration_minutes === updatedData.duration_minutes
    );
    
    if (duplicateSlot) {
      toast.error(`A slot starting at ${updatedData.start_time} with duration ${updatedData.duration_minutes} minutes already exists. Please choose different parameters.`);
      return false;
    }
    
    // Update custom slot with all fields
    setBreakSlots(prevSlots => 
      sortBreakSlots(
        prevSlots.map(slot => 
          slot.id === slotId 
            ? { ...slot, ...updatedData } 
            : slot
        ),
        selectedShift
      )
    );
    
    // Update any scheduled breaks that reference this slot if capacity decreased
    if (slotToUpdate.capacity !== updatedData.capacity) {
      const assignmentsForSlot = scheduledBreaks.filter(assignment => assignment.slot_id === slotId);
      
      if (assignmentsForSlot.length > updatedData.capacity) {
        // Remove excess assignments (keep the first 'capacity' number of assignments)
        const keepAssignments = assignmentsForSlot.slice(0, updatedData.capacity);
        const keepIds = keepAssignments.map(a => a.id);
        
        const updatedAssignments = scheduledBreaks.filter(assignment =>
          assignment.slot_id !== slotId || keepIds.includes(assignment.id)
        );
        setScheduledBreaks(updatedAssignments);
        // Save updated assignments to session storage
        sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
      }
    }
    // Note: Custom slot updates require Save All Breaks - not saved to session temporarily

    try {
      toast.success("Custom break slot updated successfully!");
    } catch (error) {
      console.error('Error updating custom slot:', error);
      toast.error("Failed to update custom slot: " + error.message);
    } finally {
      setIsLoading(false);
    }

    return true;
  };

  const handleDeleteCustomSlot = async (slotId) => {
    // Find the slot to delete
    const slotToDelete = breakSlots.find(slot => slot.id === slotId);
    
    if (!slotToDelete) {
      toast.error(`Could not find slot with ID ${slotId} to delete.`);
      return false;
    }
    
    if (!slotToDelete.is_custom) {
      toast.error('Only custom slots can be deleted.');
      return false;
    }
    
    if (!window.confirm(`Are you sure you want to delete the custom slot at ${slotToDelete.start_time} (${slotToDelete.duration_minutes} minutes)?`)) {
      return false;
    }
    
    // Remove the slot from state
    setBreakSlots(prevSlots => 
      prevSlots.filter(slot => slot.id !== slotId)
    );
    
    // Remove any scheduled breaks for this slot
    const updatedAssignments = scheduledBreaks.filter(assignment => assignment.slot_id !== slotId);
    setScheduledBreaks(updatedAssignments);
    // Save updated assignments to session storage
    sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
    
    // If the slot has a real database ID (not one of our temporary IDs), we'll delete it from DB
    // when Save All Breaks is clicked
    
    try {
      toast.success("Custom break slot deleted successfully!");
    } catch (error) {
      console.error('Error deleting custom slot:', error);
      toast.error("Failed to delete custom slot: " + error.message);
    } finally {
      setIsLoading(false);
    }
    
    return true;
  };

  const handleAssignStaff = (staff, slot) => {
    // Check if user has permission to assign this staff member
    if (!isAdmin && staff.id !== currentUser?.id) {
      toast.error('You can only assign yourself to breaks');
      return;
    }

    // Check if slot is full using the CURRENT capacity from state
    const assignedToSlot = scheduledBreaks.filter(b => b.slot_id === slot.id);
    if (assignedToSlot.length >= slot.capacity) { // Use slot.capacity directly from the state
      toast.error(`Cannot assign ${staff.first_name} ${staff.last_name} to this break: slot is full (${assignedToSlot.length}/${slot.capacity}).`);
      return;
    }
    
    // Check if staff can be assigned to this slot (existing logic)
    const staffMember = availableStaff.find(s => s.id === staff.id);
    if (!staffMember) { // Check if staff exists in available list
      toast.error(`Could not find staff member ${staff.first_name} ${staff.last_name} in available list.`);
      return;
    }
    
    const totalBreakMinutes = staffMember.total_break_minutes || 0;
    let canAssign = false;

    if (selectedShift.toLowerCase() === 'day') {
        const hasBreak15 = staffMember.has_break_15;
        const hasBreak45 = staffMember.has_break_45;
        if (slot.duration_minutes === 15 && !hasBreak15) canAssign = true;
        else if (slot.duration_minutes === 45 && !hasBreak45) canAssign = true;
        // Allow assigning other durations if they fit within the 60min total (e.g., custom 30min)
        else if (slot.duration_minutes !== 15 && slot.duration_minutes !== 45 && (totalBreakMinutes + slot.duration_minutes <= 60)) canAssign = true; 
    } else {
        // For Night/Afternoon, check total minutes <= 60
        if (totalBreakMinutes + slot.duration_minutes <= 60) canAssign = true;
    }
    
    if (!canAssign) {
      let reason = `already has maximum break time (${totalBreakMinutes}/60 min).`;
      if (selectedShift.toLowerCase() === 'day') {
          if (slot.duration_minutes === 15 && staffMember.has_break_15) reason = 'already has a 15 min break.';
          if (slot.duration_minutes === 45 && staffMember.has_break_45) reason = 'already has a 45 min break.';
      }
      toast.error(`Cannot assign ${staff.first_name} ${staff.last_name} to this break: ${reason}`);
      return;
    }
    
    // Create new assignment (existing logic)
    const newAssignment = {
      id: `temp-${Date.now()}-${staff.id}`, // Temporary ID for session state
      slot_id: slot.id,
      user_id: staff.id,
      user_name: `${staff.first_name} ${staff.last_name}`,
      preferred_shift: staff.preferred_shift,
      break_date: selectedDate,
      break_type: slot.break_type, // Use break_type from the slot in state
      slot_data: { // Store slot data for potential fallback
        start_time: slot.start_time,
        duration_minutes: slot.duration_minutes,
        break_type: slot.break_type
      }
    };
    
    // Add to scheduled breaks state
    const updatedAssignments = [...scheduledBreaks, newAssignment];
    setScheduledBreaks(updatedAssignments);

    // Save updated assignments to session storage
    sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
    
    // Update staff break status
    setAvailableStaff(prev => 
      prev.map(s => {
        if (s.id === staff.id) {
          let updatedStaff = { ...s };
          
          // Update total break minutes
          updatedStaff.total_break_minutes = (updatedStaff.total_break_minutes || 0) + slot.duration_minutes;
          
          // Update break type flags for Day shift
          if (selectedShift.toLowerCase() === 'day') { 
            if (slot.duration_minutes === 15) {
              updatedStaff.has_break_15 = true;
            } else if (slot.duration_minutes === 45) {
              updatedStaff.has_break_45 = true;
            }
          }
          
          return updatedStaff;
        }
        return s;
      })
    );
  };
  
  const handleRemoveStaff = (assignment) => {
    // Check if user has permission to remove this assignment
    if (!isAdmin && assignment.user_id !== currentUser?.id) {
      toast.error('You can only remove your own breaks');
      return;
    }

    // Remove assignment from scheduled breaks state
    const updatedAssignments = scheduledBreaks.filter(b => b.id !== assignment.id);
    setScheduledBreaks(updatedAssignments);

    // Save updated assignments to session storage
    sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
    
    // Find the slot to get its duration
    const slot = breakSlots.find(s => s.id === assignment.slot_id);
    if (!slot) return;
    
    // Update staff break status
    setAvailableStaff(prev => 
      prev.map(s => {
        if (s.id === assignment.user_id) {
          let updatedStaff = { ...s };
          
          // Update total break minutes
          updatedStaff.total_break_minutes = Math.max(0, updatedStaff.total_break_minutes - slot.duration_minutes);
          
          // Update break type flags for Day shift
          if (slot.break_type?.includes('15 min')) {
            updatedStaff.has_break_15 = false;
          } else if (slot.break_type?.includes('45 min')) {
            updatedStaff.has_break_45 = false;
          }
          
          return updatedStaff;
        }
        return s;
      })
    );
  };

  // --- Grouping Logic ---
  const groupedSlots = breakSlots.reduce((acc, slot) => {
    const groupName = slot.is_custom ? 'Custom Slots' : slot.break_type || 'Standard Slots';
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(slot);
    return acc;
  }, {});

  // Staff assignment handlers
  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
    setStaffModalOpen(true);
  };
  
  const handleEditSlot = (slot) => {
    setSelectedSlot(slot);
    setEditModalOpen(true);
  };
  
  // Helper to get assigned staff for a slot
  const getAssignedStaffForSlot = (slotId) => {
    return scheduledBreaks.filter(assignment => assignment.slot_id === slotId);
  };

  // Add this useEffect to refetch data when selectedDate or selectedShift changes
  useEffect(() => {
    // Clear modified standard slots when date or shift changes
    // setModifiedStandardSlots({});
    // We DO NOT clear sessionStorage here - fetchBreakData will handle loading session or DB data
  }, [selectedDate, selectedShift]);

  // Update localStorage when selections change
  useEffect(() => {
    localStorage.setItem('brakes_selected_date', selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    localStorage.setItem('brakes_selected_shift', selectedShift);
  }, [selectedShift]);

  // --- Rendering ---
  return (
    <div className="p-0 md:p-6 bg-white dark:bg-gray-800 text-charcoal dark:text-gray-100 min-h-screen">
      <h1 className="text-2xl font-semibold mb-2 md:mb-4 px-2 md:px-0 text-blue-600 dark:text-blue-400">Break Planner</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 md:gap-4 mb-4 md:mb-6 items-center px-1 md:px-0">
        <div>
          <label htmlFor="break-date" className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input
            type="date"
            id="break-date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 md:px-3 md:py-2 text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
        <div>
          <label htmlFor="shift-type" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Shift</label>
          <select
            id="shift-type"
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 md:px-3 md:py-2 text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          >
            <option value="Day">Day (05:45 - 18:15)</option>
            <option value="Afternoon">Afternoon (14:00 - 02:30)</option>
            <option value="Night">Night (17:45 - 06:15)</option>
          </select>
        </div>
         {/* Save button only for admins */}
         {isAdmin && (
           <div className="mt-auto">
               <button
                  onClick={handleSaveAllBreaks}
                  disabled={isLoading}
                  className={`
                    font-bold py-1 px-3 md:py-2 md:px-4 rounded transition duration-150 ease-in-out
                    ${isLoading 
                      ? 'bg-gray-500 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700 text-white'}
                  `}
               >
                  {isLoading ? 'Saving...' : 'Save All Breaks'}
              </button>
          </div>
         )}
      </div>

        {/* Messages */}
        {/* Usunięto wyświetlanie komunikatu błędu, teraz używamy toast */}


      {/* Break Slots Display */}
      {isLoading ? (
        <div className="text-center py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
          <p className="mt-2">Loading breaks...</p>
        </div>
      ) : (
        <div className="space-y-4 md:space-y-8 px-1 md:px-0">
          {Object.entries(groupedSlots).map(([groupName, slotsInGroup]) => (
            <div key={groupName}>
              <h2 className="text-xl font-semibold mb-2 md:mb-3 border-b border-gray-700 pb-1 md:pb-2 text-blue-500">{groupName}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-4">
                {slotsInGroup.map(slot => (
                  <SlotCard 
                    key={slot.id} 
                    slot={slot} 
                    assignedStaff={getAssignedStaffForSlot(slot.id)}
                    onSlotClick={handleSlotClick}
                    onEditClick={handleEditSlot}
                    onRemoveStaffClick={handleRemoveStaff}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Add Custom Slot Form - Only for admins */}
          {isAdmin && (
            <div>
              <div className="flex justify-between items-center mb-2 md:mb-3 border-b border-gray-700 pb-1 md:pb-2">
                <h2 className="text-xl font-semibold text-blue-500 mt-4 md:mt-8">Create Custom Slot</h2>
                <button 
                  onClick={() => setShowCustomSlotForm(!showCustomSlotForm)}
                  className="flex items-center text-sm px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded-md text-white"
                >
                  {showCustomSlotForm ? 'Hide Form' : 'Show Form'}
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-4 w-4 ml-1 transition-transform ${showCustomSlotForm ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {showCustomSlotForm && (
                <AddCustomSlotForm 
                  onAddCustomSlot={handleAddCustomSlot}
                  selectedShift={selectedShift}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {staffModalOpen && selectedSlot && (
        <StaffSelectionModal 
          isOpen={staffModalOpen}
          onClose={() => setStaffModalOpen(false)}
          slot={selectedSlot}
          availableStaff={availableStaff}
          assignedStaff={getAssignedStaffForSlot(selectedSlot.id)}
          onAssignStaff={handleAssignStaff}
          onRemoveStaff={handleRemoveStaff}
        />
      )}
      
      {editModalOpen && selectedSlot && (
        <EditSlotModal 
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          slot={selectedSlot}
          onUpdate={handleUpdateCustomSlot}
          onDelete={handleDeleteCustomSlot}
        />
      )}
    </div>
  );
};

// Staff Selection Modal Component - Enhance the staff removal functionality
const StaffSelectionModal = ({ isOpen, onClose, slot, availableStaff, assignedStaff, onAssignStaff, onRemoveStaff }) => {
  const modalRef = useRef(null);
  const [showAllStaff, setShowAllStaff] = useState(false);
  
  // Prevent body scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  useEffect(() => {
    console.log("Modal opened, available staff:", availableStaff);
  }, [isOpen, availableStaff]);
  
  // Filter staff that are eligible for this slot - restore proper filtering
  const eligibleStaff = showAllStaff ? availableStaff : availableStaff.filter(staff => {
    if (!staff) return false;
    
    // Check if staff is already assigned to THIS slot
    if (assignedStaff.some(assigned => assigned.user_id === staff.id)) {
        return false; // Already assigned here
    }
    
    // For Day shift, handle 15/45 min breaks differently
    if (slot.break_type?.includes('15 min')) {
      // For 15 min break, staff can be assigned if they don't already have a 15 min break
      return staff.has_break_15 !== true; // Allow undefined or false
    } else if (slot.break_type?.includes('45 min')) {
      // For 45 min break, staff can be assigned if they don't already have a 45 min break
      return staff.has_break_45 !== true; // Allow undefined or false
    } else {
      // For other breaks (Night, Afternoon), staff can have only 60 min total
      // Calculate remaining break time they can take
      const totalBreakMinutes = staff.total_break_minutes || 0; // Handle undefined
      const remainingMinutes = 60 - totalBreakMinutes;
      return remainingMinutes >= slot.duration_minutes;
    }
  });
  
  // Check if we have no staff after filtering
  useEffect(() => {
    if (isOpen && availableStaff.length > 0 && eligibleStaff.length === 0) {
      console.log('No eligible staff after filtering. Available staff:', availableStaff);
      console.log('Slot requirements:', slot);
    }
  }, [isOpen, availableStaff, eligibleStaff, slot]);
  
  if (!isOpen) return null;
  
  // Use createPortal to render the modal in the document body
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 md:p-4 bg-black/50 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="relative bg-gray-800 text-white rounded-lg shadow-xl border border-gray-700 w-full max-w-md max-h-[90vh] md:max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="bg-gray-900 px-2 py-2 md:px-4 md:py-3 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-base md:text-lg font-semibold">
            Assign Staff to Break Slot
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Slot Info */}
        <div className="px-2 py-2 md:px-4 md:py-3 bg-gray-900/50 border-b border-gray-700">
          <div className="flex justify-between">
            <div>
              <span className="text-gray-400 text-xs md:text-sm">Time:</span>{' '}
              <span className="font-medium text-xs md:text-sm">{slot.start_time} - {
                // Calculate end time
                (() => {
                  try {
                    const [hours, minutes] = slot.start_time.split(':').map(Number);
                    const date = new Date();
                    date.setHours(hours, minutes, 0, 0);
                    date.setMinutes(date.getMinutes() + slot.duration_minutes);
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                  } catch { 
                    return '??:??'; 
                  }
                })()
              }</span>
            </div>
            <div>
              <span className="text-[10px] md:text-xs bg-black dark:bg-white text-blue-100 px-1 py-0.5 md:px-2 md:py-0.5 rounded">
                {slot.duration_minutes} min
              </span>
            </div>
          </div>
          <div className="mt-1">
            <span className="text-gray-400 text-xs md:text-sm">Break Type:</span>{' '}
            <span className="font-medium text-xs md:text-sm">{slot.break_type}</span>
          </div>
          <div className="mt-1">
            <span className="text-gray-400 text-xs md:text-sm">Assigned:</span>{' '}
            <span className="font-medium text-xs md:text-sm">{assignedStaff.length}/{slot.capacity}</span>
          </div>
        </div>
        
        {/* Currently Assigned Staff */}
        <div className="px-2 py-2 md:px-4 md:py-3 border-b border-gray-700">
          <h4 className="text-xs md:text-sm font-semibold text-gray-300 mb-1 md:mb-2">Currently Assigned</h4>
          {assignedStaff.length > 0 ? (
            <div className="space-y-1 md:space-y-2">
              {assignedStaff.map(staff => (
                <div 
                  key={staff.id} 
                  className="flex justify-between items-center bg-gray-700/50 px-2 py-1 md:px-3 md:py-2 rounded"
                >
                  <div className="text-xs md:text-sm">
                    {staff.user_name}
                    <span className="ml-1 md:ml-2 text-[10px] md:text-xs text-gray-400">{staff.preferred_shift}</span>
                  </div>
                  <button 
                    onClick={() => onRemoveStaff(staff)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    aria-label="Remove staff member"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-1 md:py-2 text-gray-400 italic text-xs md:text-sm">
              No staff assigned to this slot yet
            </div>
          )}
        </div>
        
        {/* Available Staff List */}
        <div className="flex-1 overflow-y-auto p-2 md:p-4">
          <div className="flex justify-between items-center mb-1 md:mb-2">
            <h4 className="text-xs md:text-sm font-semibold text-gray-300">Available Staff</h4>
            <button
              onClick={() => setShowAllStaff(prev => !prev)}
              className="text-[10px] md:text-xs bg-blue-800 hover:bg-blue-700 text-white px-1 py-0.5 md:px-2 md:py-1 rounded"
            >
              {showAllStaff ? "Show Eligible Only" : "Show All Staff"}
            </button>
          </div>
          
          {availableStaff.length === 0 ? (
            <div className="text-center py-2 md:py-4 text-gray-400 text-xs md:text-sm">
              No staff available for this shift/date
            </div>
          ) : eligibleStaff.length === 0 ? (
            <div className="text-center py-2 md:py-4 text-gray-400 text-xs md:text-sm">
              No eligible staff available for this slot
              {showAllStaff ? "" : " (try 'Show All Staff' button)"}
            </div>
          ) : (
            <div className="space-y-1 md:space-y-2">
              {eligibleStaff.map(staff => (
                <button 
                  key={staff.id}
                  disabled={assignedStaff.length >= slot.capacity}
                  onClick={() => onAssignStaff(staff, slot)}
                  className={`w-full text-left flex items-center justify-between px-2 py-1 md:px-3 md:py-2 rounded transition-colors ${
                    assignedStaff.length >= slot.capacity
                      ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-700/50 hover:bg-gray-600/70 focus:bg-gray-600/70'
                  }`}
                >
                  <div>
                    <div className="text-xs md:text-sm">{staff.first_name} {staff.last_name}</div>
                    <div className="text-[10px] md:text-xs text-gray-400">
                      {staff.preferred_shift} 
                      {/* For Day shift, show which breaks are already assigned */}
                      {staff.preferred_shift?.toLowerCase() === 'day' && (
                        <span className="ml-1 md:ml-2">
                          {staff.has_break_15 && <span className="inline-block px-1 py-0.5 bg-blue-900/50 text-blue-200 rounded text-[8px] md:text-[10px] mr-1">15m</span>}
                          {staff.has_break_45 && <span className="inline-block px-1 py-0.5 bg-green-900/50 text-green-200 rounded text-[8px] md:text-[10px]">45m</span>}
                        </span>
                      )}
                      {/* For others, show remaining break time */}
                      {staff.preferred_shift?.toLowerCase() !== 'day' && (
                        <span className="ml-1 md:ml-2">
                          {staff.total_break_minutes || 0}/60 min used
                        </span>
                      )}
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-2 py-2 md:px-4 md:py-3 bg-gray-900 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 md:px-4 md:py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-xs md:text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Edit Slot Modal Component
const EditSlotModal = ({ isOpen, onClose, slot, onUpdate, onDelete }) => {
  const [formData, setFormData] = useState({
    start_time: '',
    duration_minutes: 15,
    capacity: 2,
    break_type: 'Custom Slot'
  });
  
  // Initialize form data when slot changes
  useEffect(() => {
    if (slot) {
      setFormData({
        start_time: slot.start_time || '',
        duration_minutes: slot.duration_minutes || 15,
        capacity: slot.capacity || 2,
        break_type: slot.break_type || 'Custom Slot'
      });
    }
  }, [slot]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration_minutes' || name === 'capacity' ? parseInt(value, 10) : value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // For standard slots, only pass capacity changes
    if (!slot.is_custom) {
      onUpdate(slot.id, { capacity: formData.capacity });
      onClose();
      return;
    }
    
    // For custom slots, validate form data
    if (!formData.start_time) {
      alert('Please select a start time');
      return;
    }
    
    onUpdate(slot.id, formData);
    onClose();
  };
  
  // Generate time options (every 15 minutes)
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, '0');
        const formattedMinute = minute.toString().padStart(2, '0');
        options.push(`${formattedHour}:${formattedMinute}`);
      }
    }
    return options;
  };
  
  if (!isOpen || !slot) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 md:p-4 bg-black/50">
      <div className="bg-gray-800 text-white rounded-lg shadow-xl border border-gray-700 w-full max-w-md overflow-hidden">
        <div className="bg-gray-900 px-2 py-2 md:px-4 md:py-3 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-base md:text-lg font-semibold">
            {slot.is_custom ? 'Edit Custom Slot' : 'Edit Standard Slot'}
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-2 md:p-4">
          <div className="space-y-2 md:space-y-4">
            {/* Start Time - disabled for standard slots */}
            <div>
              <label htmlFor="start_time" className="block text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Start Time
              </label>
              <select
                id="start_time"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                disabled={!slot.is_custom}
                className={`w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm ${
                  !slot.is_custom ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <option value="">Select time</option>
                {generateTimeOptions().map(time => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Duration - disabled for standard slots */}
            <div>
              <label htmlFor="duration_minutes" className="block text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Duration (minutes)
              </label>
              <select
                id="duration_minutes"
                name="duration_minutes"
                value={formData.duration_minutes}
                onChange={handleChange}
                disabled={!slot.is_custom}
                className={`w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm ${
                  !slot.is_custom ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
            
            {/* Capacity - always enabled for both standard and custom slots */}
            <div>
              <label htmlFor="capacity" className="block text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Capacity
              </label>
              <input
                type="number"
                id="capacity"
                name="capacity"
                min={1}
                max={10}
                value={formData.capacity}
                onChange={handleChange}
                className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm"
              />
            </div>
            
            {/* Break Type - disabled for standard slots */}
            <div>
              <label htmlFor="break_type" className="block text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                Break Type
              </label>
              <input
                type="text"
                id="break_type"
                name="break_type"
                value={formData.break_type}
                onChange={handleChange}
                disabled={!slot.is_custom}
                className={`w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-sm ${
                  !slot.is_custom ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              />
            </div>
            
            {/* Notice for standard slots */}
            {!slot.is_custom && (
              <div className="text-blue-500 text-xs md:text-sm mt-1 md:mt-2 bg-blue-900/20 p-1 md:p-2 rounded">
                Note: For standard slots, only capacity can be edited.
              </div>
            )}
          </div>
          
          <div className="mt-3 md:mt-6 flex justify-between">
            {slot.is_custom && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this slot?')) {
                    onDelete(slot.id);
                    onClose();
                  }
                }}
                className="px-2 py-1 md:px-4 md:py-2 bg-red-700 text-white rounded hover:bg-red-600 transition-colors text-xs md:text-sm"
              >
                Delete Slot
              </button>
            )}
            
            <div className={`flex gap-1 md:gap-2 ${slot.is_custom ? 'ml-auto' : ''}`}>
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-1 md:px-4 md:py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-xs md:text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2 py-1 md:px-4 md:py-2 bg-black dark:bg-white text-white rounded hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-xs md:text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

// Add Custom Slot Form Component
const AddCustomSlotForm = ({ onAddCustomSlot, selectedShift }) => {
  const [formData, setFormData] = useState({
    start_time: '',
    duration_minutes: 15,
    capacity: 2,
    break_type: 'Custom Slot'
  });
  
  // Set a default start time based on shift when it changes
  useEffect(() => {
    let defaultTime = '09:00'; // Default for Day
    
    if (selectedShift === 'Afternoon') {
      defaultTime = '14:00';
    } else if (selectedShift === 'Night') {
      defaultTime = '21:00';
    }
    
    setFormData(prev => ({
      ...prev,
      start_time: defaultTime
    }));
  }, [selectedShift]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration_minutes' || name === 'capacity' ? parseInt(value, 10) : value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    // Validate form data
    if (!formData.start_time) {
      alert('Please select a start time');
      return;
    }
    
    const success = onAddCustomSlot(formData);
    
    if (success) {
      // Reset form (except selected shift preference)
      setFormData({
        start_time: formData.start_time,
        duration_minutes: 15,
        capacity: 2,
        break_type: 'Custom Slot'
      });
    }
  };
  
  // Generate time options (every 15 minutes)
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, '0');
        const formattedMinute = minute.toString().padStart(2, '0');
        options.push(`${formattedHour}:${formattedMinute}`);
      }
    }
    return options;
  };
  
  return (
    <div className="bg-gray-800 p-2 md:p-4 rounded-lg shadow border border-gray-700">
      <h3 className="text-lg font-semibold mb-2 md:mb-4">Create Custom Slot</h3>
      
      <form onSubmit={handleSubmit} className="space-y-2 md:space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
          {/* Start Time */}
          <div>
            <label htmlFor="cs_start_time" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Start Time
            </label>
            <select
              id="cs_start_time"
              name="start_time"
              value={formData.start_time}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              <option value="">Select time</option>
              {generateTimeOptions().map(time => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
          
          {/* Duration */}
          <div>
            <label htmlFor="cs_duration_minutes" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Duration (minutes)
            </label>
            <select
              id="cs_duration_minutes"
              name="duration_minutes"
              value={formData.duration_minutes}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </div>
          
          {/* Capacity */}
          <div>
            <label htmlFor="cs_capacity" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Capacity
            </label>
            <input
              type="number"
              id="cs_capacity"
              name="capacity"
              min={1}
              max={10}
              value={formData.capacity}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>
          
          {/* Break Type */}
          <div>
            <label htmlFor="cs_break_type" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              Break Type
            </label>
            <input
              type="text"
              id="cs_break_type"
              name="break_type"
              value={formData.break_type}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 md:px-3 md:py-2 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
              placeholder="Custom Slot"
            />
          </div>
        </div>
        
        <div>
          <button
            type="submit"
            className="px-3 py-1 md:px-4 md:py-2 bg-black dark:bg-white text-white rounded hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
          >
            Add Custom Slot
          </button>
        </div>
      </form>
    </div>
  );
};

// Slot Card Component to display a break slot
const SlotCard = ({ slot, assignedStaff, onSlotClick, onEditClick, onRemoveStaffClick, currentUser, isAdmin }) => {
  // Format start time to remove seconds (HH:MM:SS -> HH:MM)
  const formatStartTime = () => {
    try {
      return slot.start_time.substring(0, 5); // Get only HH:MM part
    } catch {
      return slot.start_time || '??:??';
    }
  };

  // Calculate the end time for display
  const calculateEndTime = () => {
    try {
      const [hours, minutes] = slot.start_time.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      date.setMinutes(date.getMinutes() + slot.duration_minutes);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { 
      return '??:??';
    }
  };
  
  const isFull = assignedStaff.length >= slot.capacity;
  const cardClasses = `
    bg-white dark:bg-gray-800 p-2 md:p-4 rounded-lg shadow-sm border 
    ${isFull ? 'border-green-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer'}
    min-h-[120px] md:min-h-[150px] flex flex-col justify-between relative
  `;
  
  const handleCardClick = (e) => {
    // Prevent opening the modal if the click was on a remove button or edit button
    if (e.target.closest('.remove-staff-button') || e.target.closest('.edit-slot-button')) {
      return;
    }
    if (!isFull) onSlotClick(slot);
  };

  return (
    <div 
      className={cardClasses}
      onClick={handleCardClick}
    >
      <div>
        <div className="flex justify-between items-center mb-1 md:mb-2">
          <span className="font-semibold text-sm md:text-base">
            {formatStartTime()} - {calculateEndTime()}
          </span>
          <span className="text-xs bg-black dark:bg-white text-blue-100 px-1 py-0.5 md:px-2 md:py-0.5 rounded">
            {slot.duration_minutes} min
          </span>
        </div>
        <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1 md:mb-2">
          Capacity: {slot.capacity}
        </div>
        <div className="text-xs md:text-sm text-gray-300">
          Assigned: {assignedStaff.length}/{slot.capacity}
          <span className={`ml-1 md:ml-2 ${assignedStaff.length >= slot.capacity ? 'text-green-400' : 'text-yellow-400'}`}>
            {assignedStaff.length >= slot.capacity ? 'Full' : 'Available'}
          </span>
        </div>
        
        {/* List assigned staff with remove buttons */}
        {assignedStaff.length > 0 && (
          <div className="mt-1 md:mt-2 space-y-1">
            {assignedStaff.map(staff => (
              <div 
                key={staff.id} 
                className="text-xs md:text-sm bg-gray-700/50 px-1 py-0.5 md:px-2 md:py-1 rounded flex justify-between items-center"
              >
                <span className="truncate">{staff.user_name}</span>
                {/* Show remove button only if user is admin or it's their own break */}
                {(isAdmin || staff.user_id === currentUser?.id) && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the card's onClick
                      onRemoveStaffClick(staff);
                    }} 
                    className="remove-staff-button text-red-400 hover:text-red-300 ml-1 md:ml-2 p-0.5 rounded-full hover:bg-gray-600 transition-colors"
                    aria-label={`Remove ${staff.user_name}`}
                    title={`Remove ${staff.user_name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 md:h-4 md:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="mt-2 md:mt-3 text-center text-gray-500 text-xs italic">
        {assignedStaff.length >= slot.capacity 
          ? 'Slot is full' 
          : 'Click to assign staff'}
      </div>
      
      {/* Edit button only for admins */}
      {isAdmin && (
        <div className="flex justify-end gap-1 md:gap-2 mt-1 md:mt-2">
          <button 
            className="edit-slot-button text-xs text-yellow-400 hover:text-yellow-300"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the card's onClick
              onEditClick(slot);
            }}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
};

// PropTypes definitions
StaffSelectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  slot: PropTypes.shape({
    id: PropTypes.string,
    start_time: PropTypes.string.isRequired,
    duration_minutes: PropTypes.number.isRequired,
    capacity: PropTypes.number.isRequired,
    break_type: PropTypes.string,
    is_custom: PropTypes.bool
  }).isRequired,
  availableStaff: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      first_name: PropTypes.string.isRequired,
      last_name: PropTypes.string.isRequired,
      preferred_shift: PropTypes.string.isRequired,
      has_break_15: PropTypes.bool,
      has_break_45: PropTypes.bool,
      total_break_minutes: PropTypes.number.isRequired
    })
  ).isRequired,
  assignedStaff: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      user_name: PropTypes.string.isRequired,
      preferred_shift: PropTypes.string
    })
  ).isRequired,
  onAssignStaff: PropTypes.func.isRequired,
  onRemoveStaff: PropTypes.func.isRequired
};

EditSlotModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  slot: PropTypes.shape({
    id: PropTypes.string,
    start_time: PropTypes.string.isRequired,
    duration_minutes: PropTypes.number.isRequired,
    capacity: PropTypes.number.isRequired,
    break_type: PropTypes.string,
    is_custom: PropTypes.bool
  }).isRequired,
  onUpdate: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired
};

AddCustomSlotForm.propTypes = {
  onAddCustomSlot: PropTypes.func.isRequired,
  selectedShift: PropTypes.string.isRequired
};

SlotCard.propTypes = {
  slot: PropTypes.shape({
    id: PropTypes.string,
    start_time: PropTypes.string.isRequired,
    duration_minutes: PropTypes.number.isRequired,
    capacity: PropTypes.number.isRequired,
    break_type: PropTypes.string,
    is_custom: PropTypes.bool
  }).isRequired,
  assignedStaff: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      user_name: PropTypes.string.isRequired,
      user_id: PropTypes.string.isRequired
    })
  ).isRequired,
  onSlotClick: PropTypes.func.isRequired,
  onEditClick: PropTypes.func.isRequired,
  onRemoveStaffClick: PropTypes.func.isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired
  }),
  isAdmin: PropTypes.bool.isRequired
};

export default BrakesManager; 