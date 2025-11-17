import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient'; // Adjust path if needed
import { useToast } from '../../../components/ui/ToastContext';
import { useAuth } from '../../../lib/AuthContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as formatDate } from 'date-fns';
// Placeholder for helper components, will create later
// import SlotCard from './SlotCard';
// import StaffSelectionModal from './StaffSelectionModal';
// import EditSlotModal from './EditSlotModal';
// import AddCustomSlotForm from './AddCustomSlotForm';

const ALL_LOCATIONS_VALUE = 'all';

const BrakesManager = () => {
  const { user } = useAuth();
  const toast = useToast();
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
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(() => {
    const savedLocation = localStorage.getItem('brakes_selected_location');
    return savedLocation || ALL_LOCATIONS_VALUE;
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

  // Fetch active locations for filtering
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;

        const fetchedLocations = (data || []).slice();
        // Custom order: Rugby, NRC, Nuneaton, then others alphabetically
        const preferredOrder = ['Rugby', 'NRC', 'Nuneaton'];
        fetchedLocations.sort((a, b) => {
          const ia = preferredOrder.indexOf(a.name);
          const ib = preferredOrder.indexOf(b.name);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.name.localeCompare(b.name);
        });
        setLocations(fetchedLocations);

        // Ensure selectedLocation is a valid active location; default to Rugby or first
        const hasSelected = fetchedLocations.some(loc => loc.name === selectedLocation);
        if (!hasSelected || selectedLocation === ALL_LOCATIONS_VALUE) {
          const defaultLoc = fetchedLocations.find(l => l.name === 'Rugby')?.name || fetchedLocations[0]?.name || '';
          if (defaultLoc) {
            setSelectedLocation(defaultLoc);
            localStorage.setItem('brakes_selected_location', defaultLoc);
          }
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        toast.error('Failed to load locations');
      }
    };

    loadLocations();
  }, [selectedLocation, toast]);

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

  const [addSlotModalOpen, setAddSlotModalOpen] = useState(false);
  const [breakSlots, setBreakSlots] = useState([]); // Combined standard and custom slots
  const [scheduledBreaks, setScheduledBreaks] = useState([]); // Staff assignments { id, user_id, slot_id, break_date, user_name, preferred_shift }
  const [availableStaff, setAvailableStaff] = useState([]); // { id, first_name, last_name, preferred_shift, total_break_minutes, etc. }
  const [isLoading, setIsLoading] = useState(false);
  
  // Ref to track locally added custom slots (not yet saved to DB)
  const localCustomSlotsRef = useRef([]);
  
  // Modal state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState(null); // Slot pending deletion

  // UI: unified header badge pickers
  const [showDateModal, setShowDateModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(null); // Track currently displayed month in calendar

  // Key for sessionStorage
  const getSessionStorageKey = useCallback(() => {
    const locationKey = selectedLocation || ALL_LOCATIONS_VALUE;
    return `brakes_temp_assignments_${selectedDate}_${selectedShift}_${locationKey}`;
  }, [selectedDate, selectedShift, selectedLocation]);

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
      // 6 slots starting 21:00, 60 min, 3 people
      { start_time: '21:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
      { start_time: '22:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
      { start_time: '23:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
      { start_time: '00:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
      { start_time: '01:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
      { start_time: '02:00', duration_minutes: 60, capacity: 3, break_type: 'Night Break (60 min)' },
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
    
    // Preserve locally added custom slots (not yet saved to DB)
    const localCustomSlots = localCustomSlotsRef.current;
    
    // Clear previous data except scheduledBreaks if found in session
    setAvailableStaff([]);

    const sessionStorageKey = getSessionStorageKey();
    let savedAssignments = sessionStorage.getItem(sessionStorageKey);
    const locationFilter = selectedLocation === ALL_LOCATIONS_VALUE ? null : selectedLocation;

    try {
      // First, generate standard slots based on shift type
      const baseStandardSlots = standardSlotsConfig[selectedShift] || [];
      // Clone to allow conditional injections (e.g., Saturday special slot)
      let workingStandardSlots = [...baseStandardSlots];

      // If selected date is Saturday, add an extra Night slot 20:00-21:00
      try {
        const dateObj = new Date(`${selectedDate}T00:00:00`);
        const isSaturday = dateObj.getDay() === 6; // 6 = Saturday
        if (isSaturday && selectedShift.toLowerCase() === 'night') {
          // Inject special Saturday slot at 20:00 (60 min)
          workingStandardSlots.unshift({
            start_time: '20:00',
            duration_minutes: 60,
            break_type: 'Night Break (60 min)'
          });
        }
      } catch {
        // Safe-guard: if date parsing fails, skip special injection
      }
  
      // Fetch modified standard slot definitions for this date/shift (where user_id is null but std_slot_id is present)
      let modifiedCapacities = {};
      try {
        const modifiedQuery = supabase
          .from('scheduled_breaks')
          .select('std_slot_id, capacity')
          .eq('date', selectedDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .is('user_id', null)
          .not('std_slot_id', 'is', null);

        if (locationFilter) {
          modifiedQuery.eq('location', locationFilter);
        }

        const { data: modifiedSlotsData, error: modifiedSlotsError } = await modifiedQuery;
        
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
      const standardSlotsWithIds = workingStandardSlots.map((slot, index) => {
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
        // Don't filter by location in DB query since location is not saved for custom slots
        const { data, error } = await supabase
          .from('scheduled_breaks')
          .select('id, break_start_time, break_duration_minutes, break_type, capacity')
          .eq('date', selectedDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .is('user_id', null)
          .is('std_slot_id', null); // Only pure custom slots
          
        if (error) throw error;
        if (data && data.length > 0) {
          console.log('[fetchBreakData] Fetched custom slot definitions:', data);
          // Custom slots are shared across all locations for the same date/shift
          customSlotsData = data.map(slot => ({
            id: slot.id,
            start_time: slot.break_start_time,
            duration_minutes: slot.break_duration_minutes,
            capacity: slot.capacity || 999, // Use fetched capacity or default unlimited
            break_type: slot.break_type,
            is_custom: true
          }));
        }
      } catch (customSlotError) {
        console.warn("[fetchBreakData] Error fetching custom slot definitions:", customSlotError);
      }
  
      // Combine standard, custom, and locally added slots
      const allSlots = sortBreakSlots([
        ...standardSlotsWithIds,
        ...customSlotsData,
        ...localCustomSlots
      ], selectedShift);
      
      console.log('[fetchBreakData] Combined all slots (standard + custom + local):', allSlots);
      setBreakSlots(allSlots);
      
      // Fetch existing break assignments or use saved session data
      let processedScheduled = [];
      if (savedAssignments) {
        try {
          processedScheduled = JSON.parse(savedAssignments).map(assignment => ({
            ...assignment,
            location: assignment.location || locationFilter || null
          }));
          if (locationFilter) {
            processedScheduled = processedScheduled.filter(assignment => assignment.location === locationFilter);
          }
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
          const scheduledQuery = supabase
            .from('scheduled_breaks')
            .select(`
              id, user_id, break_start_time, break_duration_minutes, break_type, location,
              profiles:user_id (first_name, last_name, shift_preference)
            `)
            .eq('date', selectedDate)
            .eq('shift_type', selectedShift.toLowerCase())
            .not('user_id', 'is', null); // Only actual assignments

          // Do NOT filter by location here; assignments don't carry location in DB

          const { data: scheduledData, error: scheduledError } = await scheduledQuery;
          
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

            const mappedAssignment = {
              id: record.id,
              slot_id: matchingSlot?.id || null, // Link to our slot ID
              user_id: record.user_id,
              break_date: selectedDate,
              user_name: `${record.profiles.first_name} ${record.profiles.last_name}`,
              preferred_shift: record.profiles.shift_preference,
              break_type: record.break_type,
              location: record.location || null,
              slot_data: { // Store the raw slot data from the record
                start_time: record.break_start_time,
                duration_minutes: record.break_duration_minutes,
                break_type: record.break_type
              }
            };

            // Don't filter by location at DB level; we'll filter using scheduled_rota-derived locations client-side
            return mappedAssignment;
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
          .select('user_id, shift_type, location')
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

        const locationMap = new Map();
        filteredShifts.forEach(record => {
          if (record.user_id) {
            locationMap.set(record.user_id, record.location || null);
          }
        });

        console.log(`[fetchBreakData] Filtered shifts (shift_type='${selectedShift}'):`, filteredShifts);

        const filteredUserIds = filteredShifts
          .filter(record => {
            if (!record.user_id) return false;
            if (!locationFilter) return true;
            return record.location === locationFilter;
          })
          .map(record => record.user_id);

        if (!filteredUserIds || filteredUserIds.length === 0) {
          console.log(`[fetchBreakData] No staff found scheduled for shift '${selectedShift}' on ${selectedDate}. Setting availableStaff to empty.`);
          setAvailableStaff([]);
          // We stop here if no one is scheduled for this shift on this date
        } else {
          // Step 2: Get profile details for the scheduled user IDs
          const uniqueUserIds = [...new Set(filteredUserIds)];
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
              location: locationMap.get(profile.id) || null
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
  }, [selectedDate, selectedShift, selectedLocation, getSessionStorageKey, toast]);

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
  }, [selectedDate, selectedShift, selectedLocation, fetchBreakData]);

  // --- Actions ---
  const handleSaveAllBreaks = async () => {
    setIsLoading(true);
    
    const sessionStorageKey = getSessionStorageKey();
    if (selectedLocation === ALL_LOCATIONS_VALUE) {
      toast.error('Select a specific location before saving breaks.');
      setIsLoading(false);
      return;
    }

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
                // Note: location is NOT saved to DB for custom slots - it's filtered on frontend
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
      localCustomSlotsRef.current = []; // Clear locally added slots after successful save
      fetchBreakData(); // Refetch data to reflect saved state
      
    } catch (error) {
      console.error('Error saving all breaks:', error);
      toast.error("Failed to save breaks: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCustomSlot = (newSlotData) => {
    if (selectedLocation === ALL_LOCATIONS_VALUE) {
      toast.error('Select a specific location before adding custom slots.');
      return false;
    }

    // Check for duplicates - only check start_time
    const duplicateSlot = breakSlots.find(slot => 
      slot.start_time === newSlotData.start_time
    );
    
    if (duplicateSlot) {
      toast.error(`A slot starting at ${newSlotData.start_time} already exists.`);
      return false;
    }
    
    // Add new slot to local state
    const newSlot = {
      ...newSlotData,
      id: `new-${Date.now()}`, // Temporary ID until saved
      is_custom: true,
      break_type: newSlotData.break_type || 'Custom Slot',
      location: selectedLocation
    };
    
    // Add to ref for persistence across fetchBreakData calls
    localCustomSlotsRef.current = [...localCustomSlotsRef.current, newSlot];
    
    setBreakSlots(prevSlots => sortBreakSlots([...prevSlots, newSlot], selectedShift));
    
    toast.success("Custom break slot added successfully! Remember to Save Breaks.");
    return true;
  };

  const handleDeleteCustomSlot = (slotId) => {
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
    
    // Show confirmation modal
    setDeleteConfirmSlot(slotToDelete);
    return true;
  };
  
  const confirmDeleteSlot = async () => {
    if (!deleteConfirmSlot) return;
    
    const slotId = deleteConfirmSlot.id;
    const isNewSlot = slotId.startsWith('new-'); // Check if it's a temporary local slot
    
    try {
      // If the slot was already saved to the database, delete it from there
      if (!isNewSlot) {
        console.log('[confirmDeleteSlot] Deleting slot from database:', slotId);
        const { error } = await supabase
          .from('scheduled_breaks')
          .delete()
          .eq('id', slotId);
        
        if (error) {
          console.error('[confirmDeleteSlot] Error deleting from database:', error);
          toast.error('Failed to delete slot from database.');
          setDeleteConfirmSlot(null);
          return;
        }
        console.log('[confirmDeleteSlot] Successfully deleted from database');
      }
      
      // Remove the slot from state
      setBreakSlots(prevSlots => 
        prevSlots.filter(slot => slot.id !== slotId)
      );
      
      // Remove from localCustomSlotsRef if it's a new slot
      localCustomSlotsRef.current = localCustomSlotsRef.current.filter(slot => slot.id !== slotId);
      
      // Remove any scheduled breaks for this slot
      const updatedAssignments = scheduledBreaks.filter(assignment => assignment.slot_id !== slotId);
      setScheduledBreaks(updatedAssignments);
      // Save updated assignments to session storage
      sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
      
      toast.success(isNewSlot ? 'Custom slot removed.' : 'Custom slot deleted from database.');
      setDeleteConfirmSlot(null);
      
      // Refresh data to ensure UI is in sync with database
      if (!isNewSlot) {
        await fetchBreakData();
      }
    } catch (err) {
      console.error('[confirmDeleteSlot] Unexpected error:', err);
      toast.error('An error occurred while deleting the slot.');
      setDeleteConfirmSlot(null);
    }
  };

  const handleAssignStaff = async (staff, slot) => {
    // Check if user has permission to assign this staff member
    if (!isAdmin && staff.id !== currentUser?.id) {
      toast.error('You can only assign yourself to breaks');
      return;
    }

    if (selectedLocation === ALL_LOCATIONS_VALUE) {
      toast.error('Select a specific location before assigning staff to breaks.');
      return;
    }

    // No capacity limit: allow unlimited assignments per slot
    
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
      location: selectedLocation,
      slot_data: { // Store slot data for potential fallback
        start_time: slot.start_time,
        duration_minutes: slot.duration_minutes,
        break_type: slot.break_type
      }
    };
    
    // Add to scheduled breaks state
    const updatedAssignments = [...scheduledBreaks, newAssignment];
    setScheduledBreaks(updatedAssignments);
    sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(updatedAssignments));
    // Removed per request: no toast after each add
    
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
  
  // Helper to get assigned staff for a slot
  const getAssignedStaffForSlot = (slotId) => {
    return scheduledBreaks.filter(assignment => {
      if (assignment.slot_id !== slotId) return false;
      // If viewing all locations, show all
      if (selectedLocation === ALL_LOCATIONS_VALUE) return true;
      // Otherwise, include only those whose scheduled_rota location matches the selected location
      const staff = availableStaff.find(s => s.id === assignment.user_id);
      return staff?.location === selectedLocation;
    });
  };

  // Add this useEffect to refetch data when selectedDate or selectedShift changes
  useEffect(() => {
    // Clear modified standard slots when date or shift changes
    // setModifiedStandardSlots({});
    // We DO NOT clear sessionStorage here - fetchBreakData will handle loading session or DB data
    
    // Clear locally added custom slots when date, shift, or location changes
    localCustomSlotsRef.current = [];
  }, [selectedDate, selectedShift, selectedLocation]);

  // Update localStorage when selections change
  useEffect(() => {
    localStorage.setItem('brakes_selected_date', selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    localStorage.setItem('brakes_selected_shift', selectedShift);
  }, [selectedShift]);
  
  useEffect(() => {
    localStorage.setItem('brakes_selected_location', selectedLocation);
  }, [selectedLocation]);

  // Initialize calendar month when date modal opens
  useEffect(() => {
    if (showDateModal) {
      if (selectedDate) {
        setCalendarMonth(new Date(`${selectedDate}T00:00:00`));
      } else {
        setCalendarMonth(new Date());
      }
    }
  }, [showDateModal, selectedDate]);

  // --- Rendering ---
  return (
    <div className="bg-gray-100 text-charcoal min-h-screen pb-20">
      {/* Sticky Controls in one line (badges) */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-300 shadow-md pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Date badge */}
            <button
              onClick={() => { 
                setShowDateModal(true); 
                setShowLocationModal(false); 
                setShowShiftModal(false);
              }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {selectedDate ? formatDate(new Date(`${selectedDate}T00:00:00`), 'dd/MM/yy') : 'Select date'}
            </button>
            {/* Location badge */}
            <button
              onClick={() => { setShowLocationModal(true); setShowDateModal(false); setShowShiftModal(false); }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {selectedLocation || 'Hub'}
            </button>
            {/* Shift badge */}
            <button
              onClick={() => { setShowShiftModal(true); setShowDateModal(false); setShowLocationModal(false); }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {selectedShift}
            </button>
          </div>
        </div>
      </div>

      {/* Modals for pickers */}
      {showDateModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gray-800 px-5 py-4 border-b border-gray-900 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Select date</h3>
              <button onClick={() => setShowDateModal(false)} className="text-gray-300 hover:text-white transition-colors flex-shrink-0 -mr-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
            <style>
              {`
                /* Kalendarz - responsywny mobile-first */
                .react-datepicker {
                  font-family: inherit !important;
                  border: 1px solid #e5e7eb !important;
                  border-radius: 8px !important;
                  background-color: white !important;
                  width: 100% !important;
                  max-width: 100% !important;
                }
                
                .react-datepicker__month-container {
                  width: 100% !important;
                }
                
                /* Header miesiąca */
                .react-datepicker__header {
                  background-color: #f9fafb !important;
                  border-bottom: 1px solid #e5e7eb !important;
                  padding: 8px 0 !important;
                  border-radius: 8px 8px 0 0 !important;
                }
                
                .react-datepicker__current-month {
                  color: #1f2937 !important;
                  font-weight: 600 !important;
                  font-size: 0.9rem !important;
                  margin-bottom: 6px !important;
                }
                
                /* Nagłówki dni tygodnia */
                .react-datepicker__day-names {
                  display: flex !important;
                  justify-content: space-between !important;
                  padding: 0 4px !important;
                  margin-top: 6px !important;
                  gap: 2px !important;
                }
                
                .react-datepicker__day-name {
                  color: #6b7280 !important;
                  font-weight: 600 !important;
                  font-size: 0.7rem !important;
                  flex: 1 !important;
                  min-width: 0 !important;
                  max-width: 2.25rem !important;
                  height: 2rem !important;
                  line-height: 2rem !important;
                  margin: 0 !important;
                  text-align: center !important;
                }
                
                /* Tydzień - równomierne rozłożenie */
                .react-datepicker__week {
                  display: flex !important;
                  justify-content: space-between !important;
                  padding: 0 4px !important;
                  gap: 2px !important;
                }
                
                /* Dni - kompaktowe kwadratowe pudełka dla mobile */
                .react-datepicker__day {
                  flex: 1 !important;
                  min-width: 0 !important;
                  max-width: 2.25rem !important;
                  height: 2.25rem !important;
                  line-height: 2.25rem !important;
                  margin: 1px !important;
                  border-radius: 6px !important;
                  color: #1f2937 !important;
                  font-size: 0.8rem !important;
                  text-align: center !important;
                  transition: all 0.15s ease !important;
                  cursor: pointer !important;
                  padding: 0 !important;
                }
                
                /* Hover dla zwykłych dni */
                .react-datepicker__day:hover:not(.react-datepicker__day--disabled):not(.react-datepicker__day--selected) {
                  background-color: #f3f4f6 !important;
                  color: #1f2937 !important;
                }
                
                /* Wybrany dzień */
                .react-datepicker__day--selected,
                .react-datepicker__day--keyboard-selected {
                  background-color: #1f2937 !important;
                  color: white !important;
                  font-weight: 700 !important;
                }
                
                /* Niedziela - czerwone tło */
                .react-datepicker__day--sunday:not(.react-datepicker__day--disabled) {
                  background-color: #ef4444 !important;
                  color: white !important;
                  font-weight: 600 !important;
                }
                
                /* Hover dla niedzieli */
                .react-datepicker__day--sunday:not(.react-datepicker__day--disabled):hover {
                  background-color: #dc2626 !important;
                  color: white !important;
                }
                
                /* Wybrany dzień w niedzielę - ciemniejszy niebieski */
                .react-datepicker__day--sunday.react-datepicker__day--selected,
                .react-datepicker__day--sunday.react-datepicker__day--keyboard-selected {
                  background-color: #2563eb !important;
                  color: white !important;
                }
                
                /* Dni poza miesiącem */
                .react-datepicker__day--outside-month {
                  color: #d1d5db !important;
                  background-color: transparent !important;
                }
                
                /* Niedziela poza miesiącem */
                .react-datepicker__day--outside-month.react-datepicker__day--sunday {
                  background-color: #fecaca !important;
                  color: #b91c1c !important;
                }
                
                /* Wyłączone dni */
                .react-datepicker__day--disabled {
                  color: #d1d5db !important;
                  cursor: not-allowed !important;
                  background-color: transparent !important;
                }
                
                /* Przyciski nawigacji */
                .react-datepicker__navigation {
                  top: 10px !important;
                  width: 28px !important;
                  height: 28px !important;
                  border-radius: 6px !important;
                  transition: background-color 0.15s ease !important;
                }
                
                .react-datepicker__navigation:hover {
                  background-color: #f3f4f6 !important;
                }
                
                .react-datepicker__navigation-icon::before {
                  border-color: #6b7280 !important;
                  border-width: 2px 2px 0 0 !important;
                  width: 7px !important;
                  height: 7px !important;
                }
                
                /* Kontener miesiąca - kompaktowy dla mobile */
                .react-datepicker__month {
                  margin: 8px !important;
                  padding: 0 !important;
                }
                
                /* Dzisiejszy dzień - obramowanie */
                .react-datepicker__day--today:not(.react-datepicker__day--selected) {
                  border: 2px solid #ea580c !important;
                  font-weight: 700 !important;
                  background-color: #fed7aa !important;
                }
                
                /* Media query dla większych ekranów */
                @media (min-width: 640px) {
                  .react-datepicker__day {
                    max-width: 2.5rem !important;
                    height: 2.5rem !important;
                    line-height: 2.5rem !important;
                    font-size: 0.875rem !important;
                  }
                  
                  .react-datepicker__day-name {
                    max-width: 2.5rem !important;
                    height: 2.25rem !important;
                    line-height: 2.25rem !important;
                    font-size: 0.875rem !important;
                  }
                  
                  .react-datepicker__current-month {
                    font-size: 1rem !important;
                  }
                  
                  .react-datepicker__month {
                    margin: 12px !important;
                  }
                }
              `}
            </style>
            <DatePicker
              inline
              selected={(() => {
                if (!selectedDate || !calendarMonth) return null;
                const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
                // Only highlight if the selected date is in the currently displayed month
                const selectedMonth = selectedDateObj.getMonth();
                const selectedYear = selectedDateObj.getFullYear();
                const displayedMonth = calendarMonth.getMonth();
                const displayedYear = calendarMonth.getFullYear();
                if (selectedMonth === displayedMonth && selectedYear === displayedYear) {
                  return selectedDateObj;
                }
                return null;
              })()}
              openToDate={selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date()}
              onChange={(date) => {
                if (date) {
                  setSelectedDate(formatDate(date, 'yyyy-MM-dd'));
                  setShowDateModal(false);
                }
              }}
              onMonthChange={(date) => {
                setCalendarMonth(date);
              }}
              onYearChange={(date) => {
                setCalendarMonth(date);
              }}
              calendarStartDay={1}
            />
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLocationModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gray-800 px-5 py-4 border-b border-gray-900 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Select hub</h3>
              <button onClick={() => setShowLocationModal(false)} className="text-gray-300 hover:text-white transition-colors flex-shrink-0 -mr-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-auto space-y-3">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => { setSelectedLocation(loc.name); setShowLocationModal(false); }}
                  className={`w-full text-center px-4 py-3 rounded-lg border-2 transition-all text-base font-semibold ${selectedLocation === loc.name ? 'border-gray-900 bg-gray-800 text-white shadow-lg' : 'border-gray-300 bg-white hover:bg-gray-100 text-charcoal hover:border-gray-400'}`}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showShiftModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gray-800 px-5 py-4 border-b border-gray-900 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Select shift</h3>
              <button onClick={() => setShowShiftModal(false)} className="text-gray-300 hover:text-white transition-colors flex-shrink-0 -mr-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {['Day','Afternoon','Night'].map(shift => (
                <button
                  key={shift}
                  onClick={() => { setSelectedShift(shift); setShowShiftModal(false); }}
                  className={`w-full text-center px-4 py-3 rounded-lg border-2 transition-all text-base font-semibold ${selectedShift === shift ? 'border-gray-900 bg-gray-800 text-white shadow-lg' : 'border-gray-300 bg-white hover:bg-gray-100 text-charcoal hover:border-gray-400'}`}
                >
                  {shift}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Messages */}
      {/* Usunięto wyświetlanie komunikatu błędu, teraz używamy toast */}


      {/* Break Slots Display */}
      <div className="container mx-auto p-4">
        {isLoading ? (
          <div className="text-center py-10">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
            <p className="mt-2 text-gray-900 font-semibold">Loading breaks...</p>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-8">
          {Object.entries(groupedSlots).map(([groupName, slotsInGroup]) => (
            <div key={groupName}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-3">
                {slotsInGroup.map(slot => (
                  <SlotCard 
                    key={slot.id} 
                    slot={slot} 
                    assignedStaff={getAssignedStaffForSlot(slot.id)}
                    onSlotClick={handleSlotClick}
                    onDeleteClick={handleDeleteCustomSlot}
                    onRemoveStaffClick={handleRemoveStaff}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                  />
                ))}
                
                {/* Add Slot Card - Only for admins and only in last group */}
                {isAdmin && groupName === Object.keys(groupedSlots)[Object.keys(groupedSlots).length - 1] && (
                  <div 
                    onClick={() => setAddSlotModalOpen(true)}
                    className="bg-gray-50 p-4 md:p-4 rounded-xl border-2 border-dashed border-gray-400 hover:border-gray-600 cursor-pointer min-h-[180px] md:min-h-[140px] flex flex-col items-center justify-center relative transition-all duration-200 hover:bg-gray-100 hover:shadow-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 md:h-10 md:w-10 text-orange-600 mb-2 md:mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-base md:text-sm font-bold text-gray-900">Add Custom Slot</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Save Bar */}
      {isAdmin && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gray-100 border-t-2 border-gray-400 shadow-[0_-2px_12px_rgba(0,0,0,0.15)]">
          <div className="container mx-auto px-3 py-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}>
            <button
              onClick={handleSaveAllBreaks}
              className="w-full rounded-full bg-black text-white py-2 font-bold hover:bg-gray-900 disabled:bg-gray-400 transition-colors shadow-lg"
              disabled={isLoading}
            >
              Save Breaks
            </button>
          </div>
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
          currentLocation={selectedLocation}
          isAllLocation={selectedLocation === ALL_LOCATIONS_VALUE}
        />
      )}
      
      {addSlotModalOpen && (
        <AddSlotModal 
          isOpen={addSlotModalOpen}
          onClose={() => setAddSlotModalOpen(false)}
          onAddCustomSlot={handleAddCustomSlot}
          selectedShift={selectedShift}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmSlot && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-gray-400 w-full max-w-sm overflow-hidden">
            <div className="bg-gray-800 px-5 py-4 border-b border-gray-900">
              <h3 className="text-lg font-bold text-white">Delete Custom Slot?</h3>
            </div>
            <div className="p-5">
              <p className="text-base text-charcoal mb-5">
                Are you sure you want to delete slot at <strong className="text-orange-600">{deleteConfirmSlot.start_time}</strong> ({deleteConfirmSlot.duration_minutes} min)?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDeleteSlot}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition-colors shadow-md"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setDeleteConfirmSlot(null)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-charcoal rounded-lg hover:bg-gray-300 font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Staff Selection Modal Component - Enhance the staff removal functionality
const StaffSelectionModal = ({ isOpen, onClose, slot, availableStaff, assignedStaff, onAssignStaff, onRemoveStaff, currentLocation, isAllLocation }) => {
  const modalRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
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
  const eligibleStaff = availableStaff.filter(staff => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 md:p-4 bg-black/70">
      <div 
        ref={modalRef}
        className="relative bg-white text-charcoal rounded-lg shadow-xl border-2 border-gray-400 w-full max-w-md lg:max-w-5xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="bg-gray-800 px-2 py-2 md:px-4 md:py-2.5 border-b border-gray-900">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap text-sm md:text-base">
              <span className="font-bold text-white">{slot.start_time} - {
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
              {typeof currentLocation === 'string' && !isAllLocation && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-300">{currentLocation}</span>
                </>
              )}
              <span className="text-gray-400">•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold bg-gray-200 text-charcoal border-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {assignedStaff.length}
              </span>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-300 hover:text-white transition-colors flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {isAllLocation && (
          <div className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 md:mx-4">
            Select a specific location tab to assign staff to this break.
          </div>
        )}
        
        {/* Currently Assigned Staff */}
        <div className="px-2 py-2 md:px-4 md:py-3 border-b border-gray-200">
          <h4 className="text-base md:text-lg font-bold text-gray-900 mb-2 md:mb-3">Currently Assigned</h4>
          {assignedStaff.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {assignedStaff.map(staff => (
                <div 
                  key={staff.id} 
                  className="flex justify-between items-center bg-gray-200 border-2 border-gray-300 px-3 py-2 md:px-4 md:py-2.5 rounded-lg shadow-md group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Avatar circle with initial */}
                    <div className="flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-orange-400 flex items-center justify-center font-bold text-sm md:text-base text-white bg-orange-600 shadow-md">
                      {staff.user_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-base md:text-lg font-bold text-charcoal">{staff.user_name}</div>
                      <div className="text-sm md:text-base text-gray-600">{staff.preferred_shift}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => onRemoveStaff(staff)}
                    className="flex-shrink-0 text-red-600 hover:text-red-800 hover:bg-red-100 ml-2 md:ml-3 p-1.5 rounded-full transition-all duration-200 opacity-80 group-hover:opacity-100"
                    aria-label="Remove staff member"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-2 md:py-3 text-gray-500 italic text-base md:text-lg">
              No staff assigned to this slot yet
            </div>
          )}
        </div>
        
        {/* Available Staff List */}
        <div className="p-2 md:p-4">
          <h4 className="text-base md:text-lg font-bold text-gray-900 mb-2 md:mb-3">Available Staff</h4>
          
          {availableStaff.length === 0 ? (
            <div className="text-center py-4 md:py-6 text-gray-500 text-base md:text-lg">
              No available staff
            </div>
          ) : eligibleStaff.length === 0 ? (
            <div className="text-center py-4 md:py-6 text-gray-500 text-base md:text-lg">
              No available staff
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {eligibleStaff.map(staff => (
                <button 
                  key={staff.id}
                   disabled={isProcessing || isAllLocation}
                  onClick={async () => {
                    if (isAllLocation) return;
                    setIsProcessing(true);
                    await onAssignStaff(staff, slot);
                    setIsProcessing(false);
                  }}
                  className={`w-full text-left flex items-center justify-between px-3 py-2 md:px-4 md:py-2.5 rounded-lg transition-all duration-200 ${
                     isProcessing || isAllLocation
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-gray-200'
                      : 'bg-gray-100 border-2 border-gray-300 hover:bg-gray-200 hover:border-gray-500 hover:shadow-md focus:bg-gray-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Avatar circle with initial */}
                    <div className="flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-orange-400 flex items-center justify-center font-bold text-sm md:text-base text-orange-700 bg-orange-50 shadow-md">
                      {`${staff.first_name[0]}${staff.last_name[0]}`.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base md:text-lg font-bold text-charcoal">{staff.first_name} {staff.last_name}</div>
                      <div className="text-sm md:text-base text-gray-600">
                        {staff.preferred_shift} 
                        {/* For Day shift, show which breaks are already assigned */}
                        {staff.preferred_shift?.toLowerCase() === 'day' && (
                          <span className="ml-2">
                            {staff.has_break_15 && <span className="inline-block px-2 py-0.5 bg-orange-200 text-orange-900 border border-orange-400 rounded text-xs md:text-sm mr-1 font-medium">15m</span>}
                            {staff.has_break_45 && <span className="inline-block px-2 py-0.5 bg-green-200 text-green-900 border border-green-400 rounded text-xs md:text-sm font-medium">45m</span>}
                          </span>
                        )}
                        {/* For others, show remaining break time */}
                        {staff.preferred_shift?.toLowerCase() !== 'day' && (
                          <span className="ml-2">
                            {staff.total_break_minutes || 0}/60 min used
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7 text-orange-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-2 py-2 md:px-4 md:py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 md:px-4 md:py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-xs md:text-sm font-semibold shadow-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Add Slot Modal Component
const AddSlotModal = ({ isOpen, onClose, onAddCustomSlot, selectedShift }) => {
  const modalRef = useRef(null);
  
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
  
  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div 
        ref={modalRef}
        className="relative bg-white text-charcoal rounded-2xl shadow-2xl border-2 border-gray-400 w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gray-800 px-5 py-4 border-b border-gray-900 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white">Create Custom Slot</h3>
            <button 
              onClick={onClose}
              className="text-gray-300 hover:text-white transition-colors flex-shrink-0 -mr-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Form Content */}
        <div className="p-5">
          <AddCustomSlotForm 
            onAddCustomSlot={(formData) => {
              const success = onAddCustomSlot(formData);
              if (success) {
                onClose();
              }
              return success;
            }}
            selectedShift={selectedShift}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

// Add Custom Slot Form Component
const AddCustomSlotForm = ({ onAddCustomSlot, selectedShift }) => {
  const [formData, setFormData] = useState({
    start_time: '',
    duration_minutes: 60
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
      [name]: name === 'duration_minutes' ? parseInt(value, 10) : value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.start_time) {
      alert('Please select a start time');
      return;
    }
    
    // Add required fields for backend
    const slotData = {
      ...formData,
      capacity: 999, // Unlimited capacity
      break_type: `Custom Slot (${formData.duration_minutes} min)`
    };
    
    const success = onAddCustomSlot(slotData);
    
    if (success) {
      // Reset form (except selected shift preference)
      setFormData({
        start_time: formData.start_time,
        duration_minutes: 60
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
    <form onSubmit={handleSubmit} className="space-y-5">
        {/* Start Time */}
        <div>
          <label htmlFor="cs_start_time" className="block text-sm font-bold text-gray-900 mb-2">
            Start Time
          </label>
          <select
            id="cs_start_time"
            name="start_time"
            value={formData.start_time}
            onChange={handleChange}
            className="w-full bg-white text-charcoal text-base border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all"
          >
            <option value="" className="bg-white text-charcoal">Select time</option>
            {generateTimeOptions().map(time => (
              <option key={time} value={time} className="bg-white text-charcoal">
                {time}
              </option>
            ))}
          </select>
        </div>
        
        {/* Duration */}
        <div>
          <label htmlFor="cs_duration_minutes" className="block text-sm font-bold text-gray-900 mb-2">
            Duration (minutes)
          </label>
          <select
            id="cs_duration_minutes"
            name="duration_minutes"
            value={formData.duration_minutes}
            onChange={handleChange}
            className="w-full bg-white text-charcoal text-base border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all"
          >
            <option value={15} className="bg-white text-charcoal">15 minutes</option>
            <option value={30} className="bg-white text-charcoal">30 minutes</option>
            <option value={45} className="bg-white text-charcoal">45 minutes</option>
            <option value={60} className="bg-white text-charcoal">60 minutes</option>
          </select>
        </div>
        
        <div className="pt-1">
          <button
            type="submit"
            className="w-full px-4 py-3.5 bg-black text-white text-base font-bold rounded-lg hover:bg-gray-900 transition-colors shadow-lg"
          >
            Add Custom Slot
          </button>
        </div>
      </form>
  );
};

// Slot Card Component to display a break slot
const SlotCard = ({ slot, assignedStaff, onSlotClick, onDeleteClick, onRemoveStaffClick, currentUser, isAdmin }) => {
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
  
  // WARIANTY POWIĘKSZENIA SLOTÓW - wybierz jeden z poniższych:
  // 
  // WARIANT 1: Umiarkowane powiększenie (+25%)
  // - Karta: min-h-[150px] md:min-h-[180px], padding: p-3 md:p-5
  // - Czas: text-base md:text-lg (16px/18px)
  // - Assigned: text-sm md:text-base (14px/16px)
  // - Nazwy: text-sm md:text-base (14px/16px)
  // - "Click to assign": text-sm (14px)
  // - Badge czas: text-sm, ikona h-4 w-4
  // - Grid: grid-cols-1 (1 kolumna na mobile)
  //
  // WARIANT 2: Średnie powiększenie (+50%) ⭐ RECOMMENDED
  // - Karta: min-h-[180px] md:min-h-[220px], padding: p-4 md:p-6
  // - Czas: text-lg md:text-xl (18px/20px)
  // - Assigned: text-base md:text-lg (16px/18px)
  // - Nazwy: text-base md:text-lg (16px/18px)
  // - "Click to assign": text-base (16px)
  // - Badge czas: text-base, ikona h-5 w-5
  // - Grid: grid-cols-1 (1 kolumna na mobile)
  //
  // WARIANT 3: Duże powiększenie (+75%)
  // - Karta: min-h-[220px] md:min-h-[260px], padding: p-5 md:p-7
  // - Czas: text-xl md:text-2xl (20px/24px)
  // - Assigned: text-lg md:text-xl (18px/20px)
  // - Nazwy: text-lg md:text-xl (18px/20px)
  // - "Click to assign": text-lg (18px)
  // - Badge czas: text-lg, ikona h-6 w-6
  // - Grid: grid-cols-1 (1 kolumna na mobile)
  //
  // WARIANT 4: Bardzo duże powiększenie (+100%)
  // - Karta: min-h-[260px] md:min-h-[300px], padding: p-6 md:p-8
  // - Czas: text-2xl md:text-3xl (24px/30px)
  // - Assigned: text-xl md:text-2xl (20px/24px)
  // - Nazwy: text-xl md:text-2xl (20px/24px)
  // - "Click to assign": text-xl (20px)
  // - Badge czas: text-xl, ikona h-7 w-7
  // - Grid: grid-cols-1 (1 kolumna na mobile)

  // ===== WYBIERZ WARIANT (odkomentuj jeden z poniższych) =====
  
  // WARIANT 1 - Umiarkowane powiększenie
  // const cardClasses = `bg-white p-3 md:p-5 rounded-lg shadow-sm border border-gray-200 hover:border-gray-300 hover:border-gray-600 cursor-pointer min-h-[150px] md:min-h-[180px] flex flex-col justify-between relative`;
  // const timeClasses = "font-semibold text-base md:text-lg";
  // const assignedClasses = "text-sm md:text-base text-gray-600";
  // const staffNameClasses = "text-sm md:text-base bg-gray-100 border border-gray-200 px-2 py-1 md:px-3 md:py-1.5 rounded flex justify-between items-center";
  // const clickToAssignClasses = "mt-3 md:mt-4 text-center text-gray-500 text-sm italic";
  // const badgeClasses = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium";
  // const badgeIconClasses = "h-4 w-4";
  // const removeIconClasses = "h-4 w-4 md:h-5 md:w-5";
  // const gridClasses = "grid grid-cols-1 gap-3 md:gap-4";

  // WARIANT 2 - Średnie powiększenie ⭐ RECOMMENDED
  // Dark Modern Premium - białe karty z szaro-czarnymi i pomarańczowymi akcentami
  const cardClasses = `bg-white p-4 md:p-4 rounded-xl border-2 border-gray-300 hover:border-gray-500 cursor-pointer min-h-[180px] md:min-h-[140px] flex flex-col justify-between relative transition-all duration-200 shadow-lg hover:shadow-2xl`;
  const timeClasses = "font-bold text-lg md:text-base text-gray-900";
  const staffNameClasses = "text-base md:text-sm bg-gray-200 border-2 border-gray-300 px-3 py-2 md:px-3 md:py-1.5 rounded-lg flex justify-between items-center shadow-md font-semibold text-charcoal hover:bg-gray-300 hover:shadow-lg transition-all";
  const badgeClasses = "inline-flex items-center gap-1 px-2 py-0.5 md:px-2 md:py-0.5 rounded-full border text-sm md:text-xs font-semibold";
  const badgeIconClasses = "h-3.5 w-3.5 md:h-3 md:w-3";
  const removeIconClasses = "h-5 w-5 md:h-5 md:w-5";

  // WARIANT 3 - Duże powiększenie
  // const cardClasses = `bg-white p-5 md:p-7 rounded-lg shadow-sm border border-gray-200 hover:border-gray-300 hover:border-gray-600 cursor-pointer min-h-[220px] md:min-h-[260px] flex flex-col justify-between relative`;
  // const timeClasses = "font-semibold text-xl md:text-2xl";
  // const assignedClasses = "text-lg md:text-xl text-gray-600";
  // const staffNameClasses = "text-lg md:text-xl bg-gray-100 border border-gray-200 px-4 py-2 md:px-5 md:py-2.5 rounded flex justify-between items-center";
  // const clickToAssignClasses = "mt-5 md:mt-6 text-center text-gray-500 text-lg italic";
  // const badgeClasses = "inline-flex items-center gap-2 px-4 py-2 rounded-full border text-lg font-medium";
  // const badgeIconClasses = "h-6 w-6";
  // const removeIconClasses = "h-6 w-6 md:h-7 md:w-7";
  // const gridClasses = "grid grid-cols-1 gap-5 md:gap-6";

  // WARIANT 4 - Bardzo duże powiększenie
  // const cardClasses = `bg-white p-6 md:p-8 rounded-lg shadow-sm border border-gray-200 hover:border-gray-300 hover:border-gray-600 cursor-pointer min-h-[260px] md:min-h-[300px] flex flex-col justify-between relative`;
  // const timeClasses = "font-semibold text-2xl md:text-3xl";
  // const assignedClasses = "text-xl md:text-2xl text-gray-600";
  // const staffNameClasses = "text-xl md:text-2xl bg-gray-100 border border-gray-200 px-5 py-2.5 md:px-6 md:py-3 rounded flex justify-between items-center";
  // const clickToAssignClasses = "mt-6 md:mt-7 text-center text-gray-500 text-xl italic";
  // const badgeClasses = "inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full border text-xl font-medium";
  // const badgeIconClasses = "h-7 w-7";
  // const removeIconClasses = "h-7 w-7 md:h-8 md:w-8";
  // const gridClasses = "grid grid-cols-1 gap-6 md:gap-7";

  const handleCardClick = (e) => {
    // Prevent opening the modal if the click was on a remove button or delete button
    if (e.target.closest('.remove-staff-button') || e.target.closest('.delete-slot-button')) {
      return;
    }
    onSlotClick(slot);
  };

  return (
    <div 
      className={cardClasses}
      onClick={handleCardClick}
    >
      <div>
        <div className="flex justify-between items-center mb-2 md:mb-1.5">
          <span className={timeClasses}>
            {formatStartTime()} - {calculateEndTime()}
          </span>
          <span className={`${badgeClasses} bg-gray-200 text-charcoal border-gray-400`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={badgeIconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {assignedStaff.length}
          </span>
        </div>
        
        {/* List assigned staff with remove buttons */}
        {assignedStaff.length > 0 && (
          <div className="mt-3 md:mt-2 space-y-2.5 md:space-y-1.5">
            {assignedStaff.map((staff) => (
              <div 
                key={staff.id} 
                className={`${staffNameClasses} group`}
              >
                <div className="flex items-center gap-2 md:gap-2 flex-1 min-w-0">
                  {/* Avatar circle with initial */}
                  <div className="flex-shrink-0 w-9 h-9 md:w-8 md:h-8 rounded-full border-2 border-orange-400 flex items-center justify-center font-bold text-sm md:text-xs text-white bg-orange-600 shadow-md">
                    {staff.user_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <span className="truncate font-semibold text-charcoal">{staff.user_name}</span>
                </div>
                {/* Show remove button only if user is admin or it's their own break */}
                {(isAdmin || staff.user_id === currentUser?.id) && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the card's onClick
                      onRemoveStaffClick(staff);
                    }} 
                    className="remove-staff-button flex-shrink-0 text-red-600 hover:text-white hover:bg-red-600 ml-2 md:ml-3 p-1.5 rounded-full transition-all duration-200 opacity-80 group-hover:opacity-100"
                    aria-label={`Remove ${staff.user_name}`}
                    title={`Remove ${staff.user_name}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={removeIconClasses} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Delete button only for admins and custom slots - bottom right */}
      {isAdmin && slot.is_custom && (
        <div className="flex justify-end mt-2 md:mt-1">
          <button 
            className="delete-slot-button text-red-500 hover:text-red-700 hover:bg-red-100 p-1.5 md:p-2 rounded-full transition-all duration-200 flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the card's onClick
              onDeleteClick(slot.id);
            }}
            title="Delete custom slot"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="text-xs md:text-sm font-medium">Delete</span>
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
      total_break_minutes: PropTypes.number.isRequired,
      location: PropTypes.string
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
  onRemoveStaff: PropTypes.func.isRequired,
  currentLocation: PropTypes.string,
  isAllLocation: PropTypes.bool
};

AddSlotModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAddCustomSlot: PropTypes.func.isRequired,
  selectedShift: PropTypes.string
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
  onDeleteClick: PropTypes.func.isRequired,
  onRemoveStaffClick: PropTypes.func.isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.string.isRequired
  }),
  isAdmin: PropTypes.bool.isRequired
};

export default BrakesManager; 