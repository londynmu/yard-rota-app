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
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-6 px-4 sm:px-8 overflow-hidden relative text-white flex justify-center">
      {/* Centered Popup Message */}
      {popup.show && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded-lg shadow-xl text-white text-center text-base font-medium
                     backdrop-blur-md border
                     ${popup.type === 'error' ? 'bg-red-600/80 border-red-700' : 'bg-green-600/80 border-green-700'}`}>
           {popup.message}
        </div>
      )}
      
      <div className="w-full max-w-6xl relative">
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-500/40 backdrop-blur-xl text-white border border-red-300/50 rounded-lg shadow-lg">
          {errorMessage}
        </div>
      )}
      
      <div className="backdrop-blur-xl bg-black/60 rounded-xl shadow-2xl overflow-hidden border-2 border-white/30 transition-all hover:shadow-blue-500/20 mb-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20 bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur-md">
          <button
            onClick={handlePreviousMonth}
            className="p-2 rounded-full hover:bg-white/20 transition-all text-white hover:scale-105 active:scale-95"
            aria-label="Previous month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <h2 className="text-2xl font-bold text-white drop-shadow-md">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-full hover:bg-white/20 transition-all text-white hover:scale-105 active:scale-95"
            aria-label="Next month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        {/* Legend */}
        <div className="px-5 py-3 border-b border-white/20 bg-black/40 backdrop-blur-lg">
          <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-white">
            <div className="flex items-center">
              <span className="w-4 h-4 rounded-full bg-green-500/90 mr-2 ring-1 ring-white/30"></span>
              <span>Available</span>
            </div>
            <div className="flex items-center">
              <span className="w-4 h-4 rounded-full bg-red-500/90 mr-2 ring-1 ring-white/30"></span>
              <span>Unavailable</span>
            </div>
            <div className="flex items-center">
              <span className="w-4 h-4 rounded-full bg-blue-500/90 mr-2 ring-1 ring-white/30"></span>
              <span>Holiday</span>
            </div>
          </div>
        </div>
        
        {/* Calendar Grid */}
        <CalendarGrid
          currentDate={currentDate}
          dayData={dayData}
          onDayClick={handleDayClick}
          isLoading={loading}
        />
      </div>
      
      {/* Combined Shift and Break Dashboard */}
      <ShiftDashboard />
      
      {/* Availability Dialog */}
      {selectedDate && (
        <AvailabilityDialog
          date={selectedDate}
          initialData={dayData[format(selectedDate, 'yyyy-MM-dd')]}
          onClose={handleCloseDialog}
          onSave={handleSaveAvailability}
        />
      )}
      </div>
    </div>
  );
} 