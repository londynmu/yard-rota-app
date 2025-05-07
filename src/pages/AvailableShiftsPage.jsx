import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, parseISO } from 'date-fns';

export default function AvailableShiftsPage() {
  const { user } = useAuth();
  const [availableShifts, setAvailableShifts] = useState([]);
  const [userShifts, setUserShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(() => {
    return localStorage.getItem('available_shifts_location') || 'Rugby';
  });
  const [locations, setLocations] = useState([]);
  const [claimingShift, setClaimingShift] = useState(null);

  // Load user preferences and locations
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
      } catch (error) {
        console.error('Error fetching locations:', error);
        setError('Failed to load locations');
      }
    };

    fetchLocations();
  }, []);

  // Save selected location when it changes
  useEffect(() => {
    localStorage.setItem('available_shifts_location', selectedLocation);
  }, [selectedLocation]);

  // Fetch available shifts and user's current shifts
  useEffect(() => {
    const fetchShifts = async () => {
      if (!user) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Get current date in format YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];
        
        // Fetch available shifts (base slots)
        const { data: availableData, error: availableError } = await supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            capacity,
            task,
            status
          `)
          .eq('location', selectedLocation)
          .eq('status', 'available')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });
        
        if (availableError) {
          console.error('Error fetching available shifts:', availableError);
          throw availableError;
        }
        
        // Pobierz wszystkie przypisane osoby - aby policzyć zajęte miejsca
        const { data: assignedData, error: assignedError } = await supabase
          .from('scheduled_rota')
          .select(`
            date,
            location,
            shift_type,
            start_time,
            end_time
          `)
          .eq('location', selectedLocation)
          .gte('date', today)
          .not('user_id', 'is', null);
        
        if (assignedError) {
          console.error('Error fetching assigned data:', assignedError);
          throw assignedError;
        }
        
        console.log('Available shifts data:', availableData);
        console.log('Assigned data:', assignedData);
        
        // Zlicz przypisania per slot (identyfikowany przez datę, lokalizację, czas)
        const assignedCountMap = {};
        assignedData.forEach(assignment => {
          // Klucz to kombinacja atrybutów, które jednoznacznie identyfikują slot
          const key = `${assignment.date}_${assignment.location}_${assignment.start_time}_${assignment.end_time}`;
          assignedCountMap[key] = (assignedCountMap[key] || 0) + 1;
        });
        
        console.log('Assigned count map:', assignedCountMap);
        
        // Rozwiń dostępne sloty uwzględniając już zajęte miejsca
        const expandedShifts = [];
        
        // Grupuj sloty z tymi samymi parametrami, ale wybierz ten z najmniejszym ID jako reprezentatywny
        const slotGroups = {};
        
        availableData.forEach(shift => {
          const key = `${shift.date}_${shift.location}_${shift.start_time}_${shift.end_time}`;
          if (!slotGroups[key] || shift.id < slotGroups[key].id) {
            slotGroups[key] = shift;
          }
        });
        
        // Teraz użyj tylko unikalnych slotów (jeden per grupa)
        Object.values(slotGroups).forEach(shift => {
          // Stwórz ten sam klucz, aby znaleźć liczbę zajętych miejsc
          const key = `${shift.date}_${shift.location}_${shift.start_time}_${shift.end_time}`;
          const assignedCount = assignedCountMap[key] || 0;
          
          // Ile zostało wolnych miejsc
          const availableCapacity = Math.max(shift.capacity - assignedCount, 0);
          console.log(`Slot ${key}: capacity=${shift.capacity}, assigned=${assignedCount}, available=${availableCapacity}`);
          
          // Dodaj tyle instancji slotu, ile zostało wolnych miejsc
          for (let i = 0; i < availableCapacity; i++) {
            expandedShifts.push({
              ...shift,
              _slotIndex: i // Dodaj indeks, aby rozróżnić multiple instancje tego samego slotu
            });
          }
        });
        
        // Fetch user's already claimed shifts
        const { data: userShiftsData, error: userShiftsError } = await supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            task
          `)
          .eq('user_id', user.id)
          .gte('date', today)
          .order('date', { ascending: true });
        
        if (userShiftsError) throw userShiftsError;
        
        setAvailableShifts(expandedShifts || []);
        setUserShifts(userShiftsData || []);
      } catch (error) {
        console.error('Error fetching shifts:', error);
        setError('Failed to load available shifts');
      } finally {
        setLoading(false);
      }
    };
    
    fetchShifts();
  }, [user, selectedLocation]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Check if a shift would conflict with user's existing shifts
  const hasConflict = (shift) => {
    return userShifts.some(userShift => {
      // Check if dates match
      if (userShift.date !== shift.date) return false;
      
      // Convert times to minutes for easier comparison
      const shiftStart = timeToMinutes(shift.start_time);
      const shiftEnd = timeToMinutes(shift.end_time);
      const userStart = timeToMinutes(userShift.start_time);
      const userEnd = timeToMinutes(userShift.end_time);
      
      // Check for overlap
      return (
        (shiftStart >= userStart && shiftStart < userEnd) || // Shift starts during existing shift
        (shiftEnd > userStart && shiftEnd <= userEnd) || // Shift ends during existing shift
        (shiftStart <= userStart && shiftEnd >= userEnd) // Shift completely contains existing shift
      );
    });
  };
  
  // Helper to convert HH:MM to minutes
  const timeToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Format date for display
  const formatDate = (dateString) => {
    return format(parseISO(dateString), 'EEE, MMM d, yyyy');
  };

  // Handle claiming a shift
  const handleClaimShift = async (shift) => {
    if (!user) return;
    
    setClaimingShift(shift.id + (shift._slotIndex !== undefined ? `_${shift._slotIndex}` : '')); // Make claimingShift ID unique for UI
    setError(null);
    
    try {
      console.log('Claiming shift:', shift);
      
      // The `shift` object comes from `availableShifts` which are already filtered for `status: 'available'`
      // and represent individual available spots. The `shift.id` is the ID of the *primary* record
      // for that available slot group.
      // We need to find *any* record belonging to this logical slot that is currently unassigned.

      // First, double-check if the *primary* slot is still marked as available (it should be)
      const { data: primarySlotCheck, error: primaryCheckError } = await supabase
        .from('scheduled_rota')
        .select('id, status, capacity, user_id')
        .eq('id', shift.id) // shift.id is the ID of the representative slot for this group
        .single();

      if (primaryCheckError) {
        console.error('Error checking primary slot status:', primaryCheckError);
        throw primaryCheckError;
      }

      if (!primarySlotCheck || primarySlotCheck.status !== 'available') {
        setError('This shift is no longer available or has been changed.');
        setAvailableShifts(prev => prev.filter(s => !(s.id === shift.id && s._slotIndex === shift._slotIndex))); // Optimistically remove
        return;
      }

      // Now, find an actual unassigned record for this logical slot group.
      // This could be the primary record itself (if its user_id is null) or another record 
      // that shares the same slot characteristics (date, time, location) but has user_id = null.
      const { data: assignableRecords, error: findAssignableError } = await supabase
        .from('scheduled_rota')
        .select('id, user_id')
        .eq('date', shift.date)
        .eq('location', shift.location)
        .eq('start_time', shift.start_time)
        .eq('end_time', shift.end_time)
        .is('user_id', null) // Find one that is not yet taken
        .limit(1); // Get one assignable record

      if (findAssignableError) {
        console.error('Error finding an assignable record for the slot:', findAssignableError);
        throw findAssignableError;
      }

      console.log('Assignable records found for this slot group:', assignableRecords);

      if (!assignableRecords || assignableRecords.length === 0) {
        setError('Sorry, this shift was just claimed by someone else or is no longer available.');
        // Refresh available shifts as a spot was likely taken
        setAvailableShifts(prev => prev.filter(s => !(s.id === shift.id && s._slotIndex === shift._slotIndex))); // Optimistically remove
        return;
      }
      
      const recordToAssignId = assignableRecords[0].id;
      console.log('Attempting to assign user to recordId:', recordToAssignId);

      // Update the specific unassigned record with the user's ID
      const { error: updateError } = await supabase
        .from('scheduled_rota')
        .update({ user_id: user.id, status: null }) // Assign user, and clear 'available' status from this specific record
        .eq('id', recordToAssignId);

      if (updateError) {
        console.error('Error updating shift with user ID:', updateError);
        throw updateError;
      }

      setSuccessMessage(`Successfully claimed shift: ${shift.location} on ${formatDate(shift.date)} at ${shift.start_time.substring(0,5)}`);
      
      // Update UI optimistically and then re-fetch for consistency
      setUserShifts(prev => [...prev, { ...shift, id: recordToAssignId, user_id: user.id }]);
      setAvailableShifts(prev => prev.filter(s => !(s.id === shift.id && s._slotIndex === shift._slotIndex) ));
      
      // Optionally, trigger a full refresh of available shifts after a short delay 
      // to ensure data consistency, though optimistic updates handle immediate UI.
      // fetchShifts(); // Or a more targeted update if possible

    } catch (error) {
      console.error('Failed to claim shift:', error);
      setError(`Failed to claim shift: ${error.message}`);
    } finally {
      setClaimingShift(null);
    }
  };

  // Handle location change
  const handleLocationChange = (location) => {
    setSelectedLocation(location);
  };

  // Group shifts by date
  const shiftsByDate = availableShifts.reduce((acc, shift) => {
    if (!acc[shift.date]) {
      acc[shift.date] = [];
    }
    acc[shift.date].push(shift);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-black via-blue-900 to-green-500">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Location tabs */}
        <div className="bg-black/60 backdrop-blur-xl rounded-lg border border-white/30 mb-6 overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-hide">
            {locations.map((location) => (
              <button
                key={location.name}
                onClick={() => handleLocationChange(location.name)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium focus:outline-none ${
                  selectedLocation === location.name
                    ? 'bg-white/20 text-white border-b-2 border-blue-400'
                    : 'text-white/70 hover:bg-white/10'
                }`}
              >
                {location.name}
              </button>
            ))}
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mb-6 bg-red-500/20 backdrop-blur-sm text-red-100 p-4 rounded-lg border border-red-400/30">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="mb-6 bg-green-500/20 backdrop-blur-sm text-green-100 p-4 rounded-lg border border-green-400/30">
            {successMessage}
          </div>
        )}

        {/* No shifts message */}
        {Object.keys(shiftsByDate).length === 0 && !error && (
          <div className="bg-black/60 backdrop-blur-xl rounded-lg border border-white/30 p-6 text-center text-white">
            <h3 className="text-xl font-bold mb-2">No Available Shifts</h3>
            <p>There are currently no available shifts for {selectedLocation}.</p>
          </div>
        )}

        {/* Shifts by date */}
        {Object.entries(shiftsByDate).map(([date, shifts]) => (
          <div key={date} className="mb-6 bg-black/60 backdrop-blur-xl rounded-lg border border-white/30 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900/60 to-purple-900/60 px-4 py-3">
              <h3 className="text-white font-bold">{formatDate(date)}</h3>
            </div>
            
            <ul className="divide-y divide-white/10">
              {shifts.map((shift, i) => {
                const conflict = hasConflict(shift);
                
                return (
                  <li key={i} className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div className="mb-2 sm:mb-0">
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center text-sm bg-black/50 text-white px-3 py-1.5 rounded-md font-medium border border-white/20">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                          </span>
                          
                          <span className={`text-sm px-2 py-1 rounded-md font-medium ${
                            shift.shift_type === 'day' ? 'bg-amber-500/30 text-amber-200 border border-amber-400/30' :
                            shift.shift_type === 'afternoon' ? 'bg-orange-500/30 text-orange-200 border border-orange-400/30' :
                            'bg-blue-600/40 text-blue-200 border border-blue-400/30'
                          }`}>
                            {shift.shift_type.charAt(0).toUpperCase() + shift.shift_type.slice(1)}
                          </span>
                        </div>
                        
                        {shift.task && (
                          <p className="text-white/70 text-sm mt-1">{shift.task}</p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleClaimShift(shift)}
                        disabled={conflict || claimingShift === shift.id}
                        className={`mt-2 sm:mt-0 px-4 py-2 text-sm font-medium rounded-md ${
                          conflict
                            ? 'bg-yellow-500/20 text-yellow-300 cursor-not-allowed'
                            : claimingShift === shift.id
                            ? 'bg-blue-500/30 text-blue-200'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {claimingShift === shift.id ? (
                          <span className="flex items-center justify-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Claiming...
                          </span>
                        ) : conflict ? (
                          'Schedule Conflict'
                        ) : (
                          'Claim Shift'
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
} 