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
        
        // Fetch available shifts
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
            task
          `)
          .eq('location', selectedLocation)
          .eq('status', 'available')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });
        
        if (availableError) throw availableError;
        
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
        
        setAvailableShifts(availableData || []);
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
    
    setClaimingShift(shift.id);
    setError(null);
    
    try {
      // Check if shift is still available
      const { data: currentShift, error: checkError } = await supabase
        .from('scheduled_rota')
        .select('id, status')
        .eq('id', shift.id)
        .single();
      
      if (checkError) throw checkError;
      
      if (currentShift.status !== 'available') {
        setError('This shift is no longer available');
        return;
      }
      
      // Call the claim_shift function
      const { data, error } = await supabase.rpc('claim_shift', { 
        shift_id: shift.id,
        user_id: user.id
      });
      
      if (error) throw error;
      
      if (data.success) {
        setSuccessMessage('Shift claimed successfully!');
        
        // Update local state
        setAvailableShifts(current => 
          current.filter(s => s.id !== shift.id)
        );
        
        // Add to user shifts
        setUserShifts(current => [...current, shift]);
      } else {
        setError(data.message || 'Failed to claim shift');
      }
    } catch (error) {
      console.error('Error claiming shift:', error);
      setError('Failed to claim shift: ' + (error.message || 'Unknown error'));
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
              {shifts.map((shift) => {
                const conflict = hasConflict(shift);
                
                return (
                  <li key={shift.id} className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                      <div className="mb-2 sm:mb-0">
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center text-sm bg-white/10 px-2 py-1 rounded-md">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                          </span>
                          
                          <span className={`text-sm px-2 py-1 rounded-md ${
                            shift.shift_type === 'day' ? 'bg-amber-500/20 text-amber-300' :
                            shift.shift_type === 'afternoon' ? 'bg-orange-500/20 text-orange-300' :
                            'bg-blue-500/20 text-blue-300'
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