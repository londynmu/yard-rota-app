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
  const [activeTab, setActiveTab] = useState('availability'); // 'availability', 'breaks'
  
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
      
      {/* Sticky Tab Navigation - Fixed at top */}
      <div className="fixed top-0 md:top-[73px] left-0 right-0 bg-white z-20 border-b border-gray-300 shadow-md pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Availability Tab Button */}
            <button
              onClick={() => setActiveTab('availability')}
              className={`flex items-center justify-center px-2 py-1.5 rounded-full border-2 text-sm font-semibold shadow-lg transition-colors whitespace-nowrap w-full ${
                activeTab === 'availability'
                  ? 'border-gray-900 bg-gray-800 text-white hover:bg-gray-900'
                  : 'border-gray-400 bg-white text-charcoal hover:bg-gray-100'
              }`}
            >
              Availability
            </button>
            
            {/* Today's Breaks Tab Button */}
            <button
              onClick={() => setActiveTab('breaks')}
              className={`flex items-center justify-center px-2 py-1.5 rounded-full border-2 text-sm font-semibold shadow-lg transition-colors whitespace-nowrap w-full ${
                activeTab === 'breaks'
                  ? 'border-gray-900 bg-gray-800 text-white hover:bg-gray-900'
                  : 'border-gray-400 bg-white text-charcoal hover:bg-gray-100'
              }`}
            >
              Breaks
            </button>
          </div>
        </div>
      </div>
      
      <div className="fixed top-[60px] md:top-[133px] bottom-16 md:bottom-0 left-0 right-0 bg-gray-100 overflow-hidden">
      
      {/* Show Calendar when Availability tab is active */}
      {activeTab === 'availability' && (
        <div className="h-full flex items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg shadow-sm">
                {errorMessage}
              </div>
            )}
            
            <div>
              {/* Calendar Header */}
              <div className="flex items-center justify-between px-4 py-4 mb-4">
                <button
                  onClick={handlePreviousMonth}
                  className="p-2 rounded-lg hover:bg-white/50 transition-colors text-charcoal"
                  aria-label="Previous month"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                
                <h2 className="text-2xl font-bold text-charcoal">
                  {format(currentDate, 'MMMM yyyy')}
                </h2>
                
                <button
                  onClick={handleNextMonth}
                  className="p-2 rounded-lg hover:bg-white/50 transition-colors text-charcoal"
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
            
            {/* Legend - Below Calendar */}
            <div className="mt-4 px-4 py-3">
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
          </div>
        </div>
      )}
      
      {/* Show Breaks when Breaks tab is active */}
      {activeTab === 'breaks' && (
        <div className="h-full overflow-y-auto">
          <div className="pt-4">
            <ShiftDashboard initialView="breaks" hideTabSwitcher={true} />
          </div>
        </div>
      )}
      
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
    </>
  );
} 