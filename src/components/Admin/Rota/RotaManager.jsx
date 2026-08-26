import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { logSystemActivity } from '../../../lib/systemActivityLog';
import SlotCard from './SlotCard';
import AssignModal from './AssignModal';
import TimePicker from './TimePicker';
import EditSlotModal from './EditSlotModal';
import ExportRotaButton from '../ExportRotaButton';
import TemplateModal from './TemplateModal';
import { createPortal } from 'react-dom';
import { useToast } from '../../ui/ToastContext';
import { countPendingAdditionalPeople } from '../../../utils/rotaWeekBaseline';

// Add date-fns for date manipulation
import { format, addDays, subDays, parseISO, getWeek } from 'date-fns';
import {
  isConsecutiveWorkDaysDbError,
  parseMaxConsecutiveWorkDays,
  wouldExceedConsecutiveWorkDays,
  consecutiveWorkDaysBlockedMessage,
} from '../../../utils/consecutiveWorkDays';
import {
  normalizeAssignedEmployeeIds,
  countUniqueAssigned,
} from '../../../utils/rotaAssignedEmployees';

// Week start on Saturday (same as My Rota)
const getWeekStart = (date) => {
  const d = date instanceof Date ? date : parseISO(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : day + 1;
  return subDays(d, diff);
};

const RotaManager = ({ user }) => {
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('rota_planner_view_mode');
    return saved === 'week' ? 'week' : 'day';
  });
  const [currentDate, setCurrentDate] = useState(() => {
    // Get saved date from localStorage with proper default to today
    const savedDate = localStorage.getItem('rota_planner_current_date');
    if (savedDate) {
      return savedDate;
    } else {
      // Only if no saved date is found, use today's date
      return new Date().toISOString().split('T')[0];
    }
  });
  const [locations, setLocations] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(() => {
    // Próbujemy odczytać ostatnio wybraną lokalizację z localStorage
    const savedLocation = localStorage.getItem('selected_rota_location_view');
    return savedLocation || null; // Will be set to first location after loading
  });

  // Auto-navigate to today's date when entering Rota Planner page
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const lastVisitedRotaPlanner = localStorage.getItem('rota_planner_last_visited');
    const currentVisit = Date.now().toString();
    
    // If this is a new visit to rota planner page (different day or first time), set today's date
    if (!lastVisitedRotaPlanner || 
        (lastVisitedRotaPlanner && new Date(parseInt(lastVisitedRotaPlanner)).toDateString() !== new Date().toDateString())) {
      setCurrentDate(today);
      localStorage.setItem('rota_planner_last_visited', currentVisit);
    }
  }, []); // Run only once when component mounts
  const [newSlot, setNewSlot] = useState({
    shift_type: 'day',
    location: '',
    start_time: '05:45',
    end_time: '18:00',
    capacity: 1
  });
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState(null); // 'start' or 'end'
  const [timePickerCallback, setTimePickerCallback] = useState(null);
  const toast = useToast();
  const [pendingAdditionalCount, setPendingAdditionalCount] = useState(0);
  const [baselineEpoch, setBaselineEpoch] = useState(0);

  // Save current date to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('rota_planner_current_date', currentDate);
  }, [currentDate]);

  // Save view mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('rota_planner_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    const weekStart = getWeekStart(currentDate);
    countPendingAdditionalPeople(supabase, weekStart)
      .then((count) => {
        if (!cancelled) setPendingAdditionalCount(count);
      })
      .catch(() => {
        if (!cancelled) setPendingAdditionalCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [currentDate, slots, baselineEpoch]);

  // Save scroll position when user scrolls
  useEffect(() => {
    const saveScroll = () => {
      localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    };

    window.addEventListener('scroll', saveScroll, { passive: true });

    // Robust scroll restoration function with retries
    const restoreScroll = () => {
      const saved = localStorage.getItem('rota_planner_scroll_position');
      if (!saved) return;
      const target = parseInt(saved, 10);
      let attempts = 0;
      const maxAttempts = 10;
      const attemptRestore = () => {
        // If we can already scroll to target, do it and exit
        if (document.body.scrollHeight >= target) {
          window.scrollTo({ top: target, behavior: 'auto' });
        } else if (attempts < maxAttempts) {
          attempts += 1;
          // Wait a bit and try again, content might not be fully rendered yet
          setTimeout(attemptRestore, 200);
        }
      };
      attemptRestore();
    };

    // Run once on mount
    restoreScroll();

    return () => {
      window.removeEventListener('scroll', saveScroll);
      // Save final scroll position when component unmounts
      localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    };
  }, []);

  // Fetch locations
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setLocations(data || []);
        
        // Get saved location from localStorage
        const savedLocation = localStorage.getItem('preferred_rota_location');
        
        // Set default location - either saved preference or first available
        if (data && data.length > 0) {
          // Check if saved location exists in available locations
          const locationExists = savedLocation && data.some(loc => loc.name === savedLocation);
          
          setNewSlot(prev => ({ 
            ...prev, 
            location: locationExists ? savedLocation : data[0].name 
          }));
          
          // Check if the selected location view is still valid (active)
          const selectedLocationValid = selectedLocation && data.some(loc => loc.name === selectedLocation);
            
          if (!selectedLocationValid && data.length > 0) {
            // Set to first location if the previously selected location is no longer active or null
            setSelectedLocation(data[0].name);
            localStorage.setItem('selected_rota_location_view', data[0].name);
          }
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        setError('Failed to load locations');
      }
    };

    fetchLocations();
  }, [selectedLocation]);

  // Fetch slots for the current date or week
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      try {
        const isWeekView = viewMode === 'week';
        const weekStartDate = getWeekStart(parseISO(currentDate));
        const startStr = isWeekView ? format(weekStartDate, 'yyyy-MM-dd') : currentDate;
        const endStr = isWeekView ? format(addDays(weekStartDate, 6), 'yyyy-MM-dd') : currentDate;

        let query = supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            capacity,
            user_id,
            status
          `)
          .gte('date', startStr)
          .lte('date', endStr);

        if (selectedLocation) {
          query = query.eq('location', selectedLocation);
        }

        const { data, error } = await query;

        if (error) throw error;

        const slotsMap = new Map();

        data.forEach(slot => {
          const key = isWeekView
            ? `${slot.date}-${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`
            : `${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;

          if (!slotsMap.has(key)) {
            slotsMap.set(key, {
              id: slot.id,
              date: slot.date,
              shift_type: slot.shift_type,
              location: slot.location,
              start_time: slot.start_time,
              end_time: slot.end_time,
              capacity: slot.capacity,
              assigned_employees: slot.user_id ? [slot.user_id] : [],
              status: slot.status
            });
          } else {
            const existingSlot = slotsMap.get(key);
            if (slot.user_id) {
              existingSlot.assigned_employees.push(slot.user_id);
            }
            if (slot.status === 'available' && existingSlot.status !== 'available') {
              existingSlot.status = 'available';
            }
          }
        });

        const mergedSlots = Array.from(slotsMap.values()).map((s) => ({
          ...s,
          assigned_employees: normalizeAssignedEmployeeIds(s.assigned_employees),
        }));
        setSlots(mergedSlots);

        setTimeout(() => {
          const savedScrollPosition = localStorage.getItem('rota_planner_scroll_position');
          if (savedScrollPosition) {
            window.scrollTo({
              top: parseInt(savedScrollPosition),
              behavior: 'auto'
            });
          }
        }, 200);
      } catch (error) {
        console.error('Error fetching slots:', error);
        setError('Failed to load schedule');
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [currentDate, selectedLocation, viewMode]);

  // Dodaję funkcję do automatycznego usuwania komunikatu sukcesu po 3 sekundach
  useEffect(() => {
    if (successMessage) {
      // Disable success notifications - just clear the message
      setSuccessMessage(null);
    }
  }, [successMessage]);

  // Wyświetlanie błędów jako toast
  useEffect(() => {
    if (error) {
      toast.error(error);
      // Clear after showing to avoid repeated toasts
      setError(null);
    }
  }, [error, toast]);

  const handleDateChange = (e) => {
    // Save current scroll position before changing date
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    setCurrentDate(e.target.value);
  };

  const handleAddSlot = async () => {
    try {
      // Reset modalnego błędu przed każdą próbą
      setModalError(null);
      
      if (!newSlot.location) {
        setModalError('Please select a location');
        return;
      }

      // Sprawdź bezpośrednio w bazie danych czy slot o takich samych parametrach już istnieje
      const { data: existingSlots, error: checkError } = await supabase
        .from('scheduled_rota')
        .select('id')
        .eq('date', currentDate)
        .eq('shift_type', newSlot.shift_type)
        .eq('location', newSlot.location)
        .eq('start_time', newSlot.start_time)
        .eq('end_time', newSlot.end_time);
      
      if (checkError) {
        console.error('Error checking for duplicate slots:', checkError);
        throw checkError;
      }
      
      if (existingSlots && existingSlots.length > 0) {
        // Użyj nowego stanu modalError zamiast globalnego error
        setModalError('A slot with the same location and time already exists. Please find and edit the existing slot instead of creating a duplicate.');
        return;
      }

      // Save the selected location as preferred
      localStorage.setItem('preferred_rota_location', newSlot.location);

      const { data, error } = await supabase
        .from('scheduled_rota')
        .insert([
          {
            date: currentDate,
            shift_type: newSlot.shift_type,
            location: newSlot.location,
            start_time: newSlot.start_time,
            end_time: newSlot.end_time,
            capacity: newSlot.capacity,
            user_id: null, // Initially no user assigned
            status: null // Initially not available for self-service
          }
        ])
        .select();

      if (error) throw error;

      await logSystemActivity(supabase, user, {
        entity_type: 'rota',
        action_type: 'slot_added',
        payload: {
          date: currentDate,
          shift_type: newSlot.shift_type,
          location: newSlot.location,
          start_time: newSlot.start_time,
          end_time: newSlot.end_time,
          capacity: newSlot.capacity,
        },
      });

      // Add new slot to UI
      setSlots(prev => [...prev, {
        id: data[0].id,
        date: data[0].date,
        shift_type: data[0].shift_type,
        location: data[0].location,
        start_time: data[0].start_time,
        end_time: data[0].end_time,
        capacity: data[0].capacity,
        assigned_employees: [],
        status: 'available'
      }]);

      setShowAddSlotModal(false);
      setModalError(null); // Wyczyść błąd modalu
      setSuccessMessage('Slot added successfully');
    } catch (error) {
      console.error('Error adding slot:', error);
      // Użyj modalError dla błędów w procesie dodawania slota, jeśli modal jest otwarty
      if (showAddSlotModal) {
        setModalError('Failed to add slot. Please try again.');
      } else {
        setError('Failed to add slot');
      }
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      // Get the slot to delete
      const slotToDelete = slots.find(slot => slot.id === slotId);
      if (!slotToDelete) {
        setError('Slot not found');
        return;
      }

      // Delete all records for this slot (including all assigned employees)
      const { error } = await supabase
        .from('scheduled_rota')
        .delete()
        .eq('date', slotToDelete.date)
        .eq('shift_type', slotToDelete.shift_type)
        .eq('location', slotToDelete.location)
        .eq('start_time', slotToDelete.start_time)
        .eq('end_time', slotToDelete.end_time);

      if (error) throw error;

      await logSystemActivity(supabase, user, {
        entity_type: 'rota',
        action_type: 'slot_deleted',
        payload: {
          date: slotToDelete.date,
          shift_type: slotToDelete.shift_type,
          location: slotToDelete.location,
          start_time: slotToDelete.start_time,
          end_time: slotToDelete.end_time,
        },
      });

      // Remove slot from UI
      setSlots(prev => prev.filter(slot => 
        !(slot.date === slotToDelete.date && 
          slot.shift_type === slotToDelete.shift_type && 
          slot.location === slotToDelete.location && 
          slot.start_time === slotToDelete.start_time && 
          slot.end_time === slotToDelete.end_time)
      ));
      
      // Ensure all modals are closed and no slot is selected after deletion
      setShowAssignModal(false);
      setShowEditModal(false);
      setSelectedSlot(null);
      setSlotToEdit(null);
      
      // Show success toast
      toast.success('Slot deleted successfully');
    } catch (error) {
      console.error('Error deleting slot:', error);
      setError('Failed to delete slot');
    }
  };

  const handleOpenAssignModal = (slot) => {
    setSelectedSlot(slot);
    setShowAssignModal(true);
  };

  const handleOpenEditModal = (slot) => {
    setSlotToEdit(slot);
    setShowEditModal(true);
  };

  const handleUpdateSlot = async (slotId, updatedData) => {
    try {
      // Sprawdź, czy wybrana lokalizacja jest aktywna
      const isLocationActive = locations.some(loc => loc.name === updatedData.location);
      if (!isLocationActive) {
        setError(`Cannot update slot. Location "${updatedData.location}" is not active.`);
        return;
      }
      
      // Get the slot to update
      const slotToUpdate = slots.find(slot => slot.id === slotId);
      if (!slotToUpdate) {
        setError('Slot not found');
        return;
      }
      
      // Update the base record (the one without user_id or with the first user_id)
      const { error } = await supabase
        .from('scheduled_rota')
        .update({
          location: updatedData.location,
          start_time: updatedData.start_time,
          end_time: updatedData.end_time,
          capacity: updatedData.capacity,
          status: updatedData.status // Dodajemy pole status do aktualizacji
        })
        .eq('id', slotId);

      if (error) throw error;

      await logSystemActivity(supabase, user, {
        entity_type: 'rota',
        action_type: 'slot_updated',
        entity_id: slotId,
        payload: {
          date: slotToUpdate.date,
          shift_type: slotToUpdate.shift_type,
          previous: {
            location: slotToUpdate.location,
            start_time: slotToUpdate.start_time,
            end_time: slotToUpdate.end_time,
            capacity: slotToUpdate.capacity,
            status: slotToUpdate.status,
          },
          new: {
            location: updatedData.location,
            start_time: updatedData.start_time,
            end_time: updatedData.end_time,
            capacity: updatedData.capacity,
            status: updatedData.status,
          },
        },
      });

      // If there are assigned employees, update their records too (unique user_ids only)
      const uniqueAssignedForUpdate = normalizeAssignedEmployeeIds(
        slotToUpdate.assigned_employees
      );
      if (uniqueAssignedForUpdate.length > 0) {
        const firstAssignedId = uniqueAssignedForUpdate[0];
        for (const userId of uniqueAssignedForUpdate) {
          if (userId) {
            // Skip the base record that we already updated above
            if (slotToUpdate.id === slotId && firstAssignedId === userId) {
              continue;
            }

            const { error: empError } = await supabase
              .from('scheduled_rota')
              .update({
                location: updatedData.location,
                start_time: updatedData.start_time,
                end_time: updatedData.end_time
              })
              .eq('date', slotToUpdate.date)
              .eq('shift_type', slotToUpdate.shift_type)
              .eq('user_id', userId);

            if (empError) throw empError;
          }
        }
      }

      // Update local state
      setSlots(prevSlots => {
        return prevSlots.map(slot => {
          if (slot.id === slotId) {
            return {
              ...slot,
              location: updatedData.location,
              start_time: updatedData.start_time,
              end_time: updatedData.end_time,
              capacity: updatedData.capacity,
              status: updatedData.status // Dodajemy pole status do aktualizacji w stanie lokalnym
            };
          }
          return slot;
        });
      });

      setSuccessMessage('Slot updated successfully');
      setError(null);
    } catch (error) {
      console.error('Error updating slot:', error);
      setError('Failed to update slot');
    }
  };

  const handleEmployeeAssignment = async (slotId, employeeId, isAssigning, task) => {
    try {
      // Get the slot details
      const slotToAssign = slots.find(slot => slot.id === slotId);
      if (!slotToAssign) {
        setError('Slot not found');
        return;
      }

      if (isAssigning) {
        // Adding employee to slot
        const uniqueAssigned = normalizeAssignedEmployeeIds(slotToAssign.assigned_employees);
        if (uniqueAssigned.includes(String(employeeId))) {
          setError('This person is already assigned to this slot.');
          return;
        }
        // Check capacity first (unique people per slot)
        if (uniqueAssigned.length >= slotToAssign.capacity) {
          setError('Slot is already at full capacity');
          return;
        }

        const { data: settingsRows, error: settingsFetchError } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', [
            'min_break_between_slots',
            'enforce_max_consecutive_work_days',
            'max_consecutive_work_days',
          ]);

        if (settingsFetchError) {
          console.error('Error fetching rota settings:', settingsFetchError);
        }

        const settingsByKey = Object.fromEntries(
          (settingsRows || []).map((row) => [row.key, row.value])
        );
        const parsedMinBreak = parseInt(settingsByKey.min_break_between_slots, 10);
        const minBreakMinutes = Number.isFinite(parsedMinBreak) ? parsedMinBreak : 60;
        const enforceConsecutiveWorkDays =
          String(settingsByKey.enforce_max_consecutive_work_days || '')
            .toLowerCase()
            .trim() === 'true';
        const maxConsecutiveWorkDays = parseMaxConsecutiveWorkDays(
          settingsByKey.max_consecutive_work_days
        );
        
        if (minBreakMinutes > 0) {
          // Find all slots where this employee is already assigned on this day
          const { data: employeeSlots, error: slotsError } = await supabase
            .from('scheduled_rota')
            .select('start_time, end_time')
            .eq('date', slotToAssign.date)
            .eq('user_id', employeeId);

          if (slotsError) {
            console.error('Error checking employee slots:', slotsError);
            setError('Failed to check existing assignments');
            return;
          }

          // If employee already has assignments, check for break time conflicts
          if (employeeSlots && employeeSlots.length > 0) {
            // Parse slot times to minutes since midnight for easier comparison
            const newSlotStart = timeToMinutes(slotToAssign.start_time);
            const newSlotEnd = timeToMinutes(slotToAssign.end_time);
            
            // Check against each existing slot
            for (const existingSlot of employeeSlots) {
              const existingStart = timeToMinutes(existingSlot.start_time);
              const existingEnd = timeToMinutes(existingSlot.end_time);
              
              // Normalize times for overnight shifts
              const normalizedNewEnd = newSlotEnd < newSlotStart ? newSlotEnd + 1440 : newSlotEnd;
              const normalizedExistingEnd = existingEnd < existingStart ? existingEnd + 1440 : existingEnd;
              
              // Standard overlap check using potentially normalized end times
              // Overlap exists if start of one is before end of other, AND vice-versa
              const overlapDetected = (newSlotStart < normalizedExistingEnd) && (existingStart < normalizedNewEnd);
              
              // If slots overlap, prevent assignment
              if (overlapDetected) {
                console.error(`[AssignCheck] OVERLAP DETECTED between new slot ${slotToAssign.start_time}-${slotToAssign.end_time} and existing ${existingSlot.start_time}-${existingSlot.end_time}`);
                setError(`Cannot assign staff member: Overlapping shifts detected. This person is already assigned to a slot during this time period (${existingSlot.start_time} - ${existingSlot.end_time}).`);
                return;
              }
              
              // --- Break time calculation remains the same, but needs adjustment for normalized times? ---
              // Let's re-evaluate break calculation for robustness, especially with overnight shifts.
              // A simpler approach: Calculate time difference only if slots DON'T overlap.
              
              let breakMinutes = -1; // Default to -1 (no break or overlap)
              
              // Calculate break time IF they don't overlap
              if (newSlotStart >= normalizedExistingEnd) { // New slot starts after existing ends
                breakMinutes = newSlotStart - normalizedExistingEnd;
              } else if (existingStart >= normalizedNewEnd) { // Existing slot starts after new ends
                breakMinutes = existingStart - normalizedNewEnd;
              }

              // Check if the calculated break is too short
              if (breakMinutes !== -1 && breakMinutes < minBreakMinutes) {
                console.error(`[AssignCheck] BREAK CONFLICT DETECTED. Break: ${breakMinutes} mins, Required: ${minBreakMinutes} mins`);
                setError(`Cannot assign staff member: Minimum ${formatMinutesToHours(minBreakMinutes)} time off between shifts is required. Conflict with slot ${existingSlot.start_time}-${existingSlot.end_time}.`);
                return;
              }
            }
          }
        }

        if (enforceConsecutiveWorkDays) {
          const anchor = parseISO(slotToAssign.date);
          const fromDate = format(subDays(anchor, 20), 'yyyy-MM-dd');
          const toDate = format(addDays(anchor, 20), 'yyyy-MM-dd');
          const { data: streakRows, error: streakError } = await supabase
            .from('scheduled_rota')
            .select('date')
            .eq('user_id', employeeId)
            .gte('date', fromDate)
            .lte('date', toDate);

          if (streakError) {
            console.error('Error checking consecutive work days:', streakError);
            setError('Failed to check existing assignments');
            return;
          }

          const distinctDates = [...new Set((streakRows || []).map((r) => r.date))];
          if (
            wouldExceedConsecutiveWorkDays(
              slotToAssign.date,
              distinctDates,
              maxConsecutiveWorkDays
            )
          ) {
            setError(consecutiveWorkDaysBlockedMessage(maxConsecutiveWorkDays));
            return;
          }
        }

        // Insert new assignment record
        const { error } = await supabase
          .from('scheduled_rota')
          .insert({
            date: slotToAssign.date,
            shift_type: slotToAssign.shift_type,
            location: slotToAssign.location,
            start_time: slotToAssign.start_time,
            end_time: slotToAssign.end_time,
            capacity: slotToAssign.capacity,
            user_id: employeeId,
            task: task || null // Include the task if provided
          });

        if (error) throw error;

        await logSystemActivity(supabase, user, {
          entity_type: 'rota',
          action_type: 'employee_assigned',
          payload: {
            date: slotToAssign.date,
            shift_type: slotToAssign.shift_type,
            location: slotToAssign.location,
            start_time: slotToAssign.start_time,
            end_time: slotToAssign.end_time,
            assigned_user_id: employeeId,
            task: task || null,
          },
        });

        // Update UI
        setSlots(prev =>
          prev.map(slot => {
            if (slot.id === slotId) {
              return {
                ...slot,
                assigned_employees: normalizeAssignedEmployeeIds([
                  ...slot.assigned_employees,
                  employeeId,
                ]),
              };
            }
            return slot;
          })
        );
        
        // Show success message
        setSuccessMessage(`Staff member assigned successfully to ${slotToAssign.location} (${slotToAssign.start_time} - ${slotToAssign.end_time})`);
      } else {
        // Removing employee from slot
        const { error } = await supabase
          .from('scheduled_rota')
          .delete()
          .eq('date', slotToAssign.date)
          .eq('shift_type', slotToAssign.shift_type)
          .eq('location', slotToAssign.location)
          .eq('start_time', slotToAssign.start_time)
          .eq('end_time', slotToAssign.end_time)
          .eq('user_id', employeeId);

        if (error) throw error;

        await logSystemActivity(supabase, user, {
          entity_type: 'rota',
          action_type: 'employee_unassigned',
          payload: {
            date: slotToAssign.date,
            shift_type: slotToAssign.shift_type,
            location: slotToAssign.location,
            start_time: slotToAssign.start_time,
            end_time: slotToAssign.end_time,
            unassigned_user_id: employeeId,
          },
        });

        // Update UI
        setSlots(prev =>
          prev.map(slot => {
            if (slot.id === slotId) {
              return {
                ...slot,
                assigned_employees: normalizeAssignedEmployeeIds(
                  slot.assigned_employees.filter((id) => id !== employeeId)
                ),
              };
            }
            return slot;
          })
        );
        
        // Show success message
        setSuccessMessage(`Staff member removed successfully from ${slotToAssign.location} (${slotToAssign.start_time} - ${slotToAssign.end_time})`);
      }
    } catch (error) {
      console.error('Error assigning employee:', error);
      if (isConsecutiveWorkDaysDbError(error)) {
        setError(
          error.message || consecutiveWorkDaysBlockedMessage(6)
        );
        return;
      }
      setError('Failed to update assignment');
    }
  };

  // Helper function to convert time string (HH:MM) to minutes since midnight
  const timeToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to format minutes as hours
  const formatMinutesToHours = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
    }
  };

  const handleTimePickerOpen = (field) => {
    setActiveTimeField(field);
    setShowTimePickerModal(true);
  };

  const handleTimeSelect = (time) => {
    if (timePickerCallback) {
      timePickerCallback(time);
      setTimePickerCallback(null);
    } else if (activeTimeField === 'start') {
      setNewSlot({...newSlot, start_time: time});
    } else if (activeTimeField === 'end') {
      setNewSlot({...newSlot, end_time: time});
    }
    setShowTimePickerModal(false);
  };

  const handleOpenTimePickerForEdit = (field, initialTime, callback) => {
    setActiveTimeField(field);
    setTimePickerCallback(() => callback);
    setShowTimePickerModal(true);
  };

  // Copy from previous week: in Day view copies one day; in Week view copies entire week
  const handleCopyFromPreviousWeek = async () => {
    setLoading(true);
    try {
      const weekStart = getWeekStart(parseISO(currentDate));
      const previousWeekStart = addDays(weekStart, -7);

      if (viewMode === 'day') {
        // Day view: copy one day (same weekday from previous week)
        const currentDateObj = parseISO(currentDate);
        const previousWeekDate = addDays(currentDateObj, -7);
        const previousWeekDateStr = format(previousWeekDate, 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('scheduled_rota')
          .select(`date, shift_type, location, start_time, end_time, capacity, user_id`)
          .eq('date', previousWeekDateStr)
          .eq('location', selectedLocation);

        if (error) throw error;
        if (data.length === 0) {
          setError('No slots found from previous week to copy');
          setLoading(false);
          return;
        }

        const uniqueSlots = new Map();
        data.forEach(slot => {
          const key = `${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;
          if (!uniqueSlots.has(key)) {
            uniqueSlots.set(key, {
              date: currentDate,
              shift_type: slot.shift_type,
              location: slot.location,
              start_time: slot.start_time,
              end_time: slot.end_time,
              capacity: slot.capacity,
              user_id: null
            });
          }
        });

        const { data: existingSlots, error: existingError } = await supabase
          .from('scheduled_rota')
          .select(`shift_type, location, start_time, end_time`)
          .eq('date', currentDate)
          .eq('location', selectedLocation);
        if (existingError) throw existingError;

        const existingKeys = new Set(
          (existingSlots || []).map(s => `${s.shift_type}-${s.location}-${s.start_time}-${s.end_time}`)
        );
        const slotsToAdd = Array.from(uniqueSlots.values()).filter(
          s => !existingKeys.has(`${s.shift_type}-${s.location}-${s.start_time}-${s.end_time}`)
        );

        if (slotsToAdd.length === 0) {
          setError('All slots from the previous week already exist for the selected date');
          setLoading(false);
          return;
        }

        const { data: insertedData, error: insertError } = await supabase
          .from('scheduled_rota')
          .insert(slotsToAdd)
          .select();
        if (insertError) throw insertError;

        await logSystemActivity(supabase, user, {
          entity_type: 'rota',
          action_type: 'slots_copied',
          payload: { target_date: currentDate, source_date: previousWeekDateStr, slots_count: slotsToAdd.length }
        });

        const newSlots = insertedData.map(s => ({
          id: s.id,
          date: s.date,
          shift_type: s.shift_type,
          location: s.location,
          start_time: s.start_time,
          end_time: s.end_time,
          capacity: s.capacity,
          assigned_employees: [],
          status: 'available'
        }));
        setSlots(prev => [...prev, ...newSlots]);
        toast.success(`Copied ${slotsToAdd.length} slot${slotsToAdd.length !== 1 ? 's' : ''} from previous week`);
      } else {
        // Week view: copy entire previous week to current week
        const prevStartStr = format(previousWeekStart, 'yyyy-MM-dd');
        const prevEndStr = format(addDays(previousWeekStart, 6), 'yyyy-MM-dd');

        const { data, error } = await supabase
          .from('scheduled_rota')
          .select(`date, shift_type, location, start_time, end_time, capacity, user_id`)
          .gte('date', prevStartStr)
          .lte('date', prevEndStr)
          .eq('location', selectedLocation);

        if (error) throw error;
        if (!data || data.length === 0) {
          setError('No slots found from previous week to copy');
          setLoading(false);
          return;
        }

        const slotsByTargetDate = {};
        data.forEach(slot => {
          const sourceDate = parseISO(slot.date);
          const dayOffset = Math.round((sourceDate - previousWeekStart) / (24 * 60 * 60 * 1000));
          const targetDateStr = format(addDays(weekStart, dayOffset), 'yyyy-MM-dd');
          const key = `${targetDateStr}-${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;
          if (!slotsByTargetDate[key]) {
            slotsByTargetDate[key] = {
              date: targetDateStr,
              shift_type: slot.shift_type,
              location: slot.location,
              start_time: slot.start_time,
              end_time: slot.end_time,
              capacity: slot.capacity,
              user_id: null
            };
          }
        });

        const slotsToAdd = Object.values(slotsByTargetDate);
        const targetStartStr = format(weekStart, 'yyyy-MM-dd');
        const targetEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

        const { data: existingSlots, error: existingError } = await supabase
          .from('scheduled_rota')
          .select(`date, shift_type, location, start_time, end_time`)
          .gte('date', targetStartStr)
          .lte('date', targetEndStr)
          .eq('location', selectedLocation);
        if (existingError) throw existingError;

        const existingKeys = new Set(
          (existingSlots || []).map(s => `${s.date}-${s.shift_type}-${s.location}-${s.start_time}-${s.end_time}`)
        );
        const filtered = slotsToAdd.filter(
          s => !existingKeys.has(`${s.date}-${s.shift_type}-${s.location}-${s.start_time}-${s.end_time}`)
        );

        if (filtered.length === 0) {
          setError('All slots from the previous week already exist for this week');
          setLoading(false);
          return;
        }

        const { data: insertedData, error: insertError } = await supabase
          .from('scheduled_rota')
          .insert(filtered)
          .select();
        if (insertError) throw insertError;

        await logSystemActivity(supabase, user, {
          entity_type: 'rota',
          action_type: 'slots_copied',
          payload: {
            target_week: targetStartStr,
            source_week: prevStartStr,
            slots_count: filtered.length
          }
        });

        const newSlots = insertedData.map(s => ({
          id: s.id,
          date: s.date,
          shift_type: s.shift_type,
          location: s.location,
          start_time: s.start_time,
          end_time: s.end_time,
          capacity: s.capacity,
          assigned_employees: [],
          status: 'available'
        }));
        setSlots(prev => [...prev, ...newSlots]);
        toast.success(`Copied ${filtered.length} slot${filtered.length !== 1 ? 's' : ''} from previous week`);
      }
    } catch (error) {
      console.error('Error copying slots from previous week:', error);
      setError('Failed to copy slots from previous week');
    } finally {
      setLoading(false);
    }
  };

  // Group slots by shift type
  const slotsByShift = {
    day: slots.filter(slot => slot.shift_type === 'day')
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)),
    afternoon: slots.filter(slot => slot.shift_type === 'afternoon')
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)),
    night: slots.filter(slot => slot.shift_type === 'night')
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
  };

  const goToPreviousDay = () => {
    // Save current scroll position before changing date
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    const currentDateObj = parseISO(currentDate);
    const previousDay = addDays(currentDateObj, -1);
    setCurrentDate(format(previousDay, 'yyyy-MM-dd'));
  };

  const goToNextDay = () => {
    // Save current scroll position before changing date
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    const currentDateObj = parseISO(currentDate);
    const nextDay = addDays(currentDateObj, 1);
    setCurrentDate(format(nextDay, 'yyyy-MM-dd'));
  };

  const goToPreviousWeek = () => {
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    const weekStartDate = getWeekStart(parseISO(currentDate));
    const prevWeekStart = addDays(weekStartDate, -7);
    setCurrentDate(format(prevWeekStart, 'yyyy-MM-dd'));
  };

  const goToCurrentWeek = () => {
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    const weekStartDate = getWeekStart(new Date());
    setCurrentDate(format(weekStartDate, 'yyyy-MM-dd'));
  };

  const goToNextWeek = () => {
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    const weekStartDate = getWeekStart(parseISO(currentDate));
    const nextWeekStart = addDays(weekStartDate, 7);
    setCurrentDate(format(nextWeekStart, 'yyyy-MM-dd'));
  };

  const formatDisplayDate = (dateString) => {
    const dateObj = parseISO(dateString);
    return format(dateObj, 'dd/MM/yyyy');
  };
  
  const getDayName = (dateString) => {
    const dateObj = parseISO(dateString);
    return format(dateObj, 'EEEE'); // Full day name
  };
  
  const getDayShort = (dateString) => {
    const dateObj = parseISO(dateString);
    return format(dateObj, 'EEE'); // Short day name
  };

  const handleLocationTabClick = (location) => {
    // Save current scroll position before changing location
    localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    setSelectedLocation(location);
    localStorage.setItem('selected_rota_location_view', location);
  };

  // Resetowanie błędu modalu przy otwieraniu/zamykaniu
  const openAddSlotForDay = (dateStr) => {
    setCurrentDate(dateStr);
    setModalError(null);
    setNewSlot(prev => ({ ...prev, location: selectedLocation || prev.location }));
    setShowAddSlotModal(true);
  };

  const openAddSlotForShift = (shiftType) => {
    setModalError(null);
    const defaults = {
      day: { start_time: '05:45', end_time: '18:00' },
      afternoon: { start_time: '14:00', end_time: '02:30' },
      night: { start_time: '17:45', end_time: '06:00' }
    };
    const { start_time, end_time } = defaults[shiftType] || defaults.day;
    setNewSlot(prev => ({
      ...prev,
      shift_type: shiftType,
      location: selectedLocation || prev.location,
      start_time,
      end_time
    }));
    setShowAddSlotModal(true);
  };

  const closeAddSlotModal = () => {
    setShowAddSlotModal(false);
    setModalError(null);
  };

  const openTemplateModal = () => {
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
  };

  const handleSaveTemplate = async (templateName) => {
    try {
      // Check if template name already exists
      const { data: existingTemplates, error: checkError } = await supabase
        .from('rota_templates')
        .select('id')
        .eq('name', templateName);
      
      if (checkError) throw checkError;
      
      if (existingTemplates && existingTemplates.length > 0) {
        setModalError('A template with this name already exists. Please choose a different name.');
        return false;
      }
      
      // Prepare slots data for storage (only slots for current date, so week view saves one day)
      const slotsForCurrentDate = slots.filter(s => s.date === currentDate);
      const templateSlots = slotsForCurrentDate.map(slot => ({
        shift_type: slot.shift_type,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        capacity: slot.capacity
      }));
      
      // Save template
      const { error } = await supabase
        .from('rota_templates')
        .insert({
          name: templateName,
          slots: templateSlots,
          created_at: new Date()
        });
      
      if (error) throw error;
      
      await logSystemActivity(supabase, user, {
        entity_type: 'rota',
        action_type: 'template_saved',
        payload: { template_name: templateName, slots_count: templateSlots.length },
      });

      toast.success(`Template "${templateName}" saved successfully`);
      return true;
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
      return false;
    }
  };

  const handleApplyTemplate = async (templateId) => {
    try {
      // Fetch template data
      const { data: template, error: fetchError } = await supabase
        .from('rota_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      
      if (fetchError) throw fetchError;
      
      if (!template || !template.slots || !Array.isArray(template.slots)) {
        toast.error('Invalid template data');
        return false;
      }
      
      // Check for existing slots on the current date
      const { data: existingSlots, error: checkError } = await supabase
        .from('scheduled_rota')
        .select('*')
        .eq('date', currentDate);
      
      if (checkError) throw checkError;
      
      if (existingSlots && existingSlots.length > 0) {
        const confirmation = window.confirm(
          `There are already ${existingSlots.length} slots scheduled for this date. Applying a template will add to these existing slots. Continue?`
        );
        
        if (!confirmation) return false;
      }
      
      // Prepare slots for insertion
      const slotsToInsert = template.slots.map(slot => ({
        date: currentDate,
        shift_type: slot.shift_type,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        capacity: slot.capacity,
        user_id: null,
        status: null
      }));
      
      // Insert slots from template
      const { data: insertedSlots, error: insertError } = await supabase
        .from('scheduled_rota')
        .insert(slotsToInsert)
        .select();
      
      if (insertError) throw insertError;
      
      await logSystemActivity(supabase, user, {
        entity_type: 'rota',
        action_type: 'template_applied',
        payload: { date: currentDate, template_id: templateId, template_name: template.name, slots_count: slotsToInsert.length },
      });

      // Add newly inserted slots to UI
      const newSlots = insertedSlots.map(slot => ({
        id: slot.id,
        date: slot.date,
        shift_type: slot.shift_type,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        capacity: slot.capacity,
        assigned_employees: [],
        status: null
      }));
      
      setSlots(prev => [...prev, ...newSlots]);
      
      toast.success(`Template "${template.name}" applied successfully`);
      return true;
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template');
      return false;
    }
  };

  if (loading && !slots.length) {
    return (
      <div className="space-y-6 animate-pulse bg-gradient-to-br from-rota-page-bg-from via-rota-page-bg-via to-rota-page-bg-to min-h-screen p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-rota-toolbar-border rounded-lg" />
            ))}
          </div>
          <div className="h-10 bg-rota-toolbar-border rounded-lg" />
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-20 bg-rota-toolbar-border rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-rota-toolbar-border rounded-lg" />
          <div className="h-6 w-64 bg-rota-day-other-bg-from rounded" />
          <div className="w-10 h-10 bg-rota-toolbar-border rounded-lg" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="bg-rota-modal-bg rounded-lg border-2 border-rota-modal-border p-3 h-32">
              <div className="h-5 w-8 bg-rota-day-other-bg-from rounded mb-2" />
              <div className="space-y-1">
                <div className="h-3 bg-rota-toolbar-border rounded w-full" />
                <div className="h-3 bg-rota-toolbar-border rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Responsive Toolbar - 3 sekcje */}
      <div className="sticky top-0 z-40 bg-rota-toolbar-bg border-b border-rota-toolbar-border shadow-sm py-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
          {/* LEWA - Location dropdown (mobile: center, desktop: left) */}
          <div className="flex items-center justify-center lg:justify-start">
            <select
              value={selectedLocation || (locations[0]?.name ?? '')}
              onChange={(e) => handleLocationTabClick(e.target.value)}
              className="h-10 min-w-[120px] px-4 text-sm font-semibold rounded-lg border-2 border-rota-input-border bg-rota-modal-bg text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring cursor-pointer"
              aria-label="Select location"
            >
              {locations.map((location) => (
                <option key={location.id} value={location.name}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* ŚRODEK - View dropdown + Date / Week navigation */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
              className="h-10 min-w-[100px] px-4 text-sm font-semibold rounded-lg border-2 border-rota-input-border bg-rota-modal-bg text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring cursor-pointer"
              aria-label="Select view"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>

            {viewMode === 'day' ? (
              <div className="flex items-center h-10 bg-rota-modal-bg rounded-lg border-2 border-rota-input-border shadow-sm">
                <button 
                  onClick={goToPreviousDay}
                  className="h-full px-3 text-rota-text-primary hover:bg-rota-btn-primary-hover-bg transition-colors rounded-l-lg"
                  aria-label="Previous day"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                
                <div className="flex items-center gap-2 px-3 h-full text-sm font-semibold text-rota-text-primary whitespace-nowrap border-x-2 border-rota-input-border">
                  <span>{formatDisplayDate(currentDate)}</span>
                  <span>{getDayShort(currentDate)}</span>
                  <button 
                    onClick={() => document.getElementById('date-select').showPicker()}
                    className="text-rota-text-primary hover:opacity-70 transition-opacity"
                    aria-label="Open calendar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <input
                    id="date-select"
                    type="date"
                    value={currentDate}
                    onChange={handleDateChange}
                    className="sr-only"
                  />
                </div>
                
                <button 
                  onClick={goToNextDay}
                  className="h-full px-3 text-rota-text-primary hover:bg-rota-btn-primary-hover-bg transition-colors rounded-r-lg"
                  aria-label="Next day"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex items-center h-10 bg-rota-modal-bg rounded-lg border-2 border-rota-input-border shadow-sm">
                <button 
                  onClick={goToPreviousWeek}
                  className="h-full px-3 text-rota-text-primary hover:bg-rota-btn-primary-hover-bg transition-colors rounded-l-lg"
                  aria-label="Previous week"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="flex items-center gap-2 px-3 h-full text-sm font-semibold text-rota-text-primary whitespace-nowrap border-x-2 border-rota-input-border min-w-[140px] justify-center">
                  <span>Week {getWeek(parseISO(currentDate), { weekStartsOn: 6 })}</span>
                </div>
                <button 
                  onClick={goToNextWeek}
                  className="h-full px-3 text-rota-text-primary hover:bg-rota-btn-primary-hover-bg transition-colors rounded-r-lg"
                  aria-label="Next week"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
            {viewMode === 'week' && (
              <button
                type="button"
                onClick={goToCurrentWeek}
                className="h-10 px-3 text-sm font-semibold rounded-lg border-2 border-rota-input-border bg-rota-modal-bg text-rota-text-primary hover:bg-rota-btn-primary-hover-bg whitespace-nowrap"
              >
                Current week
              </button>
            )}
          </div>
          
          {/* PRAWA - Akcje (mobile: center, desktop: right) */}
          <div className="flex items-center gap-2 justify-center lg:justify-end">
            <button
              onClick={handleCopyFromPreviousWeek}
              className="h-10 px-3 flex-shrink-0 flex items-center justify-center gap-1.5 rounded-lg bg-rota-modal-bg text-rota-text-primary border-2 border-rota-input-border hover:border-rota-input-focus-border transition-all text-sm font-semibold"
              title="Copy slots from previous week"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
              </svg>
              Copy last week
            </button>
            
            <button
              onClick={openTemplateModal}
              className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-rota-modal-bg text-rota-text-primary border-2 border-rota-input-border hover:border-rota-input-focus-border transition-all"
              title="Templates"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="relative h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-rota-modal-bg text-rota-text-primary border-2 border-rota-input-border hover:border-rota-input-focus-border transition-all">
              <ExportRotaButton
                iconOnly={true}
                weekStart={getWeekStart(currentDate)}
                pendingCount={pendingAdditionalCount}
                onBaselineChanged={() => setBaselineEpoch((n) => n + 1)}
              />
              {pendingAdditionalCount > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-charcoal px-1 text-center text-[10px] leading-4 text-white">
                  {pendingAdditionalCount > 9 ? '9+' : pendingAdditionalCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {viewMode === 'day' ? (
          /* Day view: three columns side by side */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {['day', 'afternoon', 'night'].map((shiftType) => {
              const shiftSlots = slotsByShift[shiftType];
              const title = shiftType.charAt(0).toUpperCase() + shiftType.slice(1) + ' Shift';
              return (
                <div key={shiftType} className="space-y-4 flex flex-col">
                  <h3 className="border-b-2 border-rota-toolbar-border pb-2 text-xl font-semibold capitalize text-rota-text-primary">
                    {title}
                  </h3>
                  {shiftSlots.length === 0 ? (
                    <p className="italic text-rota-text-muted-light">No slots scheduled for this shift</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 items-stretch">
                      {shiftSlots.map(slot => (
                        <SlotCard
                          key={slot.id}
                          slot={slot}
                          sameDaySlots={slots.filter((s) => s.date === slot.date)}
                          handleOpenAssignModal={handleOpenAssignModal}
                          handleDeleteSlot={handleDeleteSlot}
                          handleOpenEditModal={handleOpenEditModal}
                          isAdmin={true}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openAddSlotForShift(shiftType)}
                    className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border-2 border-dashed border-rota-input-border bg-rota-day-other-bg-from text-rota-text-muted hover:bg-rota-btn-primary-hover-bg hover:border-rota-input-focus-border hover:text-rota-text-primary text-sm font-semibold transition-colors"
                    title={`Add slot for ${title}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add slot
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          /* Week view: grid of 7 days, each day one column of slots sorted by start_time */
          <div className="overflow-x-auto pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 md:gap-3 min-w-0 w-max">
            {Array.from({ length: 7 }).map((_, index) => {
              const dateObj = addDays(getWeekStart(parseISO(currentDate)), index);
              const dateStr = format(dateObj, 'yyyy-MM-dd');
              const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
              const slotsForDay = slots
                .filter(s => s.date === dateStr)
                .sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time));
              const shiftCounts = {
                day: slotsForDay.filter(s => s.shift_type === 'day').reduce((sum, s) => sum + countUniqueAssigned(s.assigned_employees), 0),
                afternoon: slotsForDay.filter(s => s.shift_type === 'afternoon').reduce((sum, s) => sum + countUniqueAssigned(s.assigned_employees), 0),
                night: slotsForDay.filter(s => s.shift_type === 'night').reduce((sum, s) => sum + countUniqueAssigned(s.assigned_employees), 0)
              };
              return (
                <div
                  key={dateStr}
                  className={`bg-rota-modal-bg rounded-xl shadow-lg overflow-hidden border-2 min-w-[280px] ${
                    isToday
                      ? 'ring-2 ring-rota-day-today-bg-from border-rota-day-today-bg-from'
                      : 'border-rota-toolbar-border'
                  }`}
                >
                  <div
                    className={`p-4 text-center rounded-t-xl ${
                      isToday
                        ? 'bg-gradient-to-br from-rota-day-today-bg-from to-rota-day-today-bg-to text-rota-day-today-text shadow-md'
                        : 'bg-gradient-to-br from-rota-day-other-bg-from to-rota-day-other-bg-to text-rota-day-other-text'
                    }`}
                  >
                    <div className="text-sm font-medium uppercase tracking-wide opacity-90">
                      {format(dateObj, 'EEE')}
                    </div>
                    <div className="text-xl font-bold mt-1">
                      {format(dateObj, 'do')} {format(dateObj, 'MMM')}
                    </div>
                  </div>
                  <div className="p-2 min-h-[120px] flex flex-col overflow-visible">
                    {slotsForDay.length === 0 ? (
                      <p className="text-center text-rota-text-muted-light text-sm py-4">No slots</p>
                    ) : (
                      <div className="space-y-2 flex flex-col">
                        {slotsForDay.map(slot => (
                          <SlotCard
                            key={slot.id}
                            slot={slot}
                            sameDaySlots={slots.filter((s) => s.date === slot.date)}
                            handleOpenAssignModal={handleOpenAssignModal}
                            handleDeleteSlot={handleDeleteSlot}
                            handleOpenEditModal={handleOpenEditModal}
                            isAdmin={true}
                          />
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openAddSlotForDay(dateStr)}
                      className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border-2 border-dashed border-rota-input-border bg-rota-day-other-bg-from text-rota-text-muted hover:bg-rota-btn-primary-hover-bg hover:border-rota-input-focus-border hover:text-rota-text-primary text-sm font-semibold transition-colors"
                      title="Add slot for this day"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Add slot
                    </button>
                  </div>
                  {(shiftCounts.day > 0 || shiftCounts.afternoon > 0 || shiftCounts.night > 0) && (
                    <div className="p-2 pt-0 flex flex-row flex-wrap items-center justify-center gap-1.5 border-t border-rota-toolbar-border bg-rota-day-other-bg-from">
                      {shiftCounts.day > 0 && (
                        <span className="inline-flex items-center text-xs bg-rota-badge-partial-bg text-rota-badge-partial-text px-1.5 py-0.5 rounded-full border border-rota-badge-partial-border">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                          </svg>
                          {shiftCounts.day}
                        </span>
                      )}
                      {shiftCounts.afternoon > 0 && (
                        <span className="inline-flex items-center text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full border border-orange-300">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                          </svg>
                          {shiftCounts.afternoon}
                        </span>
                      )}
                      {shiftCounts.night > 0 && (
                        <span className="inline-flex items-center text-xs bg-rota-btn-primary-hover-bg text-rota-btn-primary-hover-text px-1.5 py-0.5 rounded-full border border-rota-input-focus-border">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                          </svg>
                          {shiftCounts.night}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Add Slot Modal */}
      {showAddSlotModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-rota-modal-border bg-rota-modal-bg shadow-2xl">
            <div className="flex flex-col gap-5 p-6">
              <h3 className="mb-2 text-xl font-semibold text-rota-text-primary">Add New Slot</h3>

              {modalError && (
                <div className="rounded-lg border border-rota-alert-error-border bg-rota-alert-error-bg p-3">
                  <div className="flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5 flex-shrink-0 text-rota-alert-error-text" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium text-rota-alert-error-text">{modalError}</p>
                      {modalError.includes('already exists') && (
                        <p className="mt-1 text-sm text-rota-alert-error-text">
                          Tip: Look for a slot with the same location and time and adjust its capacity instead of creating a duplicate.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-rota-text-primary">Shift Type</label>
                  <select
                    value={newSlot.shift_type}
                    onChange={(e) => {
                      const shiftType = e.target.value;
                      let startTime = newSlot.start_time;
                      let endTime = newSlot.end_time;

                      if (shiftType === 'day') {
                        startTime = '05:45';
                        endTime = '18:00';
                      } else if (shiftType === 'afternoon') {
                        startTime = '14:00';
                        endTime = '02:30';
                      } else if (shiftType === 'night') {
                        startTime = '17:45';
                        endTime = '06:00';
                      }

                      setNewSlot({
                        ...newSlot,
                        shift_type: shiftType,
                        start_time: startTime,
                        end_time: endTime
                      });
                    }}
                    className="w-full rounded-md border border-rota-input-border bg-rota-modal-bg px-3 py-2 text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring"
                  >
                    <option value="day">Day</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="night">Night</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal">Location</label>
                  <select
                    value={newSlot.location}
                    onChange={(e) => {
                      setNewSlot({ ...newSlot, location: e.target.value });
                      localStorage.setItem('preferred_rota_location', e.target.value);
                    }}
                    className="w-full rounded-md border border-rota-input-border bg-rota-modal-bg px-3 py-2 text-rota-text-primary focus:border-rota-input-focus-border focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring"
                  >
                    {locations.map(location => (
                      <option 
                        key={location.id} 
                        value={location.name}
                      >
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-charcoal">Start Time</label>
                    <button 
                      onClick={() => handleTimePickerOpen('start')}
                      className="flex w-full items-center justify-between rounded-md border border-rota-input-border bg-rota-modal-bg px-3 py-2 text-left text-rota-text-primary transition hover:bg-rota-btn-primary-hover-bg focus:outline-none focus:ring-2 focus:ring-rota-input-focus-ring focus:border-rota-input-focus-border"
                    >
                      <span>{newSlot.start_time}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rota-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-rota-text-primary">End Time</label>
                    <button 
                      onClick={() => handleTimePickerOpen('end')}
                      className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-charcoal transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <span>{newSlot.end_time}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-rota-text-primary">Capacity (Staff needed)</label>
                  <div className="flex w-full items-center overflow-hidden rounded-lg border border-rota-input-border">
                    <button
                      type="button"
                      onClick={() => {
                        if (newSlot.capacity > 1) {
                          setNewSlot({ ...newSlot, capacity: newSlot.capacity - 1 });
                        }
                      }}
                      className="flex flex-1 items-center justify-center bg-rota-day-other-bg-from px-4 py-3 text-rota-text-primary transition hover:bg-rota-btn-primary-hover-bg"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <div className="flex-1 bg-rota-modal-bg py-3 text-center text-lg font-semibold text-rota-text-primary">
                      {newSlot.capacity}
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewSlot({ ...newSlot, capacity: newSlot.capacity + 1 })}
                      className="flex flex-1 items-center justify-center bg-rota-day-other-bg-from px-4 py-3 text-rota-text-primary transition hover:bg-rota-btn-primary-hover-bg"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={closeAddSlotModal}
                  className="rounded-md border-2 border-rota-btn-outline-border px-4 py-2 text-rota-btn-outline-text transition hover:bg-rota-btn-primary-hover-bg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="rounded-md border-2 border-rota-text-primary bg-rota-modal-bg px-4 py-2 text-rota-text-primary transition hover:bg-rota-day-other-bg-from"
                >
                  Add Slot
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Time Picker Modal */}
      {showTimePickerModal && createPortal(
        <TimePicker 
          onClose={() => {
            setShowTimePickerModal(false);
            setTimePickerCallback(null);
          }}
          onSelectTime={handleTimeSelect}
          initialTime={activeTimeField === 'start' ? (slotToEdit ? slotToEdit.start_time : newSlot.start_time) : (slotToEdit ? slotToEdit.end_time : newSlot.end_time)}
        />,
        document.body
      )}

      {/* Assign Employee Modal */}
      {showAssignModal && selectedSlot && createPortal(
        <AssignModal
          slot={selectedSlot}
          onClose={() => setShowAssignModal(false)}
          onAssign={(employeeId, isAssigning, task) => 
            handleEmployeeAssignment(selectedSlot.id, employeeId, isAssigning, task)
          }
        />,
        document.body
      )}

      {/* Edit Slot Modal */}
      {showEditModal && slotToEdit && createPortal(
        <EditSlotModal
          isOpen={showEditModal}
          slot={slotToEdit}
          locations={locations}
          onClose={() => {
            setShowEditModal(false);
            setSlotToEdit(null);
          }}
          onUpdate={handleUpdateSlot}
          onShowTimePicker={handleOpenTimePickerForEdit}
        />,
        document.body
      )}

      {/* Template Modal */}
      {showTemplateModal && createPortal(
        <TemplateModal
          onClose={closeTemplateModal}
          onSaveTemplate={handleSaveTemplate}
          onApplyTemplate={handleApplyTemplate}
          currentDate={currentDate}
        />,
        document.body
      )}
    </div>
  );
};

export default RotaManager; 