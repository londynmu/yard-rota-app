import React, { useState, useEffect } from 'react';
import { format, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import CalendarGrid from '../components/Calendar/CalendarGrid';
import AvailabilityDialog from '../components/Calendar/AvailabilityDialog';
import ShiftDashboard from '../components/User/ShiftDashboard';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

export default function CalendarPage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dayData, setDayData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [popup, setPopup] = useState({ show: false, type: 'info', message: '' });
  const [selectedLocation, setSelectedLocation] = useState('Rugby');
  const [selectedShifts, setSelectedShifts] = useState(['day', 'afternoon', 'night']);
  const [shiftCounts, setShiftCounts] = useState({ day: 0, afternoon: 0, night: 0 });
  
  // Function to show popup
  const showPopup = (type, message, duration = 3000) => {
    setPopup({ show: true, type, message });
    setTimeout(() => {
        setPopup({ show: false, type: '', message: '' });
    }, duration);
  };
  
  // Fetch availability data from Supabase
  useEffect(() => {
    async function fetchAvailability() {
      if (!user) return;
      
      setLoading(true);
      
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      // Add some buffer to get days from previous/next month that might appear in the grid
      const startDate = new Date(startOfMonth);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(endOfMonth);
      endDate.setDate(endDate.getDate() + 7);
      
      try {
        const { data, error } = await supabase
          .from('availability')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', endDate.toISOString().split('T')[0]);
        
        if (error) throw error;
        
        // Transform data into a map for easy lookup by date
        const dataMap = {};
        data.forEach(item => {
          dataMap[item.date] = item;
        });
        
        setDayData(dataMap);
      } catch (error) {
        console.error('Error fetching availability:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchAvailability();
  }, [currentDate, user]);
  
  const handlePreviousMonth = () => {
    // Always allow navigation to previous months for viewing purposes
    setCurrentDate(prevDate => subMonths(prevDate, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentDate(prevDate => addMonths(prevDate, 1));
  };
  
  const handleDayClick = (date) => {
    // Prevent setting availability for past dates
    const today = startOfDay(new Date());
    
    if (isBefore(date, today)) {
      setErrorMessage("You cannot set availability for dates in the past.");
      // Clear the error message after 3 seconds
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    // Clear any error message
    setErrorMessage('');
    setSelectedDate(date);
  };
  
  const handleCloseDialog = () => {
    setSelectedDate(null);
  };
  
  const handleSaveAvailability = async (data) => {
    if (!user) {
      alert('You must be logged in to save availability');
      return;
    }
    
    try {
      setLoading(true);
      
      // Check if we're updating an existing record
      const existingData = dayData[data.date];
      
      if (existingData) {
        // Update existing record
        const { error } = await supabase
          .from('availability')
          .update({
            status: data.status,
            comment: data.comment
          })
          .eq('id', existingData.id);
          
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('availability')
          .insert([{
            date: data.date,
            status: data.status,
            comment: data.comment,
            user_id: user.id
          }]);
          
        if (error) throw error;
      }
      
      // Refetch data to update the calendar
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const startDate = new Date(startOfMonth);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(endOfMonth);
      endDate.setDate(endDate.getDate() + 7);
      
      const { data: refreshedData, error: fetchError } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);
      
      if (fetchError) throw fetchError;
      
      // Update local state
      const dataMap = {};
      refreshedData.forEach(item => {
        dataMap[item.date] = item;
      });
      
      setDayData(dataMap);
    } catch (error) {
      console.error('Error saving availability:', error);
      showPopup('error', 'Failed to save availability. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      {/* Centered Popup Message */}
      {popup.show && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded-lg shadow-lg text-center text-base font-medium border
                     ${popup.type === 'error' ? 'bg-red-50 text-red-700 border-red-500' : 'bg-green-50 text-green-700 border-green-500'}`}>
           {popup.message}
        </div>
      )}
      
      {/* Main scrollable container */}
      <div className="h-full overflow-y-auto bg-offwhite px-4 py-6 md:px-6 pb-20 md:pb-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Availability Calendar Section - No white container */}
          <div>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg shadow-sm">
                {errorMessage}
              </div>
            )}
            
            {/* Legend - Above Calendar */}
            <div className="mb-4">
              <div className="flex justify-center items-center gap-6 text-sm font-medium text-charcoal">
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                  <span>Available</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                  <span>Unavailable</span>
                </div>
                <div className="flex items-center">
                  <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                  <span>Holiday</span>
                </div>
              </div>
            </div>
            
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-charcoal"
                aria-label="Previous month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h3 className="text-2xl font-bold text-charcoal">
                {format(currentDate, 'MMMM yyyy')}
              </h3>
              
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-charcoal"
                aria-label="Next month"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Calendar Grid */}
            <CalendarGrid
              currentDate={currentDate}
              dayData={dayData}
              onDayClick={handleDayClick}
              isLoading={loading}
            />
          </div>
          
          {/* Pastel Divider Line */}
          <div className="border-t-2 border-blue-100"></div>
          
          {/* Today's Breaks Section - Title with Badges */}
          <div className="mb-3">
            <h2 className="text-xl font-bold text-charcoal mb-2">Today's Breaks</h2>
            
            {/* Badges Row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Location Badge */}
              <button
                onClick={() => {
                  const locations = ['Rugby', 'NRC', 'Nuneaton'];
                  const currentIndex = locations.indexOf(selectedLocation);
                  const nextIndex = (currentIndex + 1) % locations.length;
                  setSelectedLocation(locations[nextIndex]);
                }}
                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors"
              >
                {selectedLocation}
              </button>
              
              {/* Shift Badges - Clickable filters */}
              <button
                onClick={() => {
                  setSelectedShifts(prev => 
                    prev.includes('day') 
                      ? prev.filter(s => s !== 'day')
                      : [...prev, 'day']
                  );
                }}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('day')
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Day {shiftCounts.day > 0 && `(${shiftCounts.day})`}
              </button>
              
              <button
                onClick={() => {
                  setSelectedShifts(prev => 
                    prev.includes('afternoon') 
                      ? prev.filter(s => s !== 'afternoon')
                      : [...prev, 'afternoon']
                  );
                }}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('afternoon')
                    ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Afternoon {shiftCounts.afternoon > 0 && `(${shiftCounts.afternoon})`}
              </button>
              
              <button
                onClick={() => {
                  setSelectedShifts(prev => 
                    prev.includes('night') 
                      ? prev.filter(s => s !== 'night')
                      : [...prev, 'night']
                  );
                }}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedShifts.includes('night')
                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Night {shiftCounts.night > 0 && `(${shiftCounts.night})`}
              </button>
            </div>
          </div>
          
          {/* Today's Breaks List - No container, full width like calendar */}
          <ShiftDashboard 
            initialView="breaks" 
            hideTabSwitcher={true} 
            hideLocationButton={true}
            selectedLocation={selectedLocation}
            renderShiftBadges={true}
            selectedShifts={selectedShifts}
            onShiftCountsChange={setShiftCounts}
          />
          
        </div>
      </div>
      
      {/* Availability Dialog */}
      {selectedDate && (
        <AvailabilityDialog
          date={selectedDate}
          initialData={dayData[format(selectedDate, 'yyyy-MM-dd')]}
          onClose={handleCloseDialog}
          onSave={handleSaveAvailability}
        />
      )}
    </>
  );
} 