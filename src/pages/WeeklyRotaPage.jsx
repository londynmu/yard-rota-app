import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, addDays, subDays, isSameDay, getWeek } from 'date-fns';
import PropTypes from 'prop-types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Utility to get week start on Saturday
const getWeekStart = (date) => {
  const day = date.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 6 ? 0 : (day + 1); // number of days since last Saturday
  return subDays(date, diff);
};

const WeeklyRotaPage = () => {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [dailyRotaData, setDailyRotaData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDayMobile, setExpandedDayMobile] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState('Rugby');
  const [selectedShiftType, setSelectedShiftType] = useState('all');

  // Load last selected location and shift type from localStorage or set defaults
  useEffect(() => {
    const savedLocation = localStorage.getItem('weekly_rota_location') || 'Rugby';
    const savedShiftType = localStorage.getItem('weekly_rota_shift_type') || 'all';
    setSelectedLocation(savedLocation);
    setSelectedShiftType(savedShiftType);
  }, []);

  // Save selected location when it changes
  useEffect(() => {
    localStorage.setItem('weekly_rota_location', selectedLocation);
  }, [selectedLocation]);

  // Save selected shift type when it changes
  useEffect(() => {
    localStorage.setItem('weekly_rota_shift_type', selectedShiftType);
  }, [selectedShiftType]);

  useEffect(() => {
    const fetchFullRota = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const start = format(weekStart, 'yyyy-MM-dd');
        const end = format(addDays(weekStart, 6), 'yyyy-MM-dd');

        // Set up the base query with date range
        let query = supabase
          .from('scheduled_rota')
          .select(`
            id,
            date,
            shift_type,
            location,
            start_time,
            end_time,
            user_id,
            task
          `)
          .gte('date', start)
          .lte('date', end)
          .eq('location', selectedLocation); // Filter by selected location

        // Add shift type filter if a specific shift type is selected
        if (selectedShiftType !== 'all') {
          query = query.eq('shift_type', selectedShiftType);
        }

        const { data: rotaData, error: rotaError } = await query;

        if (rotaError) throw rotaError;

        // 2) Fetch profiles for all unique user_ids in the rota
        const userIds = [...new Set(rotaData.map(r => r.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', userIds);
          if (profilesError) throw profilesError;

          profilesMap = profilesData.reduce((acc, prof) => {
            acc[prof.id] = prof;
            return acc;
          }, {});
        }

        // 3) Attach profile data to each rota entry
        const rotaWithProfiles = rotaData.map(slot => ({
          ...slot,
          profiles: profilesMap[slot.user_id] || null,
        }));

        // 4) Group all fetched slots by date
        const grouped = {};
        rotaWithProfiles.forEach((slot) => {
          if (!grouped[slot.date]) grouped[slot.date] = [];
          grouped[slot.date].push(slot);
        });
        
        // Sort slots within each day with multiple sort criteria:
        // 1. By start_time (earliest first)
        // 2. By end_time (earliest first) if start_times are equal
        // 3. Alphabetically by name if both times are equal
        for (const date in grouped) {
          grouped[date].sort((a, b) => {
            // First sort by start_time
            const startTimeCompare = a.start_time.localeCompare(b.start_time);
            if (startTimeCompare !== 0) return startTimeCompare;
            
            // If start_times are equal, sort by end_time
            const endTimeCompare = a.end_time.localeCompare(b.end_time);
            if (endTimeCompare !== 0) return endTimeCompare;
            
            // If both times are equal, sort alphabetically by name
            const aName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : '';
            const bName = b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : '';
            return aName.localeCompare(bName);
          });
        }
        
        setDailyRotaData(grouped);
      } catch (e) {
        console.error('Error fetching full rota:', e);
        setError(`Failed to load rota: ${e.message || 'Unknown error. Check permissions or connection.'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFullRota();
  }, [weekStart, user, selectedLocation, selectedShiftType]);

  const goPrevWeek = () => {
    setWeekStart((d) => subDays(d, 7));
  };
  
  const goNextWeek = () => {
    setWeekStart((d) => addDays(d, 7));
  };

  // Format time from HH:MM:SS to HH:MM
  const fmtTime = (t) => (t ? t.slice(0, 5) : '');

  // Component to render the details for an expanded day
  const DayDetails = ({ dateStr }) => {
    const daySlots = (dailyRotaData[dateStr] || []).filter(slot => slot.profiles);
    
    // Apply sorting function to ensure employees are properly sorted
    const sortedSlots = [...daySlots].sort((a, b) => {
      // First sort by start_time
      const startTimeCompare = a.start_time.localeCompare(b.start_time);
      if (startTimeCompare !== 0) return startTimeCompare;
      
      // If start_times are equal, sort by end_time
      const endTimeCompare = a.end_time.localeCompare(b.end_time);
      if (endTimeCompare !== 0) return endTimeCompare;
      
      // If both times are equal, sort alphabetically by name
      const aName = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : '';
      const bName = b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : '';
      return aName.localeCompare(bName);
    });
    
    const slotsByShiftType = {
      day: sortedSlots.filter(s => s.shift_type === 'day'),
      afternoon: sortedSlots.filter(s => s.shift_type === 'afternoon'),
      night: sortedSlots.filter(s => s.shift_type === 'night')
    };

    if (daySlots.length === 0) {
      return (
        <div className="p-4 text-center bg-white/5 rounded-lg">
          <p className="text-white/70 text-sm">No shifts scheduled for this day</p>
        </div>
      );
    }

    return (
      <div className="space-y-3 md:space-y-2">
        {Object.entries(slotsByShiftType).map(([shiftType, slots]) => {
          if (slots.length === 0) return null;
          
          // Different styling based on shift type
          const shiftConfig = {
            day: {
              title: "DAY SHIFT",
              bgColor: "bg-amber-100",
              textColor: "text-amber-800",
              borderColor: "border-amber-200",
              gradientFrom: "from-amber-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              )
            },
            afternoon: {
              title: "AFTERNOON SHIFT",
              bgColor: "bg-orange-100",
              textColor: "text-orange-800",
              borderColor: "border-orange-200",
              gradientFrom: "from-orange-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )
            },
            night: {
              title: "NIGHT SHIFT",
              bgColor: "bg-blue-100",
              textColor: "text-blue-800",
              borderColor: "border-blue-200",
              gradientFrom: "from-blue-500/10",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )
            }
          };

          const config = shiftConfig[shiftType];
          
          return (
            <div key={shiftType} className="rounded-lg overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10">
              <div className={`${config.bgColor} ${config.textColor} px-3 py-2 md:py-1.5 flex items-center justify-between`}>
                <div className="flex items-center space-x-2">
                  {config.icon}
                  <h4 className="text-sm md:text-xs font-bold uppercase">{config.title}</h4>
                </div>
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{slots.length}</span>
              </div>
              
              <ul className="divide-y divide-white/10">
                {slots.map((slot) => {
                  const isCurrentUser = slot.user_id === user?.id;
                  return (
                    <li 
                      key={slot.id} 
                      className={`p-3 md:p-2 ${isCurrentUser ? 'bg-amber-500/10 border-l-2 border-l-amber-400' : ''}`}
                    >
                      <div className="flex flex-col">
                        <div className="flex flex-wrap items-start justify-between">
                          <div className="flex flex-wrap items-center space-x-2 break-words w-full">
                            <div className="text-wrap break-words max-w-full">
                              <span className={`font-medium ${isCurrentUser ? 'text-amber-300' : 'text-white'}`}>
                                {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                              </span>
                              {isCurrentUser && (
                                <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full uppercase font-bold">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="inline-flex items-center text-xs text-white/70 bg-white/10 px-2 py-0.5 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {fmtTime(slot.start_time)} - {fmtTime(slot.end_time)}
                          </span>
                          
                          {/* Task Indicator */}
                          {slot.task && (
                            <span className="inline-flex items-center text-xs text-white bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded-full">
                              <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
                              {slot.task}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  DayDetails.propTypes = {
    dateStr: PropTypes.string.isRequired,
  };

  // Dodanie funkcji do udostępniania na WhatsApp
  const shareToWhatsApp = () => {
    // Pobranie daty i lokalizacji
    const dateRange = `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;
    const baseText = `Schedule for ${selectedLocation} (${dateRange}):\n\n`;
    
    // Przygotowanie tekstu do wysłania
    let scheduleText = baseText;
    
    // Grupowanie slotów według dni
    Object.entries(dailyRotaData).forEach(([date, slots]) => {
      const dateObj = new Date(date);
      const dayName = format(dateObj, 'EEEE, MMM d');
      scheduleText += `📅 ${dayName}:\n`;
      
      // Grupowanie slotów według typów zmian
      const daySlots = slots.filter(slot => slot.profiles);
      const slotsByType = {
        day: daySlots.filter(s => s.shift_type === 'day'),
        afternoon: daySlots.filter(s => s.shift_type === 'afternoon'),
        night: daySlots.filter(s => s.shift_type === 'night')
      };
      
      // Dodawanie informacji o zmianach
      Object.entries(slotsByType).forEach(([type, typeSlots]) => {
        if (typeSlots.length > 0) {
          // Określenie emoji dla typu zmiany
          const emoji = type === 'day' ? '☀️' : type === 'afternoon' ? '🌆' : '🌙';
          scheduleText += `${emoji} ${type.toUpperCase()} shift:\n`;
          
          // Dodanie pracowników
          typeSlots.forEach(slot => {
            const name = slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : 'Unknown';
            scheduleText += `- ${name}: ${fmtTime(slot.start_time)} - ${fmtTime(slot.end_time)}${slot.task ? ` (${slot.task})` : ''}\n`;
          });
          scheduleText += '\n';
        }
      });
    });
    
    // Zakodowanie tekstu do URL
    const encodedText = encodeURIComponent(scheduleText);
    
    // Otwarcie WhatsApp Web z przygotowanym tekstem
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
  };

  // Generate PDF and share via WhatsApp
  const generateAndSharePDF = () => {
    try {
      // Create a new PDF document in landscape mode
      const doc = new jsPDF('landscape');
      
      // Add title
      const dateRange = `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;
      const title = `${selectedLocation} Schedule: ${dateRange}`;
      doc.setFontSize(16);
      doc.text(title, 14, 20);
      
      // Add generation timestamp
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 28);
      
      // Group data by day
      const tableData = [];
      
      // Process each day
      Object.entries(dailyRotaData).forEach(([date, slots]) => {
        const dateObj = new Date(date);
        const dayName = format(dateObj, 'EEEE, MMM d');
        
        // Filter and group slots by shift type
        const daySlots = slots.filter(slot => slot.profiles);
        const slotsByType = {
          day: daySlots.filter(s => s.shift_type === 'day'),
          afternoon: daySlots.filter(s => s.shift_type === 'afternoon'),
          night: daySlots.filter(s => s.shift_type === 'night')
        };
        
        // Add day header
        tableData.push([
          { content: `📅 ${dayName}`, colSpan: 4, styles: { 
            fontStyle: 'bold', 
            fillColor: [45, 55, 72], 
            textColor: [255, 255, 255],
            halign: 'center',
            fontSize: 12
          }}
        ]);
        
        // Add shift type headers and rows
        Object.entries(slotsByType).forEach(([type, typeSlots]) => {
          if (typeSlots.length > 0) {
            // Get emoji and styling for shift type
            const getShiftConfig = (type) => {
              if (type === 'day') {
                return { emoji: '☀️', fillColor: [245, 158, 11, 0.2], textColor: [120, 53, 15] };
              } else if (type === 'afternoon') {
                return { emoji: '🌆', fillColor: [249, 115, 22, 0.2], textColor: [154, 52, 18] };
              } else {
                return { emoji: '🌙', fillColor: [59, 130, 246, 0.2], textColor: [30, 64, 175] };
              }
            };
            
            const config = getShiftConfig(type);
            
            // Add shift type header
            tableData.push([
              { content: `${config.emoji} ${type.toUpperCase()} SHIFT`, colSpan: 4, styles: { 
                fontStyle: 'bold', 
                fillColor: config.fillColor, 
                textColor: config.textColor,
                fontSize: 11
              }}
            ]);
            
            // Add column headers
            tableData.push([
              { content: 'Name', styles: { fontStyle: 'bold' } },
              { content: 'Time', styles: { fontStyle: 'bold' } },
              { content: 'Duration', styles: { fontStyle: 'bold' } },
              { content: 'Task', styles: { fontStyle: 'bold' } }
            ]);
            
            // Add employees for this shift type
            typeSlots.forEach(slot => {
              const name = slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : 'Unknown';
              const timeStr = `${fmtTime(slot.start_time)} - ${fmtTime(slot.end_time)}`;
              
              // Calculate shift duration
              const startParts = slot.start_time.split(':');
              const endParts = slot.end_time.split(':');
              let startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
              let endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
              
              // Handle overnight shifts
              if (endMins < startMins) {
                endMins += 24 * 60;
              }
              
              const durationMins = endMins - startMins;
              const hours = Math.floor(durationMins / 60);
              const mins = durationMins % 60;
              const durationStr = `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
              
              tableData.push([
                name,
                timeStr,
                durationStr,
                slot.task || '-'
              ]);
            });
            
            // Add spacer row
            tableData.push([
              { content: '', colSpan: 4, styles: { cellPadding: 2 } }
            ]);
          }
        });
      });
      
      // Generate the table
      autoTable(doc, {
        startY: 35,
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 10,
          cellPadding: 4,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [66, 66, 66],
          textColor: [255, 255, 255]
        },
        columnStyles: {
          0: { cellWidth: 60 },  // Name
          1: { cellWidth: 40 },  // Time
          2: { cellWidth: 30 },  // Duration
          3: { cellWidth: 'auto' } // Task
        },
        didParseCell: function(data) {
          // Apply colSpan for header cells
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.colSpan) {
            data.cell.colSpan = data.cell.raw.colSpan;
            if (data.cell.raw.styles) {
              Object.assign(data.cell.styles, data.cell.raw.styles);
            }
          }
        },
        didDrawPage: function(data) {
          // Add header on each page
          doc.setFontSize(16);
          doc.text(title, 14, 20);
          doc.setFontSize(10);
          doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 28);
          
          // Add footer with page number
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, pageSize.width / 2, pageHeight - 10, { align: 'center' });
        }
      });
      
      // Generate filename
      const fileName = `${selectedLocation}_Schedule_${format(weekStart, 'yyyy-MM-dd')}.pdf`;
      
      // Save the PDF file to the user's device
      doc.save(fileName);
      
      // Show confirmation and offer to share via WhatsApp
      setTimeout(() => {
        if (confirm(`PDF downloaded as "${fileName}". Would you like to share it via WhatsApp?`)) {
          // Create a simple message with date range to share via WhatsApp
          const message = encodeURIComponent(`Schedule for ${selectedLocation} (${dateRange}). Please see the PDF I've just sent you separately.`);
          window.open(`https://wa.me/?text=${message}`, '_blank');
        }
      }, 1000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-blue-900">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-4" />
          <p className="text-white text-lg">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-blue-900 text-white">
        <div className="bg-red-900/40 backdrop-blur-xl p-6 rounded-xl border border-red-500/30 max-w-md">
          <h3 className="text-xl font-semibold mb-4 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Error Loading Rota
          </h3>
          <p className="mb-6 text-white/80">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 bg-red-700/40 hover:bg-red-700/60 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-blue-900">
      {/* Week Navigation */}
      <div className="bg-black/40 sticky top-0 z-20 backdrop-blur-lg border-b border-white/10 shadow-lg">
        <div className="container mx-auto px-4 py-3 md:py-4">
          {/* Week Navigation z zintegrowanym przełącznikiem lokalizacji */}
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-2 md:space-x-6">
              {/* Previous week button */}
              <button
                onClick={goPrevWeek}
                className="h-9 w-9 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors rounded-full focus:outline-none"
                aria-label="Previous week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              {/* Week indicator */}
              <div className="bg-white/5 px-4 py-1.5 rounded-full text-white font-semibold text-base">
                Week {getWeek(weekStart)}
              </div>
              
              {/* Date range - hidden on small screens */}
              <span className="text-white/70 text-sm hidden sm:inline">
                {format(weekStart, 'MMMM d')} - {format(addDays(weekStart, 6), 'MMMM d, yyyy')}
              </span>
              
              {/* Next week button */}
              <button
                onClick={goNextWeek}
                className="h-9 w-9 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors rounded-full focus:outline-none"
                aria-label="Next week"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              
              {/* Location Tabs - widoczne zarówno na mobilce jak i desktop */}
              <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
                <button
                  onClick={() => setSelectedLocation('Rugby')}
                  className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition ${
                    selectedLocation === 'Rugby'
                      ? 'bg-blue-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Rugby
                </button>
                <button
                  onClick={() => setSelectedLocation('NRC')}
                  className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition ${
                    selectedLocation === 'NRC'
                      ? 'bg-blue-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  NRC
                </button>
              </div>
              
              {/* Shift Type Filter Tabs - DESKTOP ONLY */}
              <div className="hidden md:flex bg-white/5 rounded-full p-1 border border-white/10 ml-6">
                <button
                  onClick={() => setSelectedShiftType('all')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    selectedShiftType === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  All Shifts
                </button>
                <button
                  onClick={() => setSelectedShiftType('day')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center ${
                    selectedShiftType === 'day'
                      ? 'bg-amber-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                  Day
                </button>
                <button
                  onClick={() => setSelectedShiftType('afternoon')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center ${
                    selectedShiftType === 'afternoon'
                      ? 'bg-orange-600 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.061 1.06l1.06 1.06z" />
                  </svg>
                  Afternoon
                </button>
                <button
                  onClick={() => setSelectedShiftType('night')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center ${
                    selectedShiftType === 'night'
                      ? 'bg-blue-700 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                  Night
                </button>
              </div>
              
              {/* Share Buttons - DESKTOP ONLY */}
              <div className="hidden md:flex items-center ml-4 space-x-2">
                {/* WhatsApp Text Share Button */}
                <button
                  onClick={shareToWhatsApp}
                  className="flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full transition"
                  aria-label="Share to WhatsApp as Text"
                  title="Share as Text"
                >
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 01-1.516-5.26c0-5.445 4.455-9.885 9.942-9.885a9.865 9.865 0 017.021 2.91 9.788 9.788 0 012.909 6.99c-.004 5.444-4.46 9.885-9.935 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" />
                  </svg>
                  <span className="text-sm font-medium">Text</span>
                </button>
                
                {/* PDF Download Button - Completely remade */}
                <button
                  onClick={generateAndSharePDF}
                  className="flex items-center px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition"
                  aria-label="Download PDF"
                  title="Download PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 2a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 6.095 0 7.555 0 9.318 0 11.366 1.708 13 3.781 13h8.906C14.502 13 16 11.57 16 9.773c0-1.636-1.242-2.969-2.834-3.194C12.923 3.999 10.69 2 8 2zm2.354 6.854-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 9.293V5.5a.5.5 0 0 1 1 0v3.793l1.146-1.147a.5.5 0 0 1 .708.708z"/>
                  </svg>
                  <span className="text-sm font-medium">Download PDF</span>
                </button>
              </div>
              
              {/* Mobile Share Button - Only shows on mobile */}
              <div className="md:hidden ml-2">
                <button
                  onClick={() => {
                    // Show simple modal on mobile with share options
                    const share = confirm("Choose sharing method:\n\n- OK for Text format\n- Cancel for PDF format");
                    if (share) {
                      shareToWhatsApp();
                    } else {
                      generateAndSharePDF();
                    }
                  }}
                  className="flex items-center justify-center w-9 h-9 bg-green-600 text-white rounded-full"
                  aria-label="Share"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        {/* Week Grid - zmniejszenie odstępów na większych ekranach */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 md:gap-2 mt-2">
          {/* Generate 7 days starting from weekStart */}
          {Array.from({ length: 7 }).map((_, index) => {
            const dateObj = addDays(weekStart, index);
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            const isWeekend = [0, 6].includes(dateObj.getDay()); // Sunday (0) or Saturday (6)
            const isToday = isSameDay(dateObj, new Date());
            
            // Check if the current user has shifts on this day
            const dayData = dailyRotaData[dateStr] || [];
            const userHasShift = dayData.some(slot => slot.user_id === user?.id);
            
            // Determine if this day should be expanded on mobile
            const isExpanded = expandedDayMobile === dateStr;
            
            const handleHeaderClick = () => {
              // Toggle expanded state on mobile
              if (expandedDayMobile === dateStr) {
                setExpandedDayMobile(null);
              } else {
                setExpandedDayMobile(dateStr);
              }
            };
            
            return (
              <div
                key={dateStr}
                className={`
                  bg-white/5 
                  backdrop-blur-sm 
                  rounded-xl 
                  shadow-xl
                  overflow-hidden
                  border border-white/10
                  transition-all duration-200
                  ${isToday ? 'ring-2 ring-blue-400' : ''} 
                  ${isWeekend ? 'bg-gradient-to-br from-purple-900/20 to-black/40' : ''}
                  ${userHasShift ? 'border-l-2 border-l-amber-400' : ''}
                  relative
                `}
              >
                {/* Day Header - Sticky on mobile */}
                <div 
                  className={`
                    relative
                    p-3 md:p-2
                    border-b border-white/10 
                    bg-gradient-to-r from-gray-800/80 to-gray-900/80
                    cursor-pointer
                    flex items-center justify-between
                    backdrop-blur-md
                    sticky top-0 z-10
                    ${userHasShift ? 'bg-gradient-to-r from-amber-900/40 to-gray-900/80' : ''}
                    ${isToday ? 'from-blue-900/40' : ''}
                  `}
                  onClick={handleHeaderClick}
                >
                  <div className="flex items-center space-x-3 md:space-x-2">
                    <div className={`
                      w-11 h-11 md:w-9 md:h-9
                      rounded-full 
                      flex-shrink-0 
                      flex flex-col items-center justify-center
                      bg-gradient-to-br from-white/10 to-white/5
                      border border-white/20
                      ${isToday ? 'bg-blue-500 border-blue-400 text-white' : 'text-white/90'}
                    `}>
                      <span className="text-base md:text-sm font-bold leading-none">{format(dateObj, 'dd')}</span>
                      <span className="text-[8px] opacity-70">{format(dateObj, 'MMM')}</span>
                    </div>
                    
                    <div>
                      <h3 className="text-base md:text-sm font-bold text-white leading-tight">
                        {format(dateObj, 'EEEE')}
                      </h3>
                      
                      {dayData.length > 0 ? (
                        <div className="flex space-x-2 mt-0.5">
                          {/* Calculate shift counts */}
                          {(() => {
                            // Filter out shifts without assigned profiles (like deleted users)
                            const filteredDayData = dayData.filter(slot => slot.profiles);
                            
                            const shiftCounts = {
                              day: filteredDayData.filter(s => s.shift_type === 'day').length,
                              afternoon: filteredDayData.filter(s => s.shift_type === 'afternoon').length,
                              night: filteredDayData.filter(s => s.shift_type === 'night').length
                            };
                            
                            return (
                              <>
                                {shiftCounts.day > 0 && (
                                  <span className="inline-flex items-center text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                    </svg>
                                    {shiftCounts.day}
                                  </span>
                                )}
                                
                                {shiftCounts.afternoon > 0 && (
                                  <span className="inline-flex items-center text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                    </svg>
                                    {shiftCounts.afternoon}
                                  </span>
                                )}
                                
                                {shiftCounts.night > 0 && (
                                  <span className="inline-flex items-center text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                    </svg>
                                    {shiftCounts.night}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-white/50">No shifts scheduled</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Expand/Collapse button - only on mobile */}
                  <div className="md:hidden">
                    <div className={`
                      w-8 h-8 
                      flex items-center justify-center 
                      rounded-full 
                      bg-white/10 
                      transition-colors 
                      hover:bg-white/20
                    `}>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-5 w-5 text-white/80 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Mobile: Conditionally visible details area with transition */}
                <div className={`transition-all duration-300 ease-in-out overflow-auto md:hidden
                  ${isExpanded ? 'max-h-[75vh] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="p-3">
                    <DayDetails dateStr={dateStr} />
                  </div>
                </div>

                {/* Desktop: Always visible details area */}
                <div className="hidden md:block p-3 md:p-2">
                  <DayDetails dateStr={dateStr} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeeklyRotaPage; 