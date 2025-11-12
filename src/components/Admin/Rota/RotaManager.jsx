import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import SlotCard from './SlotCard';
import AssignModal from './AssignModal';
import TimePicker from './TimePicker';
import EditSlotModal from './EditSlotModal';
import ExportRotaButton from '../ExportRotaButton';
import TemplateModal from './TemplateModal';
import { createPortal } from 'react-dom';
import { useToast } from '../../ui/ToastContext';

// Add date-fns for date manipulation
import { format, addDays, parseISO } from 'date-fns';

const RotaManager = () => {
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
    return savedLocation || 'all';
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

  // Save current date to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('rota_planner_current_date', currentDate);
  }, [currentDate]);

  // Save scroll position when user scrolls
  useEffect(() => {
    const saveScroll = () => {
      localStorage.setItem('rota_planner_scroll_position', window.scrollY.toString());
    };

    window.addEventListener('scroll', saveScroll);

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
          const selectedLocationValid = 
            selectedLocation === 'all' || 
            data.some(loc => loc.name === selectedLocation);
            
          if (!selectedLocationValid) {
            // Reset to 'all' if the previously selected location is no longer active
            setSelectedLocation('all');
            localStorage.setItem('selected_rota_location_view', 'all');
          }
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        setError('Failed to load locations');
      }
    };

    fetchLocations();
  }, [selectedLocation]);

  // Fetch slots for the current date
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      try {
        // Base query
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
          .eq('date', currentDate);
        
        // Add location filter if a specific location is selected
        if (selectedLocation !== 'all') {
          query = query.eq('location', selectedLocation);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        console.log("[RotaManager] Fetched slots:", data);

        // Group slots by user_id
        const slotsMap = new Map();
        
        data.forEach(slot => {
          const key = `${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;
          
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
        
        setSlots(Array.from(slotsMap.values()));

        // Restore scroll position after slots are loaded
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
  }, [currentDate, selectedLocation]); // Add selectedLocation as dependency

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
    console.log('[RotaManager] handleOpenEditModal called with slot:', slot);
    setSlotToEdit(slot);
    setShowEditModal(true);
    console.log('[RotaManager] showEditModal should be true, slotToEdit set');
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

      // If there are assigned employees, update their records too
      if (slotToUpdate.assigned_employees && slotToUpdate.assigned_employees.length > 0) {
        for (const userId of slotToUpdate.assigned_employees) {
          if (userId) {
            // Skip the base record that we already updated above
            if (slotToUpdate.id === slotId && slotToUpdate.assigned_employees[0] === userId) {
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
        // Check capacity first
        if (slotToAssign.assigned_employees.length >= slotToAssign.capacity) {
          setError('Slot is already at full capacity');
          return;
        }

        // Get minimum break time setting from database
        const { data: settingsData, error: settingsError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'min_break_between_slots')
          .single();

        if (settingsError) {
          console.error('Error fetching minimum break setting:', settingsError);
        }

        const minBreakMinutes = settingsData ? parseInt(settingsData.value, 10) : 60; // Default to 60 minutes if not found
        
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
            console.log(`[AssignCheck] Checking assignment for Employee ${employeeId}, New Slot: ${slotToAssign.start_time}-${slotToAssign.end_time} (${newSlotStart}-${newSlotEnd} mins)`);
            
            // Check against each existing slot
            for (const existingSlot of employeeSlots) {
              const existingStart = timeToMinutes(existingSlot.start_time);
              const existingEnd = timeToMinutes(existingSlot.end_time);
              console.log(`[AssignCheck] Comparing with Existing Slot: ${existingSlot.start_time}-${existingSlot.end_time} (${existingStart}-${existingEnd} mins)`);
              
              // Normalize times for overnight shifts
              const normalizedNewEnd = newSlotEnd < newSlotStart ? newSlotEnd + 1440 : newSlotEnd;
              const normalizedExistingEnd = existingEnd < existingStart ? existingEnd + 1440 : existingEnd;
              
              // Standard overlap check using potentially normalized end times
              // Overlap exists if start of one is before end of other, AND vice-versa
              const overlapDetected = (newSlotStart < normalizedExistingEnd) && (existingStart < normalizedNewEnd);
              console.log(`[AssignCheck] Normalized Times - New: ${newSlotStart}-${normalizedNewEnd}, Existing: ${existingStart}-${normalizedExistingEnd}`);
              console.log(`[AssignCheck] Overlap Check Result: ${overlapDetected}`);
              
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
              
              console.log(`[AssignCheck] Calculated break (if > 0): ${breakMinutes} mins`);

              // Check if the calculated break is too short
              if (breakMinutes !== -1 && breakMinutes < minBreakMinutes) {
                console.error(`[AssignCheck] BREAK CONFLICT DETECTED. Break: ${breakMinutes} mins, Required: ${minBreakMinutes} mins`);
                setError(`Cannot assign staff member: Minimum ${formatMinutesToHours(minBreakMinutes)} time off between shifts is required. Conflict with slot ${existingSlot.start_time}-${existingSlot.end_time}.`);
                return;
              }
            }
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

        // Update UI
        setSlots(prev => 
          prev.map(slot => {
            if (slot.id === slotId) {
              return {
                ...slot,
                assigned_employees: [...slot.assigned_employees, employeeId]
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

        // Update UI
        setSlots(prev => 
          prev.map(slot => {
            if (slot.id === slotId) {
              return {
                ...slot,
                assigned_employees: slot.assigned_employees.filter(id => id !== employeeId)
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

  // Modyfikuję funkcję handleCopyFromPreviousWeek, aby używała nowego komunikatu sukcesu
  const handleCopyFromPreviousWeek = async () => {
    setLoading(true);
    try {
      // Oblicz datę sprzed tygodnia
      const currentDateObj = parseISO(currentDate);
      const previousWeekDate = addDays(currentDateObj, -7);
      const previousWeekDateStr = format(previousWeekDate, 'yyyy-MM-dd');
      
      // Pobierz sloty z poprzedniego tygodnia
      const { data, error } = await supabase
        .from('scheduled_rota')
        .select(`
          date,
          shift_type,
          location,
          start_time,
          end_time,
          capacity,
          user_id
        `)
        .eq('date', previousWeekDateStr);

      if (error) throw error;
      
      if (data.length === 0) {
        setError('No slots found from previous week to copy');
        setLoading(false);
        return;
      }

      // Grupuj sloty według unikalnych identyfikatorów slotu
      const uniqueSlots = new Map();
      
      data.forEach(slot => {
        const key = `${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;
        
        if (!uniqueSlots.has(key)) {
          uniqueSlots.set(key, {
            date: currentDate, // Aktualna data zamiast daty z poprzedniego tygodnia
            shift_type: slot.shift_type,
            location: slot.location,
            start_time: slot.start_time,
            end_time: slot.end_time,
            capacity: slot.capacity,
            user_id: null // Bez przypisanych użytkowników
          });
        }
      });
      
      // Sprawdź, które sloty już istnieją dla bieżącej daty
      const { data: existingSlots, error: existingError } = await supabase
        .from('scheduled_rota')
        .select(`
          shift_type,
          location,
          start_time,
          end_time
        `)
        .eq('date', currentDate);
      
      if (existingError) throw existingError;
      
      // Utwórz mapę istniejących slotów
      const existingSlotKeys = new Set();
      existingSlots.forEach(slot => {
        const key = `${slot.shift_type}-${slot.location}-${slot.start_time}-${slot.end_time}`;
        existingSlotKeys.add(key);
      });
      
      // Odfiltruj sloty, które już istnieją
      const slotsToAdd = [];
      const duplicateSlots = [];
      
      uniqueSlots.forEach((slot, key) => {
        if (existingSlotKeys.has(key)) {
          duplicateSlots.push(slot);
        } else {
          slotsToAdd.push(slot);
        }
      });
      
      // Jeśli wszystkie sloty już istnieją, pokaż odpowiedni komunikat
      if (slotsToAdd.length === 0) {
        setError('All slots from the previous week already exist for the selected date');
        setLoading(false);
        return;
      }
      
      // Wstaw tylko unikalne sloty do bazy danych
      const { data: insertedData, error: insertError } = await supabase
        .from('scheduled_rota')
        .insert(slotsToAdd)
        .select();

      if (insertError) throw insertError;
      
      // Zaktualizuj UI - dodaj nowe sloty do stanu
      const newSlots = insertedData.map(slot => ({
        id: slot.id,
        date: slot.date,
        shift_type: slot.shift_type,
        location: slot.location,
        start_time: slot.start_time,
        end_time: slot.end_time,
        capacity: slot.capacity,
        assigned_employees: [],
        status: 'available'
      }));
      
      setSlots(prev => [...prev, ...newSlots]);
      
      // Zamiast alert(), używam nowego stanu sukcesu
      if (duplicateSlots.length > 0) {
        setSuccessMessage(`Copied ${slotsToAdd.length} slots from previous week. ${duplicateSlots.length} slots were skipped as they already exist.`);
      } else {
        setSuccessMessage(`Successfully copied ${slotsToAdd.length} slots from previous week.`);
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
  const openAddSlotModal = () => {
    setModalError(null);
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
      
      // Prepare slots data for storage
      const templateSlots = slots.map(slot => ({
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
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* Location Tabs - replacing dropdown */}
        <div className="w-full overflow-x-auto">
          <div className="flex min-w-max gap-2 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => handleLocationTabClick('all')}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                selectedLocation === 'all'
                  ? 'bg-black text-white'
                  : 'text-charcoal hover:bg-gray-100'
              }`}
            >
              All Locations
            </button>
            {locations.map(location => (
              <button
                key={location.id}
                onClick={() => handleLocationTabClick(location.name)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  selectedLocation === location.name
                    ? 'bg-black text-white'
                    : 'text-charcoal hover:bg-gray-100'
                }`}
              >
                {location.name}
              </button>
            ))}
          </div>
        </div>
        
        <div className="w-full">
          <div className="relative flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <button 
              onClick={goToPreviousDay}
              className="px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Previous day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="flex flex-1 items-center justify-center px-4 py-3 text-charcoal">
              <div className="flex flex-row items-center gap-2">
                <span>{formatDisplayDate(currentDate)}</span>
                <span className="text-sm text-gray-600">
                  <span className="hidden sm:inline-block">{getDayName(currentDate)}</span>
                  <span className="inline-block sm:hidden">{getDayShort(currentDate)}</span>
                </span>
                <button 
                  onClick={() => document.getElementById('date-select').showPicker()}
                  className="ml-2 text-gray-600 transition-colors hover:text-charcoal focus:outline-none"
                  aria-label="Open calendar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
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
              className="px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Next day"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <button
            onClick={openAddSlotModal}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black/20 sm:w-auto"
            title="Add Slot"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Add Slot</span>
          </button>
          
          <button
            onClick={handleCopyFromPreviousWeek}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-charcoal transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:w-auto"
            title="Copy Last Week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
              <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM15 11h2a1 1 0 110 2h-2v-2z" />
            </svg>
            <span className="text-sm hidden sm:inline">Copy Last Week</span>
            <span className="text-sm inline sm:hidden">Copy</span>
          </button>
          
          <button
            onClick={openTemplateModal}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-charcoal transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:w-auto"
            title="Templates"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            <span className="text-sm hidden sm:inline">Templates</span>
            <span className="text-sm inline sm:hidden">Templates</span>
          </button>
          
          <div className="flex w-full items-center justify-center sm:ml-auto sm:w-auto">
            <ExportRotaButton />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(slotsByShift).map(([shiftType, shiftSlots]) => (
          <div key={shiftType} className="space-y-4">
            <h3 className="border-b border-gray-200 pb-2 text-xl font-semibold capitalize text-charcoal">
              {shiftType} Shift
            </h3>
            
            {shiftSlots.length === 0 ? (
              <p className="italic text-gray-500">No slots scheduled for this shift</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shiftSlots.map(slot => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    handleOpenAssignModal={handleOpenAssignModal}
                    handleDeleteSlot={handleDeleteSlot}
                    handleOpenEditModal={handleOpenEditModal}
                    isAdmin={true}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Slot Modal */}
      {showAddSlotModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex flex-col gap-5 p-6">
              <h3 className="mb-2 text-xl font-semibold text-charcoal">Add New Slot</h3>

              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-5 w-5 flex-shrink-0 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium text-red-700">{modalError}</p>
                      {modalError.includes('already exists') && (
                        <p className="mt-1 text-sm text-red-600">
                          Tip: Look for a slot with the same location and time and adjust its capacity instead of creating a duplicate.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-charcoal">Shift Type</label>
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
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
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
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-charcoal focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
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
                      className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-charcoal transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <span>{newSlot.start_time}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-charcoal">End Time</label>
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
                  <label className="mb-1 block text-sm font-medium text-charcoal">Capacity (Staff needed)</label>
                  <div className="flex w-full items-center overflow-hidden rounded-lg border border-gray-300">
                    <button
                      type="button"
                      onClick={() => {
                        if (newSlot.capacity > 1) {
                          setNewSlot({ ...newSlot, capacity: newSlot.capacity - 1 });
                        }
                      }}
                      className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-3 text-charcoal transition hover:bg-gray-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <div className="flex-1 bg-white py-3 text-center text-lg font-semibold text-charcoal">
                      {newSlot.capacity}
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewSlot({ ...newSlot, capacity: newSlot.capacity + 1 })}
                      className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-3 text-charcoal transition hover:bg-gray-100"
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
                  className="rounded-md border border-gray-300 px-4 py-2 text-charcoal transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddSlot}
                  className="rounded-md bg-black px-4 py-2 text-white transition hover:bg-gray-800"
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