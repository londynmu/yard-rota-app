import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient'; // Adjust path if needed
import { logSystemActivity } from '../../../lib/systemActivityLog';
import { useToast } from '../../../components/ui/ToastContext';
import { useAuth } from '../../../lib/AuthContext';
import { format as formatDate, addDays, subDays } from 'date-fns';
import { getSuggestedBreakContext, resolveBreakManagerContext } from '../../../utils/operationalDay';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { safeLocalStorage, safeSessionStorage } from '../../../utils/safeStorage';
import { useIsDesktop } from '../../../hooks/useIsDesktop';
import { fetchTmBreakBoards, TM_BREAK_SHIFTS } from '../../../utils/tmBreakBoardFetch';
import {
  fetchActiveLocationsCached,
  fetchProfilesByIdsCached,
  fetchPreferredBreakMinutesCached,
  singleFlightBreakData,
} from '../../../utils/breaksLoadCache';
// Placeholder for helper components, will create later
// import SlotCard from './SlotCard';
// import StaffSelectionModal from './StaffSelectionModal';
// import EditSlotModal from './EditSlotModal';
// import AddCustomSlotForm from './AddCustomSlotForm';

const ALL_LOCATIONS_VALUE = 'all';

/** Read saved Manage Breaks date/shift and correct stale Night+yesterday in the day window. */
function readInitialBreakContext() {
  const savedDate = safeLocalStorage.getItem('brakes_selected_date');
  const savedShift = safeLocalStorage.getItem('brakes_selected_shift');
  const resolved = resolveBreakManagerContext(savedDate, savedShift);
  if (resolved.date !== savedDate) {
    safeLocalStorage.setItem('brakes_selected_date', resolved.date);
  }
  if (resolved.shift !== savedShift) {
    safeLocalStorage.setItem('brakes_selected_shift', resolved.shift);
  }
  return resolved;
}

const BrakesManager = ({ readOnly = false }) => {
  const { user, sessionProfile } = useAuth();
  const toast = useToast();
  const isDesktop = useIsDesktop();
  const [toolbarHost, setToolbarHost] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useLayoutEffect(() => {
    if (!isDesktop) {
      setToolbarHost(null);
      return undefined;
    }
    setToolbarHost(document.getElementById('breaks-desktop-toolbar'));
    return undefined;
  }, [isDesktop]);

  // Date initializer corrects stale LS first; shift reads the resolved value.
  const [selectedDate, setSelectedDate] = useState(() => readInitialBreakContext().date);
  const [selectedShift, setSelectedShift] = useState(
    () => safeLocalStorage.getItem('brakes_selected_shift') || 'Day'
  );
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(() => {
    if (readOnly) {
      // TM Breaks: never use "all"; default Rugby (MyRota-style).
      const tmLoc = safeLocalStorage.getItem('tm_dashboard_location');
      if (tmLoc && tmLoc !== ALL_LOCATIONS_VALUE) return tmLoc;
      return 'Rugby';
    }
    const savedLocation = safeLocalStorage.getItem('brakes_selected_location');
    return savedLocation || ALL_LOCATIONS_VALUE;
  });
  /** TM read-only: day → afternoon → night boards (no shift picker). */
  const [tmBoards, setTmBoards] = useState([]);

  // Prefer shared session profile; fall back to a single profiles fetch.
  useEffect(() => {
    if (!user) {
      setCurrentUser(null);
      setIsAdmin(false);
      return undefined;
    }

    if (sessionProfile) {
      setCurrentUser({
        id: user.id,
        first_name: sessionProfile.first_name,
        last_name: sessionProfile.last_name,
        role: sessionProfile.role,
      });
      setIsAdmin(sessionProfile.role === 'admin');
      return undefined;
    }

    let cancelled = false;
    const checkUserRole = async () => {
      try {
        const { data: userProfile, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, role')
          .eq('id', user.id)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setCurrentUser(userProfile);
        setIsAdmin(userProfile.role === 'admin');
      } catch (error) {
        console.error('Error checking user role:', error);
        if (!cancelled) {
          setCurrentUser(null);
          setIsAdmin(false);
        }
      }
    };
    checkUserRole();
    return () => { cancelled = true; };
  }, [user, sessionProfile]);

  // Correct stale date/shift for the active window (e.g. Night+yesterday at 14:00 → Day+today)
  useEffect(() => {
    const savedDate = safeLocalStorage.getItem('brakes_selected_date');
    const savedShift = safeLocalStorage.getItem('brakes_selected_shift');
    const resolved = resolveBreakManagerContext(savedDate, savedShift);

    if (resolved.date !== savedDate || resolved.shift !== savedShift) {
      setSelectedDate(resolved.date);
      setSelectedShift(resolved.shift);
      safeLocalStorage.setItem('brakes_selected_date', resolved.date);
      safeLocalStorage.setItem('brakes_selected_shift', resolved.shift);
    }

    safeLocalStorage.setItem('brakes_last_visited', Date.now().toString());
  }, []); // Run only once when component mounts

  // Fetch active locations once (cached); do not re-run when selectedLocation changes.
  useEffect(() => {
    let cancelled = false;
    const loadLocations = async () => {
      try {
        const fetchedLocations = await fetchActiveLocationsCached(async () => {
          const { data, error } = await supabase
            .from('locations')
            .select('id, name')
            .eq('is_active', true)
            .order('name');
          if (error) throw error;
          return data || [];
        });
        if (cancelled) return;
        setLocations(fetchedLocations);

        const tmPreferred = readOnly ? safeLocalStorage.getItem('tm_dashboard_location') : null;
        setSelectedLocation((prev) => {
          const preferred =
            (tmPreferred && fetchedLocations.some((loc) => loc.name === tmPreferred) && tmPreferred) ||
            (prev && prev !== ALL_LOCATIONS_VALUE && fetchedLocations.some((loc) => loc.name === prev) && prev) ||
            null;
          if (preferred) {
            if (readOnly && preferred !== ALL_LOCATIONS_VALUE) {
              safeLocalStorage.setItem('tm_dashboard_location', preferred);
            }
            return preferred;
          }
          const defaultLoc = fetchedLocations.find((l) => l.name === 'Rugby')?.name || fetchedLocations[0]?.name || prev;
          if (defaultLoc && defaultLoc !== ALL_LOCATIONS_VALUE) {
            if (readOnly) {
              safeLocalStorage.setItem('tm_dashboard_location', defaultLoc);
            } else {
              safeLocalStorage.setItem('brakes_selected_location', defaultLoc);
            }
          }
          return defaultLoc;
        });
      } catch (error) {
        console.error('Error fetching locations:', error);
        if (!cancelled) toast.error('Failed to load locations');
      }
    };

    loadLocations();
    return () => { cancelled = true; };
  }, [toast, readOnly]);

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

  const [addSlotModalOpen, setAddSlotModalOpen] = useState(false);
  const [preferredBreakMinutesByUserId, setPreferredBreakMinutesByUserId] = useState({});
  const [breakSlots, setBreakSlots] = useState([]); // Combined standard and custom slots
  const [scheduledBreaks, setScheduledBreaks] = useState([]); // Staff assignments { id, user_id, slot_id, break_date, user_name, preferred_shift }
  const [availableStaff, setAvailableStaff] = useState([]); // { id, first_name, last_name, preferred_shift, total_break_minutes, etc. }
  const [absentUserIdsForDate, setAbsentUserIdsForDate] = useState(new Set()); // user_ids with attendance (no show/sick/late) for selected date – hide from break slot display
  const [isLoading, setIsLoading] = useState(false);
  
  // Ref to track locally added custom slots (not yet saved to DB)
  const localCustomSlotsRef = useRef([]);

  // Export breaks - copy as picture to clipboard
  const breaksExportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  // Modal state
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  // Preferred break times are only needed in the assign modal — do not block page open.
  useEffect(() => {
    if (!staffModalOpen || readOnly || !selectedShift) return undefined;
    let cancelled = false;
    const loadPreferredBreakTimes = async () => {
      try {
        const avgByUser = await fetchPreferredBreakMinutesCached(selectedShift, async () => {
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
          const next = {};
          Object.entries(byUser).forEach(([uid, mins]) => {
            next[uid] = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
          });
          return next;
        });
        if (!cancelled) setPreferredBreakMinutesByUserId(avgByUser);
      } catch (err) {
        console.error('[BrakesManager] Error loading preferred break times:', err);
        if (!cancelled) setPreferredBreakMinutesByUserId({});
      }
    };
    loadPreferredBreakTimes();
    return () => { cancelled = true; };
  }, [staffModalOpen, selectedShift, readOnly]);

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [deleteConfirmSlot, setDeleteConfirmSlot] = useState(null); // Slot pending deletion
  const [removeConfirmAssignment, setRemoveConfirmAssignment] = useState(null); // Staff pending removal

  // UI: unified header badge pickers
  const [showDateModal, setShowDateModal] = useState(false);
  const [DatePickerComp, setDatePickerComp] = useState(null);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [locationMenuPos, setLocationMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const locationTriggerRef = useRef(null);
  const locationMenuRef = useRef(null);
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
      safeSessionStorage.setItem(getUnsavedFlagKey(), 'true');
    } catch (err) {
      // Silent fail - not critical
    }
  }, [getUnsavedFlagKey]);

  const clearAssignmentCache = useCallback(() => {
    try {
      const sessionStorageKey = getSessionStorageKey();
      const dirtyKey = getUnsavedFlagKey();
      safeSessionStorage.removeItem(sessionStorageKey);
      safeSessionStorage.removeItem(dirtyKey);
    } catch (err) {
      // Silent fail - not critical
    }
  }, [getSessionStorageKey, getUnsavedFlagKey]);

  const persistAssignmentsToSession = useCallback((assignments) => {
    try {
      const sessionStorageKey = getSessionStorageKey();
      safeSessionStorage.setItem(sessionStorageKey, JSON.stringify(assignments));
      markAssignmentsDirty();
    } catch (err) {
      console.error('[BrakesManager] Failed to persist assignments to sessionStorage:', err);
    }
  }, [getSessionStorageKey, markAssignmentsDirty]);

  // Export breaks: capture and copy as picture to clipboard (max quality, no loss)
  const captureBreaksCanvas = useCallback(async () => {
    if (!breaksExportRef.current) return null;
    const { default: html2canvas } = await import('html2canvas');
    const el = breaksExportRef.current;
    const safeCss = '*,*::before,*::after{color:#374151!important;background-color:#f3f4f6!important;border-color:#d1d5db!important;}';
    const exportDateLabel = selectedDate
      ? formatDate(new Date(`${selectedDate}T00:00:00`), 'EEEE d MMMM yyyy')
      : 'Date not selected';
    const exportLocationLabel =
      selectedLocation && selectedLocation !== ALL_LOCATIONS_VALUE
        ? selectedLocation
        : 'All locations';
    const exportHeadingText = `${exportDateLabel} · ${exportLocationLabel} · ${selectedShift}`;

    // Draw the date header onto the finished canvas. DOM injection in html2canvas
    // onclone was unreliable (header never appeared in the copied image).
    const withExportHeading = (sourceCanvas) => {
      if (!sourceCanvas) return null;
      const scale = 2;
      const padX = 16 * scale;
      const padTop = 14 * scale;
      const padBottom = 18 * scale;
      const fontSize = 20 * scale;
      const headerHeight = padTop + fontSize + padBottom;
      const out = document.createElement('canvas');
      out.width = sourceCanvas.width;
      out.height = sourceCanvas.height + headerHeight;
      const ctx = out.getContext('2d');
      if (!ctx) return sourceCanvas;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.fillStyle = '#111827';
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(exportHeadingText, padX, padTop, out.width - padX * 2);
      ctx.drawImage(sourceCanvas, 0, headerHeight);
      return out;
    };

    const tryIframeCapture = async () => {
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
      try {
        const canvas = await html2canvas(body, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#f3f4f6',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: body.scrollWidth,
          windowHeight: body.scrollHeight,
        });
        return withExportHeading(canvas);
      } finally {
        iframe.remove();
      }
    };
    try {
      const canvas = await html2canvas(el, {
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
            clonedDoc.body?.querySelectorAll('[data-html2canvas-ignore]').forEach((n) => n.remove());
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
      return withExportHeading(canvas);
    } catch (err) {
      if (err?.message && (err.message.includes('oklab') || err.message.includes('oklch') || err.message.includes('unsupported color'))) {
        return await tryIframeCapture();
      }
      throw err;
    }
  }, [selectedDate, selectedLocation, selectedShift]);

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

  // --- Data Fetching ---
  const fetchBreakData = useCallback(async () => {
    if (!selectedDate || !selectedShift) return;

    const flightKey = `${selectedDate}|${selectedShift}|${selectedLocation || ''}`;
    setIsLoading(true);
    setAvailableStaff([]);

    const localCustomSlots = localCustomSlotsRef.current;
    const sessionStorageKey = getSessionStorageKey();
    const unsavedFlagKey = getUnsavedFlagKey();
    const hasUnsavedChanges = safeSessionStorage.getItem(unsavedFlagKey) === 'true';
    let savedAssignments = hasUnsavedChanges ? safeSessionStorage.getItem(sessionStorageKey) : null;
    if (!hasUnsavedChanges) {
      clearAssignmentCache();
    }
    const locationFilter = selectedLocation === ALL_LOCATIONS_VALUE ? null : selectedLocation;
    const shiftLower = selectedShift.toLowerCase();

    const mapBreakType = (frontendBreakType) => {
      if (!frontendBreakType) return 'custom';
      const t = frontendBreakType.toLowerCase();
      if (t.includes('break 1 (15 min)')) return 'break1';
      if (t.includes('break 2 (45 min)')) return 'break2';
      if (t.includes('night break (60 min)')) return 'night';
      if (t.includes('afternoon break (60 min)')) return 'afternoon';
      if (t.includes('custom')) return 'custom';
      return 'custom';
    };

    try {
      await singleFlightBreakData(flightKey, async () => {
        const baseStandardSlots = standardSlotsConfig[selectedShift] || [];
        let workingStandardSlots = [...baseStandardSlots];
        try {
          const dateObj = new Date(`${selectedDate}T00:00:00`);
          if (dateObj.getDay() === 6 && shiftLower === 'night') {
            workingStandardSlots.unshift({
              start_time: '20:00',
              duration_minutes: 60,
              break_type: 'Night Break (60 min)',
            });
          }
        } catch {
          // ignore date parse issues
        }

        const modifiedQuery = supabase
          .from('scheduled_breaks')
          .select('std_slot_id, capacity')
          .eq('date', selectedDate)
          .eq('shift_type', shiftLower)
          .is('user_id', null)
          .not('std_slot_id', 'is', null);
        if (locationFilter) modifiedQuery.eq('location', locationFilter);

        const customQuery = supabase
          .from('scheduled_breaks')
          .select('id, break_start_time, break_duration_minutes, break_type, capacity')
          .eq('date', selectedDate)
          .eq('shift_type', shiftLower)
          .is('user_id', null)
          .is('std_slot_id', null);

        const assignmentsQuery = savedAssignments
          ? null
          : (() => {
              const q = supabase
                .from('scheduled_breaks')
                .select(`
              id, user_id, break_start_time, break_duration_minutes, break_type, location,
              profiles:user_id (first_name, last_name, shift_preference)
            `)
                .eq('date', selectedDate)
                .eq('shift_type', shiftLower)
                .not('user_id', 'is', null);
              if (locationFilter) q.eq('location', locationFilter);
              return q;
            })();

        const rotaQuery = supabase
          .from('scheduled_rota')
          .select('id, user_id, shift_type, location')
          .eq('date', selectedDate)
          .eq('shift_type', shiftLower)
          .not('user_id', 'is', null);

        const [modifiedRes, customRes, assignmentsRes, rotaRes] = await Promise.all([
          modifiedQuery,
          customQuery,
          assignmentsQuery || Promise.resolve({ data: null, error: null }),
          rotaQuery,
        ]);

        const modifiedCapacities = {};
        if (!modifiedRes.error && modifiedRes.data) {
          modifiedRes.data.forEach((mod) => {
            if (mod.std_slot_id && mod.capacity !== null) {
              modifiedCapacities[mod.std_slot_id] = mod.capacity;
            }
          });
        }

        const standardSlotsWithIds = workingStandardSlots.map((slot, index) => {
          const slotId = `std-${selectedShift}-${index}`;
          const modifiedCapacity = modifiedCapacities[slotId];
          return {
            ...slot,
            id: slotId,
            is_custom: false,
            capacity: modifiedCapacity !== undefined ? modifiedCapacity : slot.capacity,
          };
        });

        let customSlotsData = [];
        if (!customRes.error && customRes.data?.length) {
          customSlotsData = customRes.data.map((slot) => ({
            id: slot.id,
            start_time: slot.break_start_time,
            duration_minutes: slot.break_duration_minutes,
            capacity: slot.capacity || 999,
            break_type: slot.break_type,
            is_custom: true,
          }));
        }

        const allSlots = sortBreakSlots(
          [...standardSlotsWithIds, ...customSlotsData, ...localCustomSlots],
          selectedShift,
        );
        setBreakSlots(allSlots);

        let processedScheduled = [];
        if (savedAssignments) {
          try {
            processedScheduled = JSON.parse(savedAssignments).map((assignment) => ({
              ...assignment,
              location: assignment.location || locationFilter || null,
            }));
            if (locationFilter) {
              processedScheduled = processedScheduled.filter(
                (assignment) => assignment.location === locationFilter,
              );
            }
          } catch (parseError) {
            console.error('[fetchBreakData] Error parsing sessionStorage assignments:', parseError);
            clearAssignmentCache();
            savedAssignments = null;
          }
        }

        if (!savedAssignments) {
          if (assignmentsRes.error) {
            console.error('[fetchBreakData] Error fetching existing assignments from DB:', assignmentsRes.error);
            processedScheduled = [];
          } else {
            processedScheduled = (assignmentsRes.data || [])
              .map((record) => {
                if (!record.profiles) return null;
                const matchingSlot = allSlots.find((slot) => {
                  const slotDbBreakType = mapBreakType(slot.break_type);
                  const slotTimeHHMM = slot.start_time?.substring(0, 5);
                  const recordTimeHHMM = record.break_start_time?.substring(0, 5);
                  return (
                    slotTimeHHMM === recordTimeHHMM &&
                    slot.duration_minutes === record.break_duration_minutes &&
                    slotDbBreakType === record.break_type
                  );
                });
                return {
                  id: record.id,
                  slot_id: matchingSlot?.id || null,
                  user_id: record.user_id,
                  break_date: selectedDate,
                  user_name: `${record.profiles.first_name} ${record.profiles.last_name}`,
                  preferred_shift: record.profiles.shift_preference,
                  break_type: record.break_type,
                  location: record.location || null,
                  slot_data: {
                    start_time: record.break_start_time,
                    duration_minutes: record.break_duration_minutes,
                    break_type: record.break_type,
                  },
                };
              })
              .filter(Boolean);
          }
        }

        if (rotaRes.error) {
          console.error('[fetchBreakData] Error querying scheduled_rota table:', rotaRes.error);
          throw rotaRes.error;
        }

        const filteredShifts = (rotaRes.data || []).filter((record) => {
          if (!record.user_id) return false;
          if (!locationFilter) return true;
          return record.location === locationFilter;
        });

        const locationMap = new Map();
        filteredShifts.forEach((record) => {
          if (record.user_id) locationMap.set(record.user_id, record.location || null);
        });

        setScheduledBreaks(processedScheduled);

        const filteredUserIds = filteredShifts.map((record) => record.user_id);
        const rotaIds = filteredShifts.map((r) => r.id).filter(Boolean);
        const uniqueUserIds = [...new Set(filteredUserIds)];

        const [attendanceData, profilesData] = await Promise.all([
          rotaIds.length > 0
            ? supabase.from('attendance').select('scheduled_rota_id').in('scheduled_rota_id', rotaIds).then((res) => res.data || [])
            : Promise.resolve([]),
          uniqueUserIds.length > 0
            ? fetchProfilesByIdsCached(uniqueUserIds, async (ids) => {
                const { data, error } = await supabase
                  .from('profiles')
                  .select('id, first_name, last_name, shift_preference')
                  .in('id', ids);
                if (error) throw error;
                return data || [];
              })
            : Promise.resolve([]),
        ]);

        const absentRotaIds = new Set((attendanceData || []).map((a) => a.scheduled_rota_id));
        const absentUserIds = new Set();
        filteredShifts.forEach((record) => {
          if (record.id && absentRotaIds.has(record.id) && record.user_id) {
            absentUserIds.add(record.user_id);
          }
        });
        setAbsentUserIdsForDate(absentUserIds);

        if (uniqueUserIds.length === 0) {
          setAvailableStaff([]);
        } else {
          const processedAvailable = (profilesData || [])
            .filter((profile) => !absentUserIds.has(profile.id))
            .map((profile) => ({
              id: profile.id,
              first_name: profile.first_name,
              last_name: profile.last_name,
              preferred_shift: profile.shift_preference || 'Unknown',
              is_available: true,
              location: locationMap.get(profile.id) || null,
            }));
          setAvailableStaff(processedAvailable);
        }
      });
    } catch (err) {
      console.error('Error in fetchBreakData:', err);
      toast.error('Failed to load break data: ' + err.message);
      setAvailableStaff([]);
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
    if (readOnly) return undefined;
    fetchBreakData();
    return undefined;
  }, [readOnly, selectedDate, selectedShift, selectedLocation, fetchBreakData]);

  // TM Breaks: load day → afternoon → night for the selected location (no shift toggle).
  useEffect(() => {
    if (!readOnly) return undefined;
    if (!selectedDate || !selectedLocation || selectedLocation === ALL_LOCATIONS_VALUE) {
      setTmBoards([]);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const boards = await fetchTmBreakBoards({
          date: selectedDate,
          location: selectedLocation,
        });
        if (!cancelled) setTmBoards(boards);
      } catch (err) {
        console.error('[BrakesManager] TM boards load failed:', err);
        if (!cancelled) {
          setTmBoards([]);
          toast.error('Failed to load break data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [readOnly, selectedDate, selectedLocation, toast]);

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
      
      // Prepare modified standard slot definitions (records with std_slot_id, null user_id)
      // NOTE: Standard slot modifications are UI only now - this can be removed
      // const standardSlotsToUpsert = []; // Object.values(modifiedStandardSlots).map(...) - removed persistence
      
      // Prepare custom slot definitions (records with null user_id, null std_slot_id, possibly existing id)
      // Custom slot definitions stay shared across hubs (no location column) by product design.
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

      // 3. Handle Custom Slot Definitions – admin only (regular user cannot add/edit custom slots)
      if (isAdmin && customSlotsToUpsert.length > 0) {
        // Split custom slots into new and existing
        const newCustomSlots = customSlotsToUpsert.filter(slot => !slot.id);
        const existingCustomSlots = customSlotsToUpsert.filter(slot => slot.id);
        
        // Insert new custom slots
        if (newCustomSlots.length > 0) {
          const { error: insertCustomError } = await supabase
              .from('scheduled_breaks')
              .insert(newCustomSlots);

          if (insertCustomError) {
            console.error("[handleSaveAllBreaks] Error inserting new custom slots:", insertCustomError);
            console.error("Data attempted for new custom slots:", JSON.stringify(newCustomSlots, null, 2));
            throw insertCustomError;
          }
        }
        
        // Update existing custom slots
        if (existingCustomSlots.length > 0) {
          const { error: updateCustomError } = await supabase
              .from('scheduled_breaks')
              .upsert(existingCustomSlots, { onConflict: 'id' });

          if (updateCustomError) {
            console.error("[handleSaveAllBreaks] Error updating existing custom slots:", updateCustomError);
            console.error("Data attempted for existing custom slots:", JSON.stringify(existingCustomSlots, null, 2));
            throw updateCustomError;
          }
        }
      }

      // 4. Insert NEW standard slot definitions (the ones with modified capacity)
      //    (Not needed anymore as capacity changes are UI only)
      // if (standardSlotsToUpsert.length > 0) { ... }

      // 5. Add the assignments that are missing
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

      // 6. Only once the new rows are safely stored, drop the withdrawn ones
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
      await Promise.allSettled(logPromises);

      if (!silent) {
        toast.success("Breaks schedule saved successfully!");
      }
      clearAssignmentCache(); // Clear temporary state on successful save
      localCustomSlotsRef.current = []; // Clear locally added slots after successful save
      
      // For silent save, keep current state (optimistic UI update)
      // No need to refetch - data is already up to date locally
      if (!silent) {
        // Only refetch when explicitly saving (with loading spinner)
        fetchBreakData();
      }
      // If silent=true, we keep the current state as-is without refetching
      
    } catch (error) {
      console.error('Error saving all breaks:', error);
      toast.error(
        silent
          ? 'Could not update breaks. Try again.'
          : 'Could not save breaks. Try again.'
      );
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
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
        const { error } = await supabase
          .from('scheduled_breaks')
          .delete()
          .eq('id', slotId);
        
        if (error) {
          console.error('[confirmDeleteSlot] Error deleting from database:', error);
          toast.error('Could not delete break slot. Try again.');
          setDeleteConfirmSlot(null);
          return;
        }
        await logSystemActivity(supabase, user, {
          entity_type: 'breaks',
          action_type: 'breaks_custom_slot_deleted',
          entity_id: slotId,
          payload: {
            date: selectedDate,
            shift_type: selectedShift.toLowerCase(),
            slot_id: slotId,
            break_start_time: deleteConfirmSlot.start_time,
            break_duration_minutes: deleteConfirmSlot.duration_minutes,
          },
        });
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
      persistAssignmentsToSession(updatedAssignments);
      
      toast.success(isNewSlot ? 'Custom slot removed.' : 'Custom slot deleted from database.');
      setDeleteConfirmSlot(null);
      
      // Refresh data to ensure UI is in sync with database
      if (!isNewSlot) {
        await fetchBreakData();
      }
    } catch (err) {
      console.error('[confirmDeleteSlot] Unexpected error:', err);
      toast.error('Could not delete break slot. Try again.');
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
  
  const requestRemoveStaff = (assignment) => {
    if (!isAdmin && assignment.user_id !== currentUser?.id) {
      toast.error('You can only remove your own breaks');
      return;
    }
    setRemoveConfirmAssignment(assignment);
  };

  const confirmRemoveStaff = async () => {
    const assignment = removeConfirmAssignment;
    setRemoveConfirmAssignment(null);
    if (!assignment) return;

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
    
    // Auto-save to server after removal (silent save). Pass updated list so save uses it immediately – no stale state.
    await handleSaveAllBreaks(true, updatedAssignments);
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
    if (readOnly) return;
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
    safeLocalStorage.setItem('brakes_selected_date', selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    safeLocalStorage.setItem('brakes_selected_shift', selectedShift);
  }, [selectedShift]);
  
  useEffect(() => {
    if (!selectedLocation || selectedLocation === ALL_LOCATIONS_VALUE) return;
    safeLocalStorage.setItem('brakes_selected_location', selectedLocation);
    if (readOnly) safeLocalStorage.setItem('tm_dashboard_location', selectedLocation);
  }, [selectedLocation, readOnly]);

  // Initialize calendar month when date modal opens; load DatePicker only then.
  useEffect(() => {
    if (!showDateModal) return undefined;
    if (selectedDate) {
      setCalendarMonth(new Date(`${selectedDate}T00:00:00`));
    } else {
      setCalendarMonth(new Date());
    }
    let cancelled = false;
    Promise.all([
      import('react-datepicker'),
      import('react-datepicker/dist/react-datepicker.css'),
    ]).then(([mod]) => {
      if (!cancelled) setDatePickerComp(() => mod.default);
    });
    return () => { cancelled = true; };
  }, [showDateModal, selectedDate]);

  useEffect(() => {
    if (!showDateModal && !showLocationModal && !showShiftModal) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setShowDateModal(false);
      setShowLocationModal(false);
      setShowShiftModal(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showDateModal, showLocationModal, showShiftModal]);

  const goToPreviousDay = () => {
    if (!selectedDate) return;
    setSelectedDate(formatDate(subDays(new Date(`${selectedDate}T00:00:00`), 1), 'yyyy-MM-dd'));
  };

  const goToNextDay = () => {
    if (!selectedDate) return;
    setSelectedDate(formatDate(addDays(new Date(`${selectedDate}T00:00:00`), 1), 'yyyy-MM-dd'));
  };

  const goToToday = () => {
    const suggested = getSuggestedBreakContext();
    setSelectedDate(suggested.date);
    setSelectedShift(suggested.shift);
  };

  const handleLocationSelect = (locationName) => {
    setSelectedLocation(locationName);
    setLocationMenuOpen(false);
  };

  const openLocationMenu = () => {
    const el = locationTriggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setLocationMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 10 * 16),
    });
    setLocationMenuOpen((open) => !open);
  };

  useEffect(() => {
    if (!locationMenuOpen) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (locationTriggerRef.current?.contains(t)) return;
      if (locationMenuRef.current?.contains(t)) return;
      setLocationMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setLocationMenuOpen(false);
    };
    const onReposition = () => {
      const el = locationTriggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setLocationMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 10 * 16),
      });
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [locationMenuOpen]);

  const desktopDateLabel = selectedDate
    ? formatDate(new Date(`${selectedDate}T00:00:00`), 'EEE d MMM yyyy')
    : 'Select date';

  const desktopToolbarControls = (
    <>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 xl:flex-nowrap xl:gap-x-3">
        <div className="relative inline-flex min-w-0 shrink-0">
          <select
            ref={locationTriggerRef}
            value={selectedLocation || (locations[0]?.name ?? '')}
            aria-haspopup="listbox"
            aria-expanded={locationMenuOpen}
            aria-label="Select location"
            className="admin-input min-h-11 w-auto min-w-[8rem] max-w-[10rem] shrink-0 cursor-pointer truncate text-left font-semibold"
            onMouseDown={(e) => {
              e.preventDefault();
              openLocationMenu();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (!locationMenuOpen) openLocationMenu();
              }
            }}
            onChange={() => {}}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.name}>
                {location.name}
              </option>
            ))}
          </select>
          {locationMenuOpen &&
            createPortal(
              <ul
                ref={locationMenuRef}
                role="listbox"
                aria-label="Locations"
                className="fixed z-[99998] max-h-72 overflow-auto rounded-lg border border-gray-300 bg-white py-1 shadow-lg"
                style={{
                  top: locationMenuPos.top,
                  left: locationMenuPos.left,
                  width: locationMenuPos.width,
                }}
              >
                {locations.map((location) => {
                  const selected = (selectedLocation || locations[0]?.name) === location.name;
                  return (
                    <li key={location.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => handleLocationSelect(location.name)}
                        className={`flex min-h-11 w-full items-center px-3 text-left text-sm font-medium transition-colors motion-reduce:transition-none ${
                          selected
                            ? 'bg-gray-100 font-semibold text-charcoal'
                            : 'text-charcoal hover:bg-gray-50'
                        }`}
                      >
                        {location.name}
                      </button>
                    </li>
                  );
                })}
              </ul>,
              document.body,
            )}
        </div>

        {!readOnly && (
          <>
            <span className="hidden h-4 w-px bg-gray-200 xl:block" aria-hidden="true" />

            <div
              className="inline-flex items-center gap-x-1"
              role="group"
              aria-label="Select shift"
            >
              {['Day', 'Afternoon', 'Night'].map((shift, index) => (
                <React.Fragment key={shift}>
                  {index > 0 && (
                    <span className="mx-0.5 h-4 w-px bg-gray-200" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedShift(shift)}
                    aria-pressed={selectedShift === shift}
                    className={`inline-flex min-h-11 items-center rounded-md px-2.5 transition-colors motion-reduce:transition-none ${
                      selectedShift === shift
                        ? 'text-sm font-semibold text-charcoal'
                        : 'text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-charcoal'
                    }`}
                  >
                    {shift}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      <span className="hidden h-4 w-px shrink-0 bg-gray-200 xl:block" aria-hidden="true" />

      <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-1 gap-y-1 xl:flex-nowrap xl:gap-x-2">
        <button
          type="button"
          onClick={goToPreviousDay}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-gray-100 motion-reduce:transition-none"
          aria-label="Previous day"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowDateModal(true);
            setShowLocationModal(false);
            setShowShiftModal(false);
          }}
          className="inline-flex min-h-11 min-w-0 max-w-[12rem] items-center truncate rounded-md px-2.5 text-center text-sm font-semibold text-charcoal transition-colors hover:bg-gray-50 motion-reduce:transition-none"
          aria-label="Open calendar"
        >
          {desktopDateLabel}
        </button>

        <button
          type="button"
          onClick={goToNextDay}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-gray-100 motion-reduce:transition-none"
          aria-label="Next day"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <span className="hidden h-4 w-px bg-gray-200 xl:block" aria-hidden="true" />

        <button
          type="button"
          onClick={goToToday}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-charcoal motion-reduce:transition-none"
        >
          Today
        </button>
      </div>

      <span className="hidden h-4 w-px shrink-0 bg-gray-200 xl:block" aria-hidden="true" />

      <div className="ml-auto flex min-w-0 flex-nowrap items-center gap-2" data-html2canvas-ignore>
        <button
          type="button"
          onClick={handleCopyAsPicture}
          disabled={isExporting || isLoading}
          className="admin-btn min-h-11 shrink-0 gap-2 !px-3 !text-sm"
          title="Copy as picture"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
          <span>{isExporting ? '…' : 'Copy as picture'}</span>
        </button>
      </div>
    </>
  );

  const desktopToolbarPortal = toolbarHost
    ? createPortal(
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-2 overflow-visible">
        {desktopToolbarControls}
      </div>,
      toolbarHost,
    )
    : null;

  // --- Rendering ---
  return (
    <div className="bg-offwhite text-charcoal min-h-screen pb-4 md:pb-20">
      {desktopToolbarPortal}

      {/* Modals for pickers */}
      {showDateModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
          role="presentation"
          onClick={() => setShowDateModal(false)}
        >
          <div
            className="admin-modal-panel flex max-h-[90vh] max-w-md flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="breaks-date-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header sticky top-0 z-10 flex items-center justify-between">
              <h3 id="breaks-date-modal-title" className="text-sm font-semibold text-charcoal">Select Date</h3>
              <button type="button" onClick={() => setShowDateModal(false)} className="admin-btn min-h-11">
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
                  font-size: 0.875rem !important;
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
                  font-size: 0.75rem !important;
                  flex: 1 !important;
                  min-width: 0 !important;
                  max-width: 2.75rem !important;
                  height: 2.75rem !important;
                  line-height: 2.75rem !important;
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
                  min-width: 2.75rem !important;
                  max-width: 2.75rem !important;
                  height: 2.75rem !important;
                  line-height: 2.75rem !important;
                  margin: 1px !important;
                  border-radius: 8px !important;
                  color: #1f2937 !important;
                  font-size: 0.875rem !important;
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
                  width: 2.75rem !important;
                  height: 2.75rem !important;
                  border-radius: 8px !important;
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
                  border: 2px solid #D97706 !important;
                  font-weight: 700 !important;
                  background-color: #FDE68A !important;
                }
                
                /* Media query dla większych ekranów */
                @media (min-width: 640px) {
                  .react-datepicker__day {
                    min-width: 2.75rem !important;
                    max-width: 2.75rem !important;
                    height: 2.75rem !important;
                    line-height: 2.75rem !important;
                    font-size: 0.875rem !important;
                  }
                  
                  .react-datepicker__day-name {
                    max-width: 2.75rem !important;
                    height: 2.75rem !important;
                    line-height: 2.75rem !important;
                    font-size: 0.75rem !important;
                  }
                  
                  .react-datepicker__current-month {
                    font-size: 0.875rem !important;
                  }
                  
                  .react-datepicker__month {
                    margin: 12px !important;
                  }
                }
              `}
            </style>
            {DatePickerComp ? (
            <DatePickerComp
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
            ) : (
              <div className="flex min-h-[16rem] items-center justify-center text-sm text-gray-500" aria-busy="true">
                Loading calendar…
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLocationModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
          role="presentation"
          onClick={() => setShowLocationModal(false)}
        >
          <div
            className="admin-modal-panel max-w-sm flex flex-col max-h-[90vh]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="breaks-location-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header sticky top-0 z-10 flex items-center justify-between">
              <h3 id="breaks-location-modal-title" className="text-sm font-semibold text-charcoal">Select Location</h3>
              <button type="button" onClick={() => setShowLocationModal(false)} className="admin-btn min-h-11">
                Done
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => { setSelectedLocation(loc.name); setShowLocationModal(false); }}
                  className={`admin-chip min-h-11 w-full !justify-start ${
                    selectedLocation === loc.name ? 'admin-chip-active' : ''
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
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
          role="presentation"
          onClick={() => setShowShiftModal(false)}
        >
          <div
            className="admin-modal-panel max-w-sm flex flex-col max-h-[90vh]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="breaks-shift-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header sticky top-0 z-10 flex items-center justify-between">
              <h3 id="breaks-shift-modal-title" className="text-sm font-semibold text-charcoal">Select Shift</h3>
              <button type="button" onClick={() => setShowShiftModal(false)} className="admin-btn min-h-11">
                Done
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {['Day','Afternoon','Night'].map(shift => (
                <button
                  key={shift}
                  type="button"
                  onClick={() => { setSelectedShift(shift); setShowShiftModal(false); }}
                  className={`admin-chip min-h-11 w-full !justify-start ${
                    selectedShift === shift ? 'admin-chip-active' : ''
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

      {/* Messages */}
      {/* Usunięto wyświetlanie komunikatu błędu, teraz używamy toast */}


      {/* Break Slots Display - bez kontenera, floating cards */}
      <div
        ref={breaksExportRef}
        data-breaks-export-root
        className="px-4 pt-2 pb-4 md:px-6 md:pt-2 md:pb-2"
      >
        {/* Mobile-only filter chips; desktop controls live in the logo header bar */}
        {!isDesktop && (
          <div className="mb-4 flex flex-col gap-2" data-html2canvas-ignore>
            <div className={`grid items-center gap-1 ${readOnly ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <button
                type="button"
                onClick={() => {
                  setShowDateModal(true);
                  setShowLocationModal(false);
                  setShowShiftModal(false);
                }}
                className={`admin-chip min-h-11 w-full min-w-0 ${showDateModal ? 'admin-chip-active' : ''}`}
                aria-label="Open calendar"
              >
                {selectedDate ? formatDate(new Date(`${selectedDate}T00:00:00`), 'dd/MM/yy') : 'Select date'}
              </button>
              <button
                type="button"
                onClick={() => { setShowLocationModal(true); setShowDateModal(false); setShowShiftModal(false); }}
                className={`admin-chip min-h-11 w-full min-w-0 ${showLocationModal ? 'admin-chip-active' : ''}`}
                aria-label="Select location"
              >
                {selectedLocation || 'Hub'}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => { setShowShiftModal(true); setShowDateModal(false); setShowLocationModal(false); }}
                  className={`admin-chip min-h-11 w-full min-w-0 ${showShiftModal ? 'admin-chip-active' : ''}`}
                  aria-label="Select shift"
                >
                  {selectedShift}
                </button>
              )}
            </div>

            <div className="w-full">
              <button
                type="button"
                onClick={handleCopyAsPicture}
                disabled={isExporting || isLoading}
                className="admin-chip min-h-11 w-full"
              >
                {isExporting ? '…' : 'Copy as picture'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse motion-reduce:animate-none">
            {/* Filters skeleton (mobile only — desktop filters are in the logo bar) */}
            {!isDesktop && (
            <div className="flex gap-3 mb-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 w-24 bg-slate-200 rounded-lg" />
              ))}
            </div>
            )}
            
            {/* Slot cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-md p-4 border-2 border-slate-200">
                  <div className="h-4 w-24 bg-slate-300 rounded mb-2" />
                  <div className="h-6 w-32 bg-slate-300 rounded mb-3" />
                  <div className="h-4 w-full bg-slate-200 rounded mb-2" />
                  <div className="h-4 w-3/4 bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : readOnly ? (
          <div className="space-y-8 md:space-y-10">
            {(tmBoards.length ? tmBoards : TM_BREAK_SHIFTS.map((shift) => ({
              shift,
              slots: [],
              assignments: [],
            }))).map((board) => (
              <section key={board.shift} aria-label={`${board.shift} breaks`}>
                <h3 className="mb-3 text-sm font-bold tracking-tight text-charcoal md:text-base">
                  {board.shift} shift
                </h3>
                {board.slots.length === 0 ? (
                  <p className="text-sm text-slate-500">No break slots for this shift.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                    {board.slots.map((slot) => (
                      <SlotCard
                        key={`${board.shift}-${slot.id}`}
                        slot={slot}
                        assignedStaff={(board.assignments || []).filter(
                          (a) => a.slot_id === slot.id
                        )}
                        onSlotClick={handleSlotClick}
                        onDeleteClick={handleDeleteCustomSlot}
                        onRemoveStaffClick={requestRemoveStaff}
                        isAdmin={false}
                        readOnly
                        currentUserId={currentUser?.id ?? null}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-6 md:space-y-8">
          {Object.entries(groupedSlots).map(([groupName, slotsInGroup]) => (
            <div key={groupName}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {slotsInGroup.map(slot => (
                  <SlotCard 
                    key={slot.id} 
                    slot={slot} 
                    assignedStaff={getAssignedStaffForSlot(slot.id)}
                    onSlotClick={handleSlotClick}
                    onDeleteClick={handleDeleteCustomSlot}
                    onRemoveStaffClick={requestRemoveStaff}
                    isAdmin={isAdmin && !readOnly}
                    readOnly={readOnly}
                    currentUserId={currentUser?.id ?? null}
                  />
                ))}
                
                {/* Add Slot Card - Only for admins and only in last group */}
                {isAdmin && !readOnly && groupName === Object.keys(groupedSlots)[Object.keys(groupedSlots).length - 1] && (
                  <button
                    type="button"
                    onClick={() => setAddSlotModalOpen(true)}
                    className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-400 bg-gray-50 p-4 transition-all duration-200 hover:border-gray-600 hover:bg-gray-100 hover:shadow-lg motion-reduce:transition-none md:min-h-[140px] md:p-4 [content-visibility:auto] [contain-intrinsic-size:auto_180px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="mb-2 h-12 w-12 text-orange-600 md:mb-1 md:h-10 md:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-base font-bold text-gray-900 md:text-sm">Add Custom Slot</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Modals — hidden in read-only (TM) mode */}
      {!readOnly && staffModalOpen && selectedSlot && (
        <StaffSelectionModal 
          isOpen={staffModalOpen}
          onClose={() => setStaffModalOpen(false)}
          slot={selectedSlot}
          availableStaff={isAdmin ? availableStaff : (availableStaff.filter(s => s.id === currentUser?.id) ?? [])}
          assignedStaff={getAssignedStaffForSlot(selectedSlot.id)}
          onAssignStaff={handleAssignStaff}
          onRemoveStaff={requestRemoveStaff}
          currentLocation={selectedLocation}
          isAllLocation={selectedLocation === ALL_LOCATIONS_VALUE}
          onSave={handleSaveAllBreaks}
          preferredBreakMinutesByUserId={preferredBreakMinutesByUserId}
          timeToMinutes={timeToMinutes}
        />
      )}
      
      {!readOnly && addSlotModalOpen && (
        <AddSlotModal 
          isOpen={addSlotModalOpen}
          onClose={() => setAddSlotModalOpen(false)}
          onAddCustomSlot={handleAddCustomSlot}
          selectedShift={selectedShift}
        />
      )}
      
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmSlot)}
        onClose={() => setDeleteConfirmSlot(null)}
        onConfirm={confirmDeleteSlot}
        title="Delete break slot"
        message={
          deleteConfirmSlot
            ? `Delete the ${deleteConfirmSlot.start_time} slot (${deleteConfirmSlot.duration_minutes} min)? This action cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        overlayClassName="z-[9999]"
      />

      <ConfirmDialog
        isOpen={Boolean(removeConfirmAssignment)}
        onClose={() => setRemoveConfirmAssignment(null)}
        onConfirm={confirmRemoveStaff}
        title="Remove break"
        message={
          removeConfirmAssignment
            ? `Remove ${removeConfirmAssignment.user_name || 'this person'} from the break?`
            : ''
        }
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive
        overlayClassName="z-[9999]"
      />
    </div>
  );
};

// Staff Selection Modal Component - Enhance the staff removal functionality
// eslint-disable-next-line no-unused-vars
const StaffSelectionModal = ({ isOpen, onClose, slot, availableStaff, assignedStaff, onAssignStaff, onRemoveStaff, currentLocation, isAllLocation, onSave, preferredBreakMinutesByUserId = {}, timeToMinutes }) => {
  const modalRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Prevent body scrolling when modal is open; Escape closes
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);
  
  const assignmentByUserId = new Map(
    assignedStaff.map(assignment => [assignment.user_id, assignment])
  );

  const canTakeThisSlot = (staff) => {
    if (slot.break_type?.includes('15 min')) {
      return staff.has_break_15 !== true;
    }
    if (slot.break_type?.includes('45 min')) {
      return staff.has_break_45 !== true;
    }
    const totalBreakMinutes = staff.total_break_minutes || 0;
    return 60 - totalBreakMinutes >= slot.duration_minutes;
  };

  // People on this slot stay in the list. Others are hidden once this break type is used.
  const listedFromAvailable = availableStaff.filter(staff => {
    if (!staff) return false;
    if (assignmentByUserId.has(staff.id)) return true;
    return canTakeThisSlot(staff);
  });

  const listedIds = new Set(listedFromAvailable.map(staff => staff.id));
  const orphanStaff = assignedStaff
    .filter(assignment => assignment.user_id && !listedIds.has(assignment.user_id))
    .map(assignment => {
      const parts = (assignment.user_name || '').trim().split(/\s+/);
      return {
        id: assignment.user_id,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' '),
        preferred_shift: assignment.preferred_shift || '',
        total_break_minutes: 0,
      };
    });

  const sortByPreferredTime = (rows) => {
    if (!timeToMinutes || typeof preferredBreakMinutesByUserId !== 'object') return rows;
    const slotMin = timeToMinutes(slot.start_time);
    return [...rows].sort((a, b) => {
      const prefA = preferredBreakMinutesByUserId[a.id] ?? 9999;
      const prefB = preferredBreakMinutesByUserId[b.id] ?? 9999;
      return Math.abs(prefA - slotMin) - Math.abs(prefB - slotMin);
    });
  };

  const displayStaff = [...sortByPreferredTime(listedFromAvailable), ...orphanStaff];
  
  // Check if we have no staff after filtering
  // Removed debug useEffect
  
  if (!isOpen) return null;
  
  // Use createPortal to render the modal in the document body
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
      role="presentation"
      onClick={onClose}
    >
      <div 
        ref={modalRef}
        className="admin-modal-panel relative text-charcoal max-w-md lg:max-w-5xl h-[90vh] md:h-[85vh] max-h-[90vh] md:max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Assign staff for break ${slot.start_time}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Sticky */}
        <div className="admin-modal-header sticky top-0 flex-shrink-0 z-10">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <span className="font-bold text-charcoal text-xl md:text-2xl">{slot.start_time} - {
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
              type="button"
              onClick={() => {
                if (!isAllLocation) {
                  // Save silently in background without blocking modal close
                  onSave(true); // Pass silent=true
                }
                // Close modal immediately
                onClose();
              }}
              disabled={isAllLocation}
              className="admin-btn min-h-11 flex-shrink-0"
              title={isAllLocation ? 'Select a specific location to save changes' : 'Save and close'}
            >
              Done
            </button>
          </div>
        </div>
        
        {/* Content - Scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0">
        
        {isAllLocation && (
          <div className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 md:mx-4">
            <strong>Read-only mode:</strong> Select a specific location tab to assign staff and save changes.
          </div>
        )}
        
        <div className="p-2 md:p-4">
          {displayStaff.length === 0 ? (
            <div className="text-center py-4 md:py-6 text-gray-500 text-base md:text-lg">
              No available staff
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {displayStaff.map(staff => {
                const assignment = assignmentByUserId.get(staff.id);
                const isAssigned = Boolean(assignment);
                const locked = isProcessing || isAllLocation;
                const initials = `${staff.first_name?.[0] || ''}${staff.last_name?.[0] || ''}`.toUpperCase() || '?';
                return (
                <button
                  key={staff.id}
                  disabled={locked}
                  onClick={async () => {
                    if (locked) return;
                    setIsProcessing(true);
                    if (isAssigned) {
                      await onRemoveStaff(assignment);
                    } else {
                      await onAssignStaff(staff, slot);
                    }
                    setIsProcessing(false);
                  }}
                  className={`w-full min-h-11 text-left flex items-center justify-between px-3 py-2 md:px-4 md:py-2.5 rounded-lg transition-all duration-200 motion-reduce:transition-none ${
                    locked
                      ? isAssigned
                        ? 'cursor-not-allowed border-2 border-orange-300 bg-gray-200 text-gray-500'
                        : 'cursor-not-allowed border-2 border-gray-200 bg-gray-100 text-gray-400'
                      : isAssigned
                        ? 'border-2 border-orange-500 bg-gray-200 shadow-md'
                        : 'border-2 border-gray-300 bg-gray-100 shadow-sm hover:border-gray-500 hover:bg-gray-200 hover:shadow-md focus:bg-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`flex-shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full border-2 border-orange-400 flex items-center justify-center font-bold text-sm md:text-base shadow-md ${
                      isAssigned ? 'text-white bg-orange-600' : 'text-orange-700 bg-orange-50'
                    }`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-base md:text-lg font-bold text-charcoal">{staff.first_name} {staff.last_name}</div>
                      <div className="text-sm md:text-base text-gray-600">
                        {staff.preferred_shift}
                        {staff.preferred_shift?.toLowerCase() === 'day' && (
                          <span className="ml-2">
                            {staff.has_break_15 && <span className="inline-block px-2 py-0.5 bg-orange-200 text-orange-900 border border-orange-400 rounded text-xs md:text-sm mr-1 font-medium">15m</span>}
                            {staff.has_break_45 && <span className="inline-block px-2 py-0.5 bg-green-200 text-green-900 border border-green-400 rounded text-xs md:text-sm font-medium">45m</span>}
                          </span>
                        )}
                        {staff.preferred_shift?.toLowerCase() !== 'day' && (
                          <span className="ml-2">
                            {staff.total_break_minutes || 0}/60 min used
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isAssigned ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7 text-red-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-label="Remove staff member">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7 text-orange-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-label="Assign to break">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Add Slot Modal Component
const AddSlotModal = ({ isOpen, onClose, onAddCustomSlot, selectedShift }) => {
  const modalRef = useRef(null);
  
  useEffect(() => {
    if (!isOpen) return undefined;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-3"
      role="presentation"
      onClick={onClose}
    >
      <div 
        ref={modalRef}
        className="admin-modal-panel relative text-charcoal max-w-sm max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="breaks-add-slot-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Sticky */}
        <div className="admin-modal-header sticky top-0 flex-shrink-0 z-10">
          <div className="flex justify-between items-center">
            <h3 id="breaks-add-slot-title" className="text-sm font-semibold text-charcoal">Create Custom Slot</h3>
            <button 
              type="button"
              onClick={onClose}
              className="admin-btn min-h-11"
            >
              Done
            </button>
          </div>
        </div>
        
        {/* Form Content - Scrollable */}
        <div className="p-5 overflow-y-auto flex-1">
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
            className="admin-input min-h-11 w-full"
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
            className="admin-input min-h-11 w-full"
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
            className="admin-btn min-h-11 w-full"
          >
            Add Custom Slot
          </button>
        </div>
      </form>
  );
};

// Slot Card Component to display a break slot
const SlotCard = ({ slot, assignedStaff, onSlotClick, onDeleteClick, onRemoveStaffClick, isAdmin, readOnly = false }) => {
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
  const cardClasses = readOnly
    ? `bg-white p-4 md:p-4 rounded-xl border-2 border-gray-300 min-h-[180px] md:min-h-[140px] flex flex-col justify-between relative transition-all duration-200 shadow-lg motion-reduce:transition-none [content-visibility:auto] [contain-intrinsic-size:auto_180px]`
    : `bg-white p-4 md:p-4 rounded-xl border-2 border-gray-300 hover:border-gray-500 cursor-pointer hover:shadow-2xl min-h-[180px] md:min-h-[140px] flex flex-col justify-between relative transition-all duration-200 shadow-lg motion-reduce:transition-none [content-visibility:auto] [contain-intrinsic-size:auto_180px]`;
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
    if (readOnly) return;
    // Prevent opening the modal if the click was on a remove button or delete button
    if (e.target.closest('.remove-staff-button') || e.target.closest('.delete-slot-button')) {
      return;
    }
    // Allow all users to open the modal (non-admin will only see/add themselves)
    onSlotClick(slot);
  };

  const handleCardKeyDown = (e) => {
    if (readOnly) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.remove-staff-button') || e.target.closest('.delete-slot-button')) {
      return;
    }
    e.preventDefault();
    onSlotClick(slot);
  };

  const slotLabel = `Break ${formatStartTime()} to ${calculateEndTime()}, ${assignedStaff.length} assigned${readOnly ? '' : '. Activate to manage'}`;

  return (
    <div 
      className={cardClasses}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      aria-label={slotLabel}
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
                  <span className="block min-w-0 break-words font-semibold text-charcoal">{staff.user_name}</span>
                </div>
                {/* Show remove button only for admin (regular user cannot remove anyone, including themselves) */}
                {isAdmin && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the card's onClick
                      onRemoveStaffClick(staff);
                    }} 
                    type="button"
                    className="remove-staff-button ml-2 inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-full p-1.5 text-red-600 opacity-80 transition-all duration-200 hover:bg-red-600 hover:text-white group-hover:opacity-100 motion-reduce:transition-none md:ml-3"
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
            type="button"
            className="delete-slot-button inline-flex min-h-11 items-center gap-1 rounded-full p-1.5 text-red-500 transition-all duration-200 hover:bg-red-100 hover:text-red-700 motion-reduce:transition-none md:p-2"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the card's onClick
              onDeleteClick(slot.id);
            }}
            aria-label="Delete custom slot"
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
  isAllLocation: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  preferredBreakMinutesByUserId: PropTypes.object,
  timeToMinutes: PropTypes.func
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
  isAdmin: PropTypes.bool.isRequired,
  readOnly: PropTypes.bool,
  currentUserId: PropTypes.string
};

BrakesManager.propTypes = {
  readOnly: PropTypes.bool,
};

export default BrakesManager; 