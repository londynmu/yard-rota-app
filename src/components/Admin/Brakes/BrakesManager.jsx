import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient'; // Adjust path if needed
import { logSystemActivity } from '../../../lib/systemActivityLog';
import { useToast } from '../../../components/ui/ToastContext';
import { useAuth } from '../../../lib/AuthContext';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as formatDate, subDays } from 'date-fns';
import html2canvas from 'html2canvas';
import { toLocalYmd } from '../../../utils/operationalDay';
import SlotCard from './SlotCard';
import SlotEditorModal from './SlotEditorModal';

const ALL_LOCATIONS_VALUE = 'all';

// Slots are created by hand per date / shift / hub. These templates are only
// applied when an admin picks "Default template" for an empty day.
const buildTemplate = (startTime, durationMinutes, count, stepMinutes) => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startTotal = startHour * 60 + startMinute;
  const step = stepMinutes ?? durationMinutes;
  return Array.from({ length: count }, (_, index) => {
    const total = (startTotal + index * step) % 1440;
    const hours = String(Math.floor(total / 60)).padStart(2, '0');
    const minutes = String(total % 60).padStart(2, '0');
    return { start_time: `${hours}:${minutes}`, duration_minutes: durationMinutes };
  });
};

const DEFAULT_SLOT_TEMPLATES = {
  Day: [...buildTemplate('09:00', 15, 6), ...buildTemplate('12:00', 45, 6)],
  Afternoon: buildTemplate('18:00', 60, 3),
  Night: buildTemplate('21:00', 60, 6),
};

const SLOT_CAPACITY = 999; // Breaks have no per-slot people limit

const addDaysToYmd = (ymd, delta) => {
  const date = new Date(`${ymd}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return formatDate(date, 'yyyy-MM-dd');
};

const BrakesManager = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(() => {
    const savedDate = localStorage.getItem('brakes_selected_date');
    return savedDate || toLocalYmd();
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
    const today = toLocalYmd();
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

        setLocations(data || []);
      } catch (error) {
        console.error('Error fetching locations:', error);
        toast.error('Failed to load locations');
      }
    };

    loadLocations();
  }, [toast]);

  // Keep the selected hub valid – the default is the first active location from the DB
  useEffect(() => {
    if (!locations.length) return;
    if (locations.some(loc => loc.name === selectedLocation)) return;
    const fallback = locations[0]?.name;
    if (fallback) setSelectedLocation(fallback);
  }, [locations, selectedLocation]);

  // Convert time to minutes for break preference sorting (00:00-05:59 treated as night continuation)
  const timeToMinutes = (timeStr) => {
    const s = (timeStr || '00:00').substring(0, 5);
    const [h, m] = s.split(':').map(Number);
    let min = h * 60 + (m || 0);
    if (min < 360) min += 1440; // 00:00-05:59
    return min;
  };

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

  // Fetch break history for last 30 days to compute preferred break time per user
  useEffect(() => {
    const loadPreferredBreakTimes = async () => {
      if (!selectedShift) return;
      try {
        const fromDate = formatDate(subDays(new Date(), 30), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('scheduled_breaks')
          .select('user_id, break_start_time')
          .gte('date', fromDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .not('user_id', 'is', null);

        if (error) throw error;

        const byUser = {};
        (data || []).forEach((row) => {
          if (!row.user_id) return;
          const min = timeToMinutes(row.break_start_time);
          if (!byUser[row.user_id]) byUser[row.user_id] = [];
          byUser[row.user_id].push(min);
        });

        const avgByUser = {};
        Object.entries(byUser).forEach(([uid, mins]) => {
          const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
          avgByUser[uid] = Math.round(avg);
        });
        setPreferredBreakMinutesByUserId(avgByUser);
      } catch (err) {
        console.error('[BrakesManager] Error loading preferred break times:', err);
        setPreferredBreakMinutesByUserId({});
      }
    };

    loadPreferredBreakTimes();
  }, [selectedShift]);

  const [slotEditor, setSlotEditor] = useState({ open: false, mode: 'create', slot: null });
  const [preferredBreakMinutesByUserId, setPreferredBreakMinutesByUserId] = useState({});
  const [breakSlots, setBreakSlots] = useState([]); // Combined standard and custom slots
  const [scheduledBreaks, setScheduledBreaks] = useState([]); // Staff assignments { id, user_id, slot_id, break_date, user_name, preferred_shift }
  const [availableStaff, setAvailableStaff] = useState([]); // { id, first_name, last_name, preferred_shift, total_break_minutes, etc. }
  const [absentUserIdsForDate, setAbsentUserIdsForDate] = useState(new Set()); // user_ids with attendance (no show/sick/late) for selected date – hide from break slot display
  const [isLoading, setIsLoading] = useState(false);

  // Export breaks - copy as picture to clipboard
  const breaksExportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  // Actions menu (add slot, copy, template, export)
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [actionsMenuPosition, setActionsMenuPosition] = useState({ x: 0, y: 0 });
  const actionsButtonRef = useRef(null);
  const actionsMenuRef = useRef(null);

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

  const getUnsavedFlagKey = useCallback(() => `${getSessionStorageKey()}_dirty`, [getSessionStorageKey]);

  const markAssignmentsDirty = useCallback(() => {
    try {
      sessionStorage.setItem(getUnsavedFlagKey(), 'true');
    } catch (err) {
      // Silent fail - not critical
    }
  }, [getUnsavedFlagKey]);

  const clearAssignmentCache = useCallback(() => {
    try {
      const sessionStorageKey = getSessionStorageKey();
      const dirtyKey = getUnsavedFlagKey();
      sessionStorage.removeItem(sessionStorageKey);
      sessionStorage.removeItem(dirtyKey);
    } catch (err) {
      // Silent fail - not critical
    }
  }, [getSessionStorageKey, getUnsavedFlagKey]);

  const persistAssignmentsToSession = useCallback((assignments) => {
    try {
      const sessionStorageKey = getSessionStorageKey();
      sessionStorage.setItem(sessionStorageKey, JSON.stringify(assignments));
      markAssignmentsDirty();
    } catch (err) {
      console.error('[BrakesManager] Failed to persist assignments to sessionStorage:', err);
    }
  }, [getSessionStorageKey, markAssignmentsDirty]);

  // Export breaks: capture and copy as picture to clipboard (max quality, no loss)
  const captureBreaksCanvas = useCallback(async () => {
    if (!breaksExportRef.current) return null;
    const el = breaksExportRef.current;
    const safeCss = '*,*::before,*::after{color:#374151!important;background-color:#f3f4f6!important;border-color:#d1d5db!important;}';
    const tryIframeCapture = () => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-html2canvas-capture', '1');
      iframe.style.cssText = 'position:fixed;left:-99999px;width:' + el.offsetWidth + 'px;height:' + (el.scrollHeight || el.offsetHeight) + 'px;border:0;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      if (!doc) {
        iframe.remove();
        return null;
      }
      doc.open();
      doc.write('<!DOCTYPE html><html><head><style>' + safeCss + '</style></head><body style="margin:0;background:#f3f4f6;"></body></html>');
      doc.close();
      const body = doc.body;
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[data-html2canvas-ignore]').forEach((n) => n.remove());
      body.appendChild(clone);
      return html2canvas(body, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#f3f4f6',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: body.scrollWidth,
        windowHeight: body.scrollHeight,
      }).finally(() => {
        iframe.remove();
      });
    };
    try {
      return await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#f3f4f6',
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        onclone(_, clonedDoc) {
          if (!clonedDoc?.body) return;
          try {
            if (clonedDoc.head) {
              clonedDoc.head.innerHTML = '';
              const s = clonedDoc.createElement('style');
              s.textContent = safeCss;
              clonedDoc.head.appendChild(s);
            }
            clonedDoc.body?.querySelectorAll('style').forEach((n) => n.remove());
            for (let i = (clonedDoc.styleSheets?.length || 0) - 1; i >= 0; i--) {
              try {
                clonedDoc.styleSheets[i].disabled = true;
              } catch (_) {}
            }
            const elArr = [clonedDoc.documentElement, clonedDoc.body, ...clonedDoc.body.querySelectorAll('*')];
            elArr.forEach((node) => {
              try {
                node.style.setProperty('color', '#374151', 'important');
                node.style.setProperty('background-color', '#f3f4f6', 'important');
                node.style.setProperty('border-color', '#d1d5db', 'important');
              } catch (_) {}
            });
          } catch (_) {}
        },
      });
    } catch (err) {
      if (err?.message && (err.message.includes('oklab') || err.message.includes('oklch') || err.message.includes('unsupported color'))) {
        return await tryIframeCapture();
      }
      throw err;
    }
  }, []);

  const downloadBlobFromCanvas = useCallback((canvas) => {
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'breaks.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      'image/png',
      1
    );
  }, []);

  const handleCopyAsPicture = useCallback(async () => {
    setIsExporting(true);
    let canvas = null;
    try {
      canvas = await captureBreaksCanvas();
      if (!canvas) {
        toast.error('Nothing to copy');
        return;
      }
      const blobPromise = new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Image too large'));
          },
          'image/png',
          1
        );
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast.success('Copied to clipboard – paste in WhatsApp or anywhere');
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('oklab') || msg.includes('oklch') || msg.includes('unsupported color')) {
        toast.error('Could not create image.');
        return;
      }
      if (msg.includes('Image too large')) {
        toast.error('Image too large for this device – try a smaller view');
        downloadBlobFromCanvas(canvas);
        return;
      }
      downloadBlobFromCanvas(canvas);
      toast.error('Clipboard not available – image downloaded instead');
    } finally {
      setIsExporting(false);
    }
  }, [captureBreaksCanvas, downloadBlobFromCanvas, toast]);

  // --- Data Fetching ---
  const fetchBreakData = useCallback(async () => {
    if (!selectedDate || !selectedShift) return;
    setIsLoading(true);

    // Clear previous data except scheduledBreaks if found in session
    setAvailableStaff([]);

    const sessionStorageKey = getSessionStorageKey();
    const unsavedFlagKey = getUnsavedFlagKey();
    const hasUnsavedChanges = sessionStorage.getItem(unsavedFlagKey) === 'true';
    let savedAssignments = hasUnsavedChanges ? sessionStorage.getItem(sessionStorageKey) : null;
    if (!hasUnsavedChanges) {
      clearAssignmentCache();
    }
    const locationFilter = selectedLocation === ALL_LOCATIONS_VALUE ? null : selectedLocation;

    try {
      // Slots are made by hand and stored as definition rows in scheduled_breaks
      // (user_id NULL, std_slot_id NULL). Rows without a location are legacy
      // slots from the time when they were shared across every hub.
      let slotDefinitions = [];
      try {
        const slotsQuery = supabase
          .from('scheduled_breaks')
          .select('id, break_start_time, break_duration_minutes, break_type, capacity, location')
          .eq('date', selectedDate)
          .eq('shift_type', selectedShift.toLowerCase())
          .is('user_id', null)
          .is('std_slot_id', null);

        if (locationFilter) {
          slotsQuery.or(`location.is.null,location.eq.${locationFilter}`);
        }

        const { data, error } = await slotsQuery;
        if (error) throw error;

        slotDefinitions = (data || []).map(slot => ({
          id: slot.id,
          start_time: (slot.break_start_time || '').substring(0, 5),
          duration_minutes: slot.break_duration_minutes,
          capacity: slot.capacity || SLOT_CAPACITY,
          break_type: slot.break_type || 'custom',
          location: slot.location || null,
        }));
      } catch (slotError) {
        console.error('[fetchBreakData] Error fetching break slots:', slotError);
        toast.error('Failed to load break slots');
      }

      const allSlots = sortBreakSlots(slotDefinitions, selectedShift);

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
          setScheduledBreaks(processedScheduled);
        } catch (parseError) {
          console.error("[fetchBreakData] Error parsing sessionStorage assignments:", parseError);
          clearAssignmentCache();
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

          if (locationFilter) {
            scheduledQuery.eq('location', locationFilter);
          }

          const { data: scheduledData, error: scheduledError } = await scheduledQuery;
          
          if (scheduledError) throw scheduledError;

          // Process scheduled data to match to slots (location filter applied after rota map below)
          processedScheduled = scheduledData?.map(record => {
            if (!record.profiles) {
               return null; // Skip assignments without profile data
            }
            // Match on time + duration only: hand-made slots always store
            // break_type 'custom', while older rows still use break1/break2/etc.
            const matchingSlot = allSlots.find(slot => (
              slot.start_time?.substring(0, 5) === record.break_start_time?.substring(0, 5) &&
              slot.duration_minutes === record.break_duration_minutes
            ));
            
            return {
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
          }).filter(Boolean) || [];

        } catch (err) {
           console.error("[fetchBreakData] Error fetching existing assignments from DB:", err);
           // Continue even if assignments fail to load
           processedScheduled = [];
        }
      } // End fetch from DB block

      // Safety net for rows saved before slots were hand-made: an assignment
      // without a matching slot still gets a card, so nobody silently vanishes.
      const knownSlotIds = new Set(allSlots.map(slot => slot.id));
      const virtualSlots = new Map();
      processedScheduled = processedScheduled.map(assignment => {
        if (assignment.slot_id && knownSlotIds.has(assignment.slot_id)) return assignment;

        const startTime = (assignment.slot_data?.start_time || '').substring(0, 5);
        const duration = assignment.slot_data?.duration_minutes;
        if (!startTime || !duration) return assignment;

        const virtualId = `virtual-${startTime}-${duration}`;
        if (!virtualSlots.has(virtualId)) {
          virtualSlots.set(virtualId, {
            id: virtualId,
            start_time: startTime,
            duration_minutes: duration,
            capacity: SLOT_CAPACITY,
            break_type: assignment.slot_data?.break_type || 'custom',
            location: assignment.location || locationFilter || null,
            is_virtual: true,
          });
        }
        return { ...assignment, slot_id: virtualId };
      });

      setBreakSlots(
        virtualSlots.size
          ? sortBreakSlots([...allSlots, ...virtualSlots.values()], selectedShift)
          : allSlots
      );

      // Fetch available staff for the selected date (needs to run regardless of where assignments came from)
      try {
        // Step 1: Get user IDs of staff who are scheduled to work on the selected date
        // Fetch all scheduled shifts for this date (include id for attendance lookup)
        const { data: scheduledShifts, error: scheduledError } = await supabase
          .from('scheduled_rota')
          .select('id, user_id, shift_type, location')
          .eq('date', selectedDate)
          .not('user_id', 'is', null);
          
        if (scheduledError) {
          console.error('[fetchBreakData] Error querying scheduled_rota table:', scheduledError);
          throw scheduledError;
        }
        
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

        setScheduledBreaks(processedScheduled);

        const filteredUserIds = filteredShifts
          .filter(record => {
            if (!record.user_id) return false;
            if (!locationFilter) return true;
            return record.location === locationFilter;
          })
          .map(record => record.user_id);

        // Exclude users marked as absent (no show / sick / late) on this date
        let absentUserIds = new Set();
        const rotaIds = filteredShifts.map(r => r.id).filter(Boolean);
        if (rotaIds.length > 0) {
          const { data: attendanceData } = await supabase
            .from('attendance')
            .select('scheduled_rota_id')
            .in('scheduled_rota_id', rotaIds);
          const absentRotaIds = new Set((attendanceData || []).map(a => a.scheduled_rota_id));
          filteredShifts.forEach(record => {
            if (record.id && absentRotaIds.has(record.id) && record.user_id) {
              absentUserIds.add(record.user_id);
            }
          });
        }
        setAbsentUserIdsForDate(absentUserIds);

        if (!filteredUserIds || filteredUserIds.length === 0) {
          setAvailableStaff([]);
          // We stop here if no one is scheduled for this shift on this date
        } else {
          // Step 2: Get profile details for the scheduled user IDs
          const uniqueUserIds = [...new Set(filteredUserIds)];
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, shift_preference')
            .in('id', uniqueUserIds);
            
          if (profilesError) {
            console.error('[fetchBreakData] Error fetching profiles for scheduled users:', profilesError);
            throw profilesError;
          }
            
          // Step 3: Map profiles to our staff structure (exclude absent users)
          const processedAvailable = profilesData
            .filter(profile => !absentUserIds.has(profile.id))
            .map(profile => {
              return {
                id: profile.id,
                first_name: profile.first_name,
                last_name: profile.last_name,
                preferred_shift: profile.shift_preference || 'Unknown',
                is_available: true, // They are scheduled, so they are "available" for breaks
                location: locationMap.get(profile.id) || null
              };
            });

          setAvailableStaff(processedAvailable); // Set base list
        }
      } catch (err) {
        console.error("[fetchBreakData] Error processing available staff:", err);
        toast.error(`Failed to load available staff: ${err.message}`);
        setAvailableStaff([]); // Ensure it's cleared on error
        setScheduledBreaks(processedScheduled);
      }
    } catch (err) {
      console.error('Error in fetchBreakData:', err);
      toast.error('Failed to load break data: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, selectedShift, selectedLocation, getSessionStorageKey, getUnsavedFlagKey, clearAssignmentCache, toast]);

  // NEW useEffect to calculate break times reactively based on scheduledBreaks and allSlots
  useEffect(() => {
      // Ensure we have the base staff list and slots data before calculating
      if (!availableStaff.some(s => s.total_break_minutes === undefined) || !breakSlots.length) {
        // If break times already exist or slots aren't ready, skip calculation
        // Note: Checking for undefined avoids re-calculating if staff list is already augmented
        return;
      }

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
  const handleSaveAllBreaks = async (silent = false, assignmentsOverride = null) => {
    if (selectedLocation === ALL_LOCATIONS_VALUE) {
      toast.error('Please select a specific location before saving breaks.');
      return;
    }
    
    if (!silent) {
      setIsLoading(true);
    }

    try {
      // Use override when provided (e.g. from handleRemoveStaff) so we save the exact list we just set – avoids stale state
      const sourceAssignments = assignmentsOverride ?? scheduledBreaks;
      // Prepare assignments (records with user_id) - use current state or override
      const assignmentsToInsert = sourceAssignments.map(assignment => {
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
          shift_type: selectedShift.toLowerCase(),
          location: selectedLocation,
          // No capacity or std_slot_id for user assignments
        };
      }).filter(Boolean); // Filter out nulls if a slot wasn't found or data missing

      // --- Database Operations ---
      // The save is a diff, never a wipe-and-rewrite: rows are inserted before
      // anything is deleted, so a rejected insert leaves the schedule intact.
      const { data: existingRaw, error: fetchCurrentError } = await supabase
        .from('scheduled_breaks')
        .select('id, user_id, break_start_time, break_duration_minutes, break_type')
        .eq('date', selectedDate)
        .eq('shift_type', selectedShift.toLowerCase())
        .eq('location', selectedLocation)
        .not('user_id', 'is', null);

      if (fetchCurrentError) {
        console.error("[handleSaveAllBreaks] Error fetching current assignments:", fetchCurrentError);
        throw fetchCurrentError;
      }

      // Identity of an assignment: who, when, how long, what kind.
      const assignmentKey = (row) => [
        row.user_id,
        (row.break_start_time || '').substring(0, 5),
        row.break_duration_minutes,
        row.break_type,
      ].join('|');

      // RLS lets a regular user touch only their own rows, so scope both sides.
      const currentAssignments = isAdmin
        ? (existingRaw || [])
        : (existingRaw || []).filter((r) => r.user_id === currentUser?.id);
      const desiredAssignments = isAdmin
        ? assignmentsToInsert
        : assignmentsToInsert.filter((a) => a.user_id === currentUser?.id);

      const currentKeys = new Set(currentAssignments.map(assignmentKey));
      const desiredKeys = new Set(desiredAssignments.map(assignmentKey));

      const rowsToInsert = [];
      const stagedKeys = new Set(currentKeys);
      for (const assignment of desiredAssignments) {
        const key = assignmentKey(assignment);
        if (stagedKeys.has(key)) continue;
        stagedKeys.add(key);
        rowsToInsert.push(assignment);
      }

      const idsToDelete = currentAssignments
        .filter((r) => !desiredKeys.has(assignmentKey(r)))
        .map((r) => r.id);

      const currentUserIds = new Set(currentAssignments.map((r) => r.user_id));
      const currentByUser = currentAssignments.reduce((acc, r) => {
        if (!acc[r.user_id]) acc[r.user_id] = r;
        return acc;
      }, {});

      // 3. Add the assignments that are missing
      if (rowsToInsert.length > 0) {
        const { error: insertAssignError } = await supabase
          .from('scheduled_breaks')
          .insert(rowsToInsert);

        if (insertAssignError) {
          console.error("[handleSaveAllBreaks] Error inserting assignments:", insertAssignError);
          console.error("Data attempted for assignments:", JSON.stringify(rowsToInsert, null, 2));
          throw insertAssignError; // This is critical, so throw
        }
      }

      // 4. Only once the new rows are safely stored, drop the withdrawn ones
      if (idsToDelete.length > 0) {
        const { error: deleteAssignError } = await supabase
          .from('scheduled_breaks')
          .delete()
          .in('id', idsToDelete);

        if (deleteAssignError) {
          console.error("[handleSaveAllBreaks] Error deleting withdrawn assignments:", deleteAssignError);
          throw deleteAssignError;
        }
      }

      // Log per-person added/removed (same as Rota: Added / Removed with target user)
      const newUserIds = new Set(desiredAssignments.map((a) => a.user_id));
      const addedUserIds = [...newUserIds].filter((id) => !currentUserIds.has(id));
      const removedUserIds = [...currentUserIds].filter((id) => !newUserIds.has(id));
      const insertByUser = desiredAssignments.reduce((acc, a) => {
        if (!acc[a.user_id]) acc[a.user_id] = a;
        return acc;
      }, {});

      const logPromises = [];
      for (const uid of addedUserIds) {
        const a = insertByUser[uid];
        logPromises.push(logSystemActivity(supabase, user, {
          entity_type: 'breaks',
          action_type: 'break_assignment_added',
          payload: {
            date: selectedDate,
            shift_type: selectedShift.toLowerCase(),
            location: selectedLocation === ALL_LOCATIONS_VALUE ? 'all' : selectedLocation,
            assigned_user_id: uid,
            break_start_time: a?.break_start_time,
            break_duration_minutes: a?.break_duration_minutes,
          },
        }));
      }
      for (const uid of removedUserIds) {
        const prev = currentByUser[uid];
        logPromises.push(logSystemActivity(supabase, user, {
          entity_type: 'breaks',
          action_type: 'break_assignment_removed',
          payload: {
            date: selectedDate,
            shift_type: selectedShift.toLowerCase(),
            location: selectedLocation === ALL_LOCATIONS_VALUE ? 'all' : selectedLocation,
            unassigned_user_id: uid,
            break_start_time: prev?.break_start_time,
          },
        }));
      }
      const settled = await Promise.allSettled(logPromises);

      if (!silent) {
        toast.success("Breaks schedule saved successfully!");
      }
      clearAssignmentCache(); // Clear temporary state on successful save
      
      // For silent save, keep current state (optimistic UI update)
      // No need to refetch - data is already up to date locally
      if (!silent) {
        // Only refetch when explicitly saving (with loading spinner)
        fetchBreakData();
      }
      // If silent=true, we keep the current state as-is without refetching
      
    } catch (error) {
      console.error('Error saving all breaks:', error);
      toast.error("Failed to save breaks: " + error.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  // A slot definition row: no user, no legacy std_slot_id, tied to one hub
  const buildSlotRow = (slot) => ({
    user_id: null,
    std_slot_id: null,
    date: selectedDate,
    shift_type: selectedShift.toLowerCase(),
    break_start_time: slot.start_time,
    break_duration_minutes: slot.duration_minutes,
    break_type: 'custom',
    capacity: SLOT_CAPACITY,
    location: selectedLocation,
  });

  const canManageSlots = () => {
    if (!isAdmin) {
      toast.error('Only admins can change break slots.');
      return false;
    }
    if (!selectedLocation || selectedLocation === ALL_LOCATIONS_VALUE) {
      toast.error('Select a specific hub before changing break slots.');
      return false;
    }
    return true;
  };

  // Insert one or many slots at once; duplicates on the same start time are skipped
  const insertSlots = async (slots, { actionType, extraPayload = {}, successMessage }) => {
    const existingTimes = new Set(breakSlots.map(slot => (slot.start_time || '').substring(0, 5)));
    const slotsToAdd = [];
    let skipped = 0;

    slots.forEach(slot => {
      const time = (slot.start_time || '').substring(0, 5);
      if (!time || !slot.duration_minutes || existingTimes.has(time)) {
        skipped += 1;
        return;
      }
      existingTimes.add(time);
      slotsToAdd.push({ start_time: time, duration_minutes: slot.duration_minutes });
    });

    if (slotsToAdd.length === 0) {
      toast.error('Those slots already exist for this shift.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('scheduled_breaks')
        .insert(slotsToAdd.map(buildSlotRow));

      if (error) throw error;

      await logSystemActivity(supabase, user, {
        entity_type: 'breaks',
        action_type: actionType,
        payload: {
          date: selectedDate,
          shift_type: selectedShift.toLowerCase(),
          location: selectedLocation,
          slots_count: slotsToAdd.length,
          ...extraPayload,
        },
      });

      toast.success(
        successMessage
          ? successMessage(slotsToAdd.length, skipped)
          : `Added ${slotsToAdd.length} slot${slotsToAdd.length === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}`
      );
      clearAssignmentCache();
      await fetchBreakData();
      return true;
    } catch (err) {
      console.error('[insertSlots] Failed to add break slots:', err);
      toast.error('Failed to add break slots.');
      return false;
    }
  };

  const handleCreateSlots = async (slots) => {
    if (!canManageSlots()) return false;
    return insertSlots(slots, { actionType: 'breaks_slots_added' });
  };

  const handleUpdateSlot = async (payload) => {
    if (!canManageSlots()) return false;

    const slot = slotEditor.slot;
    if (!slot) return false;

    const newTime = (payload.start_time || '').substring(0, 5);
    const clash = breakSlots.some(
      other => other.id !== slot.id && (other.start_time || '').substring(0, 5) === newTime
    );
    if (clash) {
      toast.error(`A slot starting at ${newTime} already exists.`);
      return false;
    }

    try {
      // Assignments already in the database must follow the slot, otherwise
      // people would be left on a break time that no longer exists.
      const assignmentIds = scheduledBreaks
        .filter(assignment => assignment.slot_id === slot.id)
        .map(assignment => assignment.id)
        .filter(id => id && !String(id).startsWith('temp-'));

      if (slot.is_virtual) {
        const { error } = await supabase
          .from('scheduled_breaks')
          .insert([buildSlotRow({ start_time: newTime, duration_minutes: payload.duration_minutes })]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('scheduled_breaks')
          .update({
            break_start_time: newTime,
            break_duration_minutes: payload.duration_minutes,
            location: selectedLocation,
          })
          .eq('id', slot.id);
        if (error) throw error;
      }

      if (assignmentIds.length > 0) {
        const { error: assignError } = await supabase
          .from('scheduled_breaks')
          .update({
            break_start_time: newTime,
            break_duration_minutes: payload.duration_minutes,
          })
          .in('id', assignmentIds);
        if (assignError) throw assignError;
      }

      await logSystemActivity(supabase, user, {
        entity_type: 'breaks',
        action_type: 'breaks_slot_updated',
        entity_id: slot.is_virtual ? null : slot.id,
        payload: {
          date: selectedDate,
          shift_type: selectedShift.toLowerCase(),
          location: selectedLocation,
          break_start_time: newTime,
          break_duration_minutes: payload.duration_minutes,
        },
      });

      toast.success('Break slot updated.');
      clearAssignmentCache();
      await fetchBreakData();
      return true;
    } catch (err) {
      console.error('[handleUpdateSlot] Failed to update slot:', err);
      toast.error('Failed to update break slot.');
      return false;
    }
  };

  const copySlotsFrom = async (sourceDate, label) => {
    if (!canManageSlots()) return;

    setIsLoading(true);
    try {
      const sourceQuery = supabase
        .from('scheduled_breaks')
        .select('break_start_time, break_duration_minutes, location')
        .eq('date', sourceDate)
        .eq('shift_type', selectedShift.toLowerCase())
        .is('user_id', null)
        .is('std_slot_id', null)
        .or(`location.is.null,location.eq.${selectedLocation}`);

      const { data, error } = await sourceQuery;
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error(`No break slots to copy from ${label}.`);
        return;
      }

      await insertSlots(
        data.map(row => ({
          start_time: (row.break_start_time || '').substring(0, 5),
          duration_minutes: row.break_duration_minutes,
        })),
        {
          actionType: 'breaks_slots_copied',
          extraPayload: { source_date: sourceDate },
          successMessage: (added, skipped) =>
            `Copied ${added} slot${added === 1 ? '' : 's'} from ${label}${skipped ? ` (${skipped} skipped)` : ''}`,
        }
      );
    } catch (err) {
      console.error('[copySlotsFrom] Failed to copy slots:', err);
      toast.error('Failed to copy break slots.');
    } finally {
      setIsLoading(false);
    }
  };

  const applyDefaultTemplate = async () => {
    if (!canManageSlots()) return;

    const template = DEFAULT_SLOT_TEMPLATES[selectedShift] || [];
    if (template.length === 0) {
      toast.error('No default template for this shift.');
      return;
    }

    const slots = [...template];
    // Saturday nights have always started an hour earlier
    try {
      const isSaturday = new Date(`${selectedDate}T00:00:00`).getDay() === 6;
      if (isSaturday && selectedShift.toLowerCase() === 'night') {
        slots.unshift({ start_time: '20:00', duration_minutes: 60 });
      }
    } catch {
      // Ignore unparsable dates and use the plain template
    }

    await insertSlots(slots, {
      actionType: 'breaks_slots_added',
      extraPayload: { source: 'default_template' },
      successMessage: (added, skipped) =>
        `Applied default template – ${added} slot${added === 1 ? '' : 's'} added${skipped ? ` (${skipped} skipped)` : ''}`,
    });
  };

  const handleDeleteSlot = (slot) => {
    if (!canManageSlots()) return;
    setDeleteConfirmSlot(slot);
  };
  
  const confirmDeleteSlot = async () => {
    if (!deleteConfirmSlot) return;

    const slot = deleteConfirmSlot;

    try {
      // Drop the people on the slot first, then the slot definition itself
      const assignmentIds = scheduledBreaks
        .filter(assignment => assignment.slot_id === slot.id)
        .map(assignment => assignment.id)
        .filter(id => id && !String(id).startsWith('temp-'));

      if (assignmentIds.length > 0) {
        const { error: assignError } = await supabase
          .from('scheduled_breaks')
          .delete()
          .in('id', assignmentIds);
        if (assignError) throw assignError;
      }

      if (!slot.is_virtual) {
        const { error } = await supabase
          .from('scheduled_breaks')
          .delete()
          .eq('id', slot.id);
        if (error) throw error;
      }

      await logSystemActivity(supabase, user, {
        entity_type: 'breaks',
        action_type: 'breaks_custom_slot_deleted',
        entity_id: slot.is_virtual ? null : slot.id,
        payload: {
          date: selectedDate,
          shift_type: selectedShift.toLowerCase(),
          slot_id: slot.id,
          break_start_time: slot.start_time,
          break_duration_minutes: slot.duration_minutes,
        },
      });

      toast.success('Break slot deleted.');
      setDeleteConfirmSlot(null);
      clearAssignmentCache();
      await fetchBreakData();
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
    persistAssignmentsToSession(updatedAssignments);
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
  
  const handleRemoveStaff = async (assignment) => {
    // Check if user has permission to remove this assignment
    if (!isAdmin && assignment.user_id !== currentUser?.id) {
      toast.error('You can only remove your own breaks');
      return;
    }

    // Remove assignment from scheduled breaks state
    const updatedAssignments = scheduledBreaks.filter(b => b.id !== assignment.id);
    setScheduledBreaks(updatedAssignments);

    // Save updated assignments to session storage
    persistAssignmentsToSession(updatedAssignments);
    
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
          if (slot.duration_minutes === 15) {
            updatedStaff.has_break_15 = false;
          } else if (slot.duration_minutes === 45) {
            updatedStaff.has_break_45 = false;
          }
          
          return updatedStaff;
        }
        return s;
      })
    );
    
    // Auto-save to server after removal (silent save). Pass updated list so save uses it immediately – no stale state.
    handleSaveAllBreaks(true, updatedAssignments);
  };

  // Staff assignment handlers
  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
    setStaffModalOpen(true);
  };
  
  // Helper to get assigned staff for a slot
  const getAssignedStaffForSlot = (slotId) => {
    return scheduledBreaks.filter(assignment => {
      if (assignment.slot_id !== slotId) return false;
      if (absentUserIdsForDate.has(assignment.user_id)) return false;
      // If viewing all locations, show all
      if (selectedLocation === ALL_LOCATIONS_VALUE) return true;
      // Prefer assignment.location; fall back to rota-derived staff location
      const staff = availableStaff.find(s => s.id === assignment.user_id);
      const resolvedLocation = assignment.location || staff?.location || null;
      return resolvedLocation === selectedLocation;
    });
  };

  const openCreateSlots = () => setSlotEditor({ open: true, mode: 'create', slot: null });
  const openEditSlot = (slot) => setSlotEditor({ open: true, mode: 'edit', slot });
  const closeSlotEditor = () => setSlotEditor({ open: false, mode: 'create', slot: null });

  const ACTIONS_MENU_WIDTH = 208; // w-52

  const handleActionsButtonClick = () => {
    if (showActionsMenu) {
      setShowActionsMenu(false);
      return;
    }
    const rect = actionsButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - ACTIONS_MENU_WIDTH - margin);
    const left = Math.min(Math.max(margin, rect.right - ACTIONS_MENU_WIDTH), maxLeft);
    setActionsMenuPosition({ x: left, y: rect.bottom + 6 });
    setShowActionsMenu(true);
  };

  const runAction = (action) => {
    setShowActionsMenu(false);
    action();
  };

  useEffect(() => {
    if (!showActionsMenu) return undefined;

    const handlePointerDown = (event) => {
      if (actionsMenuRef.current?.contains(event.target)) return;
      if (actionsButtonRef.current?.contains(event.target)) return;
      setShowActionsMenu(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowActionsMenu(false);
    };
    const closeMenu = () => setShowActionsMenu(false);

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [showActionsMenu]);

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
    <div className="bg-offwhite text-charcoal min-h-screen pb-4 md:pb-20">

      {/* Modals for pickers */}
      {showDateModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Select Date</h3>
              <button onClick={() => setShowDateModal(false)} className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors">
                Done
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Select Location</h3>
              <button onClick={() => setShowLocationModal(false)} className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors">
                Done
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => { setSelectedLocation(loc.name); setShowLocationModal(false); }}
                  className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                    selectedLocation === loc.name
                      ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                      : 'text-charcoal hover:bg-gray-100 border-gray-300'
                  }`}
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-xl border-2 border-gray-400 shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-white">Select Shift</h3>
              <button onClick={() => setShowShiftModal(false)} className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors">
                Done
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {['Day','Afternoon','Night'].map(shift => (
                <button
                  key={shift}
                  onClick={() => { setSelectedShift(shift); setShowShiftModal(false); }}
                  className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                    selectedShift === shift
                      ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                      : 'text-charcoal hover:bg-gray-100 border-gray-300'
                  }`}
                >
                  {shift}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Break slots */}
      <div ref={breaksExportRef} className="px-4 pt-2 pb-4 md:px-6 md:pt-2 md:pb-2">
        {/* Compact filter bar: date | hub | shift | actions */}
        <div className="filter-bar-segmented filter-bar-segmented-desktop-full mb-3">
          <button
            type="button"
            onClick={() => { setShowDateModal(true); setShowLocationModal(false); setShowShiftModal(false); }}
            className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-white/90 px-1.5 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300/70 hover:text-charcoal hover:shadow-sm sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500 shadow-sm sm:h-2.5 sm:w-2.5" />
            <span className="min-w-0 truncate text-[10px] tabular-nums sm:text-xs">
              {selectedDate ? formatDate(new Date(`${selectedDate}T00:00:00`), 'dd/MM') : 'Date'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setShowLocationModal(true); setShowDateModal(false); setShowShiftModal(false); }}
            disabled={locations.length === 0}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-xs font-medium transition-all sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm ${
              locations.length === 0
                ? 'cursor-not-allowed text-slate-300'
                : 'border border-slate-200/60 bg-white/90 text-slate-700 hover:border-slate-300/70 hover:text-charcoal hover:shadow-sm'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${locations.length === 0 ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm'}`} />
            <span className="min-w-0 truncate text-left text-[10px] sm:text-xs">{selectedLocation || 'No hubs'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setShowShiftModal(true); setShowDateModal(false); setShowLocationModal(false); }}
            className="flex min-w-0 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-white/90 px-1.5 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300/70 hover:text-charcoal hover:shadow-sm sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500 shadow-sm sm:h-2.5 sm:w-2.5" />
            <span className="min-w-0 truncate text-[10px] sm:text-xs">{selectedShift}</span>
          </button>

          <div data-html2canvas-ignore className="min-w-0">
            <button
              ref={actionsButtonRef}
              type="button"
              onClick={handleActionsButtonClick}
              disabled={isLoading || isExporting}
              aria-haspopup="menu"
              aria-expanded={showActionsMenu}
              className="flex w-full min-w-0 items-center justify-center gap-1 rounded-xl border border-slate-200/60 bg-white/90 px-1.5 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300/70 hover:text-charcoal hover:shadow-sm disabled:opacity-60 sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="min-w-0 truncate text-[10px] sm:text-xs">{isExporting ? '…' : 'Actions'}</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid animate-pulse grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 h-4 w-24 rounded bg-slate-200" />
                <div className="h-6 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : breakSlots.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-charcoal">No break slots for this shift yet.</p>
            {isAdmin ? (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Add them by hand, or copy a day you have already planned.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2" data-html2canvas-ignore>
                  <button type="button" onClick={openCreateSlots} className="btn-primary">Add slots</button>
                  <button
                    type="button"
                    onClick={() => copySlotsFrom(addDaysToYmd(selectedDate, -1), 'the previous day')}
                    className="btn-secondary"
                  >
                    Copy previous day
                  </button>
                  <button
                    type="button"
                    onClick={() => copySlotsFrom(addDaysToYmd(selectedDate, -7), 'last week')}
                    className="btn-secondary"
                  >
                    Copy last week
                  </button>
                  <button type="button" onClick={applyDefaultTemplate} className="btn-secondary">
                    Default template
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Ask a manager to set up break slots for this shift.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {breakSlots.map(slot => (
              <SlotCard
                key={slot.id}
                slot={slot}
                assignedStaff={getAssignedStaffForSlot(slot.id)}
                onSlotClick={handleSlotClick}
                onEditClick={openEditSlot}
                onDeleteClick={handleDeleteSlot}
                onRemoveStaffClick={handleRemoveStaff}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions menu (portal) */}
      {showActionsMenu && createPortal(
        <div
          ref={actionsMenuRef}
          className="fixed z-[99998] w-52 overflow-hidden rounded-xl border border-gray-300 bg-white py-1 shadow-lg"
          style={{ left: actionsMenuPosition.x, top: actionsMenuPosition.y }}
          role="menu"
          aria-label="Break actions"
          tabIndex={-1}
        >
          {isAdmin && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(openCreateSlots)}
                className="w-full px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
              >
                Add slots
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => copySlotsFrom(addDaysToYmd(selectedDate, -1), 'the previous day'))}
                className="w-full px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
              >
                Copy previous day
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(() => copySlotsFrom(addDaysToYmd(selectedDate, -7), 'last week'))}
                className="w-full px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
              >
                Copy last week
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(applyDefaultTemplate)}
                className="w-full px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
              >
                Default template
              </button>
              <div className="my-1 border-t border-gray-200" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(handleCopyAsPicture)}
            className="w-full px-3 py-2 text-left text-sm font-medium text-charcoal transition-colors hover:bg-gray-100"
          >
            Copy as picture
          </button>
        </div>,
        document.body
      )}

      {/* Modals */}
      {staffModalOpen && selectedSlot && (
        <StaffSelectionModal 
          isOpen={staffModalOpen}
          onClose={() => setStaffModalOpen(false)}
          slot={selectedSlot}
          availableStaff={isAdmin ? availableStaff : (availableStaff.filter(s => s.id === currentUser?.id) ?? [])}
          assignedStaff={getAssignedStaffForSlot(selectedSlot.id)}
          onAssignStaff={handleAssignStaff}
          onRemoveStaff={handleRemoveStaff}
          currentLocation={selectedLocation}
          isAllLocation={selectedLocation === ALL_LOCATIONS_VALUE}
          onSave={handleSaveAllBreaks}
          preferredBreakMinutesByUserId={preferredBreakMinutesByUserId}
          timeToMinutes={timeToMinutes}
        />
      )}
      
      {slotEditor.open && (
        <SlotEditorModal
          isOpen={slotEditor.open}
          onClose={closeSlotEditor}
          mode={slotEditor.mode}
          initialSlot={slotEditor.slot}
          selectedShift={selectedShift}
          onSubmit={slotEditor.mode === 'edit' ? handleUpdateSlot : handleCreateSlots}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmSlot && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
          <div className="bg-white rounded-3xl md:rounded-2xl shadow-2xl border-2 border-gray-400 w-full max-w-sm overflow-hidden">
            <div className="sticky top-0 bg-black px-5 py-4 border-b border-gray-900 z-10">
              <h3 className="text-lg font-bold text-white">Delete Break Slot?</h3>
            </div>
            <div className="p-5">
              <p className="text-base text-charcoal mb-5">
                Are you sure you want to delete slot at <strong className="text-orange-600">{deleteConfirmSlot.start_time}</strong> ({deleteConfirmSlot.duration_minutes} min)?
                {getAssignedStaffForSlot(deleteConfirmSlot.id).length > 0 && (
                  <span className="mt-2 block text-sm text-red-600">
                    Anyone assigned to this slot will lose their break.
                  </span>
                )}
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
// eslint-disable-next-line no-unused-vars
const StaffSelectionModal = ({ isOpen, onClose, slot, availableStaff, assignedStaff, onAssignStaff, onRemoveStaff, currentLocation, isAllLocation, onSave, preferredBreakMinutesByUserId = {}, timeToMinutes }) => {
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
  
  // Removed debug useEffect
  
  // Filter staff that are eligible for this slot - restore proper filtering
  const eligibleStaffRaw = availableStaff.filter(staff => {
    if (!staff) return false;
    
    // Check if staff is already assigned to THIS slot
    if (assignedStaff.some(assigned => assigned.user_id === staff.id)) {
        return false; // Already assigned here
    }
    
    // Day shift keeps the one 15 min + one 45 min rule; the flags are only set for day
    if (slot.duration_minutes === 15) {
      return staff.has_break_15 !== true; // Allow undefined or false
    } else if (slot.duration_minutes === 45) {
      return staff.has_break_45 !== true; // Allow undefined or false
    } else {
      // For other breaks (Night, Afternoon), staff can have only 60 min total
      // Calculate remaining break time they can take
      const totalBreakMinutes = staff.total_break_minutes || 0; // Handle undefined
      const remainingMinutes = 60 - totalBreakMinutes;
      return remainingMinutes >= slot.duration_minutes;
    }
  });

  // Sort by preferred break time (avg from last 30 days) - closer to slot time first
  const eligibleStaff = (() => {
    if (!timeToMinutes || typeof preferredBreakMinutesByUserId !== 'object') return eligibleStaffRaw;
    const slotMin = timeToMinutes(slot.start_time);
    return [...eligibleStaffRaw].sort((a, b) => {
      const prefA = preferredBreakMinutesByUserId[a.id] ?? 9999;
      const prefB = preferredBreakMinutesByUserId[b.id] ?? 9999;
      return Math.abs(prefA - slotMin) - Math.abs(prefB - slotMin);
    });
  })();
  
  // Check if we have no staff after filtering
  // Removed debug useEffect
  
  if (!isOpen) return null;
  
  // Use createPortal to render the modal in the document body
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3">
      <div 
        ref={modalRef}
        className="relative bg-white text-charcoal rounded-3xl md:rounded-lg shadow-xl border-2 border-gray-400 w-full max-w-md lg:max-w-5xl max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header - Sticky */}
        <div className="sticky top-0 bg-black px-3 py-3 md:px-5 md:py-4 border-b border-gray-900 flex-shrink-0 z-10">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <span className="font-bold text-white text-xl md:text-2xl">{slot.start_time} - {
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
              <span className="text-gray-400 text-lg">•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold bg-gray-200 text-charcoal border-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {assignedStaff.length}
              </span>
            </div>
            <button 
              onClick={() => {
                if (!isAllLocation) {
                  // Save silently in background without blocking modal close
                  onSave(true); // Pass silent=true
                }
                // Close modal immediately
                onClose();
              }}
              disabled={isAllLocation}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex-shrink-0 ${
                isAllLocation 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-white text-black hover:bg-gray-100'
              }`}
              title={isAllLocation ? 'Select a specific location to save changes' : 'Save and close'}
            >
              Done
            </button>
          </div>
        </div>
        
        {/* Content - Scrollable */}
        <div className="overflow-y-auto flex-1">
        
        {isAllLocation && (
          <div className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 md:mx-4">
            <strong>Read-only mode:</strong> Select a specific location tab to assign staff and save changes.
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
        </div>
      </div>
    </div>,
    document.body
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
    capacity: PropTypes.number,
    break_type: PropTypes.string,
    is_virtual: PropTypes.bool
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
  isAllLocation: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  preferredBreakMinutesByUserId: PropTypes.object,
  timeToMinutes: PropTypes.func
};

export default BrakesManager;
