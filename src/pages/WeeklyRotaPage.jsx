import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { format, addDays, subDays, isSameDay, getWeek } from 'date-fns';
import PropTypes from 'prop-types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [selectedShiftType, setSelectedShiftType] = useState(() => {
    const savedShift = localStorage.getItem('weekly_rota_shift_type');
    return savedShift || 'all';
  });
  const [locations, setLocations] = useState([]);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState({ fileName: '', dateRange: '' });
  const [showShareOptionsModal, setShowShareOptionsModal] = useState(false);
  const dayRefs = useRef({});
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);

  // After changing expanded day on mobile, align the selected day just below the sticky header
  // When closing (expandedDayMobile becomes null), scroll back to top
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    
    // If closing expanded day (null), scroll to top
    if (!expandedDayMobile) {
      const timer = setTimeout(() => {
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch {
          window.scrollTo(0, 0);
        }
      }, 360);
      return () => clearTimeout(timer);
    }
    
    // If opening a day, scroll to it
    const el = dayRefs.current[expandedDayMobile];
    if (!el) return;
    
    const nav = document.getElementById('weekly-top-nav');
    const headerHeight = nav ? nav.getBoundingClientRect().height : 64;
    const scrollToTarget = () => {
      const rect = el.getBoundingClientRect();
      const extraGap = 8;
      const targetY = Math.max(0, window.scrollY + rect.top - headerHeight - extraGap);
      try {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      } catch {
        window.scrollTo(0, targetY);
      }
    };
    const timer = setTimeout(scrollToTarget, 360);
    return () => clearTimeout(timer);
  }, [expandedDayMobile]);

  // Fetch available locations from database
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setLocations(data);
          
          // Set saved location or first location as default
          const savedLocation = localStorage.getItem('weekly_rota_location');
          if (savedLocation && data.some(loc => loc.name === savedLocation)) {
            setSelectedLocation(savedLocation);
          } else if (!selectedLocation || selectedLocation === 'Rugby') {
            setSelectedLocation(data[0].name);
          }
        } else {
          // Fallback to Rugby, NRC if no locations in database
          setLocations([
            { id: '1', name: 'Rugby' },
            { id: '2', name: 'NRC' },
            { id: '3', name: 'Nuneaton' }
          ]);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        // Fallback locations
        setLocations([
          { id: '1', name: 'Rugby' },
          { id: '2', name: 'NRC' },
          { id: '3', name: 'Nuneaton' }
        ]);
      }
    };

    fetchLocations();
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

        // Set up the base query with date range and location
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
          .eq('location', selectedLocation);

        // Add shift type filter if not 'all'
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

        // Debug: Check for duplicates
        console.log('[WeeklyRotaPage] Total slots fetched:', rotaWithProfiles.length);
        
        // DEDUPLICATE: Remove duplicate entries (same user_id, date, start_time, end_time)
        const uniqueSlots = [];
        const seenKeys = new Set();
        
        rotaWithProfiles.forEach(slot => {
          // Create unique key from user_id, date, start_time, end_time
          const key = `${slot.user_id}-${slot.date}-${slot.start_time}-${slot.end_time}`;
          
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueSlots.push(slot);
          } else {
            console.warn('[WeeklyRotaPage] Duplicate slot removed:', {
              name: slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : 'Unknown',
              date: slot.date,
              time: `${slot.start_time} - ${slot.end_time}`,
              id: slot.id
            });
          }
        });

        console.log('[WeeklyRotaPage] Slots after deduplication:', uniqueSlots.length);

        // 4) Group all fetched slots by date
        const grouped = {};
        uniqueSlots.forEach((slot) => {
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

  // Week navigation handled via dropdown menu actions

  // Format time from HH:MM:SS to HH:MM
  const fmtTime = (t) => (t ? t.slice(0, 5) : '');
  // Start time badge styling per shift type (mobile-first)
  const getStartBadgeStyle = (shiftType) => {
    switch (shiftType) {
      case 'day':
        return { container: 'bg-amber-50 border-amber-300 text-amber-800', icon: 'text-amber-600' };
      case 'afternoon':
        return { container: 'bg-orange-50 border-orange-300 text-orange-800', icon: 'text-orange-600' };
      case 'night':
        return { container: 'bg-blue-50 border-blue-300 text-blue-800', icon: 'text-blue-600' };
      default:
        return { container: 'bg-white border-gray-300 text-charcoal', icon: 'text-gray-600' };
    }
  };
  // All buttons are black like on Breaks page
  const getShiftTriggerClasses = () => {
    return 'bg-gray-800 border-gray-900 text-white hover:bg-gray-900';
  };

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
        <div className="p-4 text-center bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-gray-600 text-sm">No shifts scheduled for this day</p>
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
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )
            }
          };

          const config = shiftConfig[shiftType];
          
          return (
            <div key={shiftType} className="mt-3 first:mt-0">
              <div className={`${config.bgColor} ${config.textColor} px-3 py-1.5 flex items-center justify-between rounded-md`}>
                <div className="flex items-center space-x-2">
                  {config.icon}
                  <h4 className="text-sm md:text-xs font-bold uppercase">{config.title}</h4>
                </div>
                <span className="bg-white text-charcoal text-xs px-2 py-0.5 rounded-full border border-gray-300">{slots.length}</span>
              </div>
              
              <ul className="divide-y divide-gray-200 bg-white rounded-md">
                {slots.map((slot, slotIndex) => {
                  const isCurrentUser = slot.user_id === user?.id;
                  return (
                    <motion.li 
                      key={slot.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ 
                        duration: 0.3, 
                        delay: slotIndex * 0.03,
                        ease: 'easeOut'
                      }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-2 md:p-2 ${isCurrentUser ? 'bg-amber-50 border-l-2 border-l-amber-500' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <div className="text-wrap break-words max-w-full">
                            <span className={`text-[15px] md:text-base font-bold ${isCurrentUser ? 'text-amber-700' : 'text-charcoal'}`}>
                              {slot.profiles?.first_name || ''} {slot.profiles?.last_name || 'Unknown User'}
                            </span>
                            {isCurrentUser && (
                              <span className="ml-2 text-[10px] bg-amber-500 text-charcoal px-1.5 py-0.5 rounded-full uppercase font-bold">
                                You
                              </span>
                            )}
                          </div>
                          
                          {(() => {
                            const style = getStartBadgeStyle(slot.shift_type);
                            return (
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold border ${style.container}`}>
                                {slot.shift_type === 'day' ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1.5 ${style.icon}`} viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1.5 ${style.icon}`} viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                  </svg>
                                )}
                                <span className="leading-none">{fmtTime(slot.start_time)}</span>
                              </span>
                            );
                          })()}
                        </div>
                        
                          {/* Task Indicator */}
                          {slot.task && (
                            <span className="inline-flex items-center text-xs text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
                              <span className="w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
                              {slot.task}
                            </span>
                          )}
                        </div>
                    </motion.li>
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
      // Create new PDF document (A4 landscape - jak w ExportRota.jsx)
      const doc = new jsPDF('landscape');

      // Format date range for title (taki sam format jak w ExportRota.jsx)
      const dateRange = `${format(weekStart, 'dd/MM/yyyy')} - ${format(addDays(weekStart, 6), 'dd/MM/yyyy')}`;
      const title = `Weekly Schedule: ${dateRange}`;
      
      // Add title
      doc.setFontSize(14);
      doc.text(title, 14, 20);
      
      // Add generation timestamp
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);

      // Rysuję prostokąt z informacją o lokalizacji
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(14, 32, 100, 10, 1, 1, 'F');
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(`Location: ${selectedLocation}`, 18, 39);
      doc.setTextColor(0, 0, 0);

      // Prepare dates array for column headers - taki sam format jak w ExportRota.jsx
      const dates = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return {
          day: format(date, 'EEEE'),
          date: format(date, 'dd/MM/yyyy'),
          dayOfMonth: format(date, 'dd/MM/yyyy')
        };
      });
      
      // Create column headers
      const tableColumn = ['Name'];
      dates.forEach(d => {
        // Bardziej wyraźny format nagłówka kolumny
        tableColumn.push({
          content: d.day,
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            cellWidth: 'wrap'
          }
        });
      });
      
      // Group all employees from all days - najpierw zbieramy wszystkich pracowników
      const employeesMap = {}; // key: user_id, value: {name, shifts: {date: [shift]}}
      
      // Collect all employees and their shifts across all days
      Object.entries(dailyRotaData).forEach(([date, slots]) => {
        const filteredSlots = slots.filter(slot => slot.profiles);
        
        filteredSlots.forEach(slot => {
          const userId = slot.user_id;
          const name = slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : 'Unknown';
          
          if (!employeesMap[userId]) {
            employeesMap[userId] = {
              name,
              shifts: {}
            };
          }
          
          if (!employeesMap[userId].shifts[date]) {
            employeesMap[userId].shifts[date] = [];
          }
          
          employeesMap[userId].shifts[date].push({
            start_time: slot.start_time,
            end_time: slot.end_time,
            shift_type: slot.shift_type,
            task: slot.task
          });
        });
      });
      
      // Convert to array and sort by name alphabetically
      const employees = Object.values(employeesMap).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      // Prepare table data with location header
      const tableData = [];
      
      // Add employee rows
      employees.forEach(employee => {
        const row = [employee.name];
        
        // For each day of the week, add shift info
        dates.forEach((dateInfo, index) => {
          const currentDate = format(addDays(weekStart, index), 'yyyy-MM-dd');
          const shiftsForDay = employee.shifts[currentDate] || [];
          
          if (shiftsForDay.length === 0) {
            row.push(''); // No shift on this day
          } else {
            // Format shifts info, sorted by start time
            const shiftsText = shiftsForDay
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map(shift => {
                // Bardzo prosty format - tylko godziny bez oznaczeń pory dnia
                let shiftInfo = `${fmtTime(shift.start_time)}-${fmtTime(shift.end_time)}`;
                
                // Dodaj zadanie na nowej linii, jeśli istnieje
                if (shift.task) {
                  shiftInfo += `\n${shift.task}`;
                }
                
                return shiftInfo;
              })
              .join('\n');
              
            row.push(shiftsText);
          }
        });
        
        tableData.push(row);
      });
      
      // Generate the table
      autoTable(doc, {
        startY: 44, // Table headers start at Y=44
        head: [tableColumn],
        foot: [tableColumn], // Powtarzaj nagłówki na dole każdej strony
        body: tableData,
        theme: 'grid',
        styles: { 
          overflow: 'linebreak', 
          fontSize: 7,  // Mniejsza czcionka, aby tekst nie wychodził poza komórki
          cellPadding: 1,
          lineColor: [210, 210, 210],
          lineWidth: 0.1,
          valign: 'middle'
        },
        headStyles: { 
          fillColor: [50, 50, 80], // Ciemniejszy niebieski - bardziej zgodny z przykładem
          textColor: [255, 255, 255],
          halign: 'center',
          fontStyle: 'bold',
          cellPadding: 3
        },
        footStyles: {
          fillColor: [50, 50, 80],
          textColor: [255, 255, 255],
          halign: 'center',
          fontStyle: 'bold',
          cellPadding: 1
        },
        columnStyles: {
          0: { cellWidth: 35 }, // Name column - węższa kolumna z nazwiskami
          // Remaining columns (days) have equal width
        },
        alternateRowStyles: {
          fillColor: [240, 240, 250] // Jaśniejszy niebieski dla alternatywnych wierszy
        },
        rowPageBreak: 'avoid', // Avoid breaking rows across pages
        bodyStyles: {
          minCellHeight: 10,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        margin: { top: 44, right: 10, bottom: 10, left: 10 }, // Ensure table respects this top margin
        didParseCell: function(data) {
          // Apply colSpan for header cells
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.colSpan) {
            data.cell.colSpan = data.cell.raw.colSpan;
            if (data.cell.raw.styles) {
              Object.assign(data.cell.styles, data.cell.raw.styles);
            }
          }
          
          // For location headers, also set pageBreak to 'before'
          if (data.cell.raw && 
              typeof data.cell.raw === 'object' && 
              data.cell.raw.colSpan && 
              data.row.index > 0 && 
              data.row.section === 'body') {
            data.row.pageBreak = 'before';
          }
          
          // Formatowanie komórek (zastępuje createdCell)
          // Dla kolumn z dniami tygodnia (nie dla kolumny z nazwiskami)
          if (data.column.index > 0) {
            // Upewnij się, że tekst nie wychodzi poza komórkę
            data.cell.styles.cellWidth = 'wrap';
            data.cell.styles.cellPadding = 1;
            // Wyśrodkuj tekst w komórkach z datami
            data.cell.styles.halign = 'center';
          }
          
          // Dla kolumny z nazwiskami
          if (data.column.index === 0 && data.section === 'body') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.halign = 'left';
          }
        },
        willDrawCell: function(data) {
          // If a row contains an employee name, ensure all cells for this employee are on the same page
          if (data.row.section === 'body' && 
              data.column.index === 0 && 
              data.cell.text && 
              typeof data.cell.text === 'string' &&
              !data.cell.raw?.colSpan) { // Not a location header
                
            // If there's not enough space for the entire row, start from a new page
            if (data.cursor.y > doc.internal.pageSize.height - 50) {
              data.cursor.y = data.cursor.y + data.cursor.y / 2;
            }
          }
        },
        didDrawCell: function(data) {
          if (data.section === 'head' && data.column.index > 0) {
            const dayIndex = data.column.index - 1;
            if (dayIndex >= 0 && dayIndex < dates.length) {
              const dateStr = dates[dayIndex].dayOfMonth;
              
              // Pozycja dla daty (pod nagłówkiem)
              const x = data.cell.x + data.cell.width / 2;
              const y = data.cell.y + data.cell.height - 2;
              
              // Dodaj datę pod nagłówkiem dnia tygodnia
              doc.setFontSize(6);
              doc.setTextColor(0, 0, 0);
              doc.text(dateStr, x, y, {
                align: 'center'
              });
            }
          }
        },
        didDrawPage: function(data) {
          // Add header on each page
          doc.setFontSize(14);
          doc.text(title, 14, 20);
          doc.setFontSize(10);
          doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
          
          // Rysuję prostokąt z informacją o lokalizacji
          doc.setFillColor(240, 240, 240);
          doc.roundedRect(14, 32, 100, 10, 1, 1, 'F');
          doc.setFontSize(11);
          doc.setTextColor(40, 40, 40);
          doc.text(`Location: ${selectedLocation}`, 18, 39);
          doc.setTextColor(0, 0, 0);
          
          // Add footer with page number
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          
          // Get the total number of pages
          const totalPages = doc.getNumberOfPages();
          doc.text(`Page ${data.pageNumber} of ${totalPages}`, pageSize.width / 2, pageHeight - 10, { align: 'center' });
        }
      });
      
      // Generate filename
      const fileName = `${selectedLocation}_Schedule_${format(weekStart, 'yyyy-MM-dd')}.pdf`;
      
      // Save the PDF file to the user's device
      try {
        doc.save(fileName);
      } catch (error) {
        console.error('PDF save failed:', error);
        alert('Failed to save PDF. Please try again.');
        return; // Stop execution to prevent showing modal for failed download
      }
      
      // Show custom modal instead of browser confirm
      setDownloadedFile({
        fileName,
        dateRange
      });
      setShowDownloadModal(true);
      
    } catch (err) {
      console.error('Error generating PDF:', err.message || err);
      alert(`Failed to generate PDF: ${err.message || 'Unknown error'}. Please try again.`);
    }
  };

  // Funkcja do udostępniania przez WhatsApp po pobraniu pliku
  const shareAfterDownload = () => {
    const message = encodeURIComponent(`Schedule for ${selectedLocation} (${downloadedFile.dateRange}). Please see the PDF I've just sent you separately.`);
    window.open(`https://wa.me/?text=${message}`, '_blank');
    setShowDownloadModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black mb-4" />
          <p className="text-gray-900 text-lg font-semibold">Loading your schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-6 rounded-xl border-2 border-gray-300 max-w-md shadow-xl">
          <h3 className="text-xl font-semibold mb-4 flex items-center text-charcoal">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-red-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Error Loading Rota
          </h3>
          <p className="mb-6 text-gray-600">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="flex-1 bg-black hover:bg-gray-900 px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center text-white shadow-md"
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
    <div className="min-h-screen bg-gray-100">
      {/* Week Navigation - Same style as Breaks */}
      <div id="weekly-top-nav" className="bg-white sticky top-0 z-20 border-b border-gray-300 shadow-md pt-safe">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Week Button */}
            <motion.button
              onClick={() => setShowWeekModal(true)}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              Week {getWeek(weekStart)}
            </motion.button>
            
            {/* Location Button */}
            <motion.button
              onClick={() => setShowLocationModal(true)}
              whileTap={{ scale: 0.95 }}
              className="flex items-center justify-center px-2 py-1.5 rounded-full border-2 border-gray-900 bg-gray-800 text-white text-sm font-semibold shadow-lg hover:bg-gray-900 transition-colors whitespace-nowrap w-full"
            >
              {selectedLocation || 'Hub'}
            </motion.button>
            
            {/* Shift Button */}
            <motion.button
              onClick={() => setShowShiftModal(true)}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center justify-center px-2 py-1.5 rounded-full border-2 text-sm font-semibold shadow-lg transition-colors whitespace-nowrap w-full ${getShiftTriggerClasses()}`}
            >
              {selectedShiftType === 'all' ? 'All'
                : selectedShiftType === 'day' ? 'Day'
                : selectedShiftType === 'afternoon' ? 'Afternoon'
                : 'Night'}
            </motion.button>
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
              // Toggle expanded state on mobile; scrolling handled in useEffect after state update
              if (expandedDayMobile === dateStr) {
                setExpandedDayMobile(null);
              } else {
                setExpandedDayMobile(dateStr);
              }
            };
            
            return (
              <motion.div
                key={dateStr}
                initial={{ opacity: 0, y: 20 }}
                animate={isToday ? {
                  opacity: 1,
                  y: 0,
                  boxShadow: [
                    '0 0 0 0 rgba(234, 88, 12, 0.7)',
                    '0 0 0 10px rgba(234, 88, 12, 0)',
                    '0 0 0 0 rgba(234, 88, 12, 0)'
                  ]
                } : { opacity: 1, y: 0 }}
                transition={isToday ? {
                  opacity: { duration: 0.4, delay: index * 0.05 },
                  y: { duration: 0.4, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] },
                  boxShadow: { duration: 2, repeat: Infinity, ease: "easeOut" }
                } : {
                  duration: 0.4,
                  delay: index * 0.05,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`
                  bg-white
                  rounded-xl 
                  shadow-lg
                  overflow-hidden
                  border-2 border-gray-300
                  ${isToday ? 'ring-2 ring-orange-600 border-orange-500' : ''} 
                  ${isWeekend ? 'bg-gray-50' : ''}
                  ${userHasShift ? 'border-l-4 border-l-orange-600' : ''}
                  relative
                  scroll-mt-28 md:scroll-mt-32
                `}
                ref={(el) => { dayRefs.current[dateStr] = el; }}
              >
                {/* Day Header - Sticky on mobile */}
                <div 
                  className={`
                    relative
                    p-3 md:p-2
                    border-b-2 border-gray-300
                    bg-gray-100
                    cursor-pointer
                    flex items-center justify-between
                    sticky top-0 z-10
                    ${userHasShift ? 'bg-orange-50' : ''}
                    ${isToday ? 'bg-orange-100' : ''}
                  `}
                  onClick={handleHeaderClick}
                >
                  {/* Left side: Date circle + Day name */}
                  <div className="flex items-center space-x-3 md:space-x-2">
                    <div className={`
                      w-11 h-11 md:w-9 md:h-9
                      rounded-full 
                      flex-shrink-0 
                      flex flex-col items-center justify-center
                      border-2 border-gray-400
                      ${isToday ? 'bg-orange-600 border-orange-700 shadow-md' : 'bg-white'}
                    `}>
                      <span className={`text-base md:text-sm font-extrabold leading-none ${isToday ? '!text-white' : 'text-charcoal'}`}>{format(dateObj, 'dd')}</span>
                      <span className={`text-[8px] ${isToday ? '!text-white !opacity-90' : 'text-charcoal opacity-70'}`}>{format(dateObj, 'MMM')}</span>
                    </div>
                    
                    <h3 className="text-base md:text-sm font-bold text-charcoal leading-tight">
                      {format(dateObj, 'EEEE')}
                    </h3>
                  </div>
                  
                  {/* Right side: Shift badges stacked vertically + Expand button */}
                  <div className="flex items-center gap-2">
                    {/* Shift count badges - stacked vertically */}
                    {dayData.length > 0 ? (
                      <div className="flex flex-col gap-1">
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
                                <motion.span
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                                  className="inline-flex items-center text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                  </svg>
                                  {shiftCounts.day}
                                </motion.span>
                              )}
                              
                              {shiftCounts.afternoon > 0 && (
                                <motion.span
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
                                  className="inline-flex items-center text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded-full border border-orange-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                  </svg>
                                  {shiftCounts.afternoon}
                                </motion.span>
                              )}
                              
                              {shiftCounts.night > 0 && (
                                <motion.span
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                                  className="inline-flex items-center text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full border border-blue-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                  </svg>
                                  {shiftCounts.night}
                                </motion.span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : null}
                    
                    {/* Expand/Collapse button - only on mobile */}
                    <div className="md:hidden">
                      <motion.div
                        whileTap={{ scale: 0.9 }}
                        className={`
                          w-8 h-8 
                          flex items-center justify-center 
                          rounded-full 
                          bg-white
                          border-2 border-gray-400
                          transition-colors 
                          hover:bg-gray-100
                          shadow-sm
                        `}
                      >
                        <motion.svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-5 w-5 text-gray-900" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </motion.svg>
                      </motion.div>
                    </div>
                  </div>
                </div>
                
                {/* Mobile: Conditionally visible details area with transition */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="overflow-auto md:hidden"
                    >
                      <div className="p-3">
                        <DayDetails dateStr={dateStr} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Desktop: Always visible details area */}
                <div className="hidden md:block p-3 md:p-2">
                  <DayDetails dateStr={dateStr} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Week Selection Modal */}
      {showWeekModal && createPortal(
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-xl shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-charcoal">Select Week</h3>
              <button
                onClick={() => setShowWeekModal(false)}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setWeekStart(addDays(weekStart, -7));
                  setShowWeekModal(false);
                }}
                className="w-full px-4 py-3 rounded-lg text-charcoal hover:bg-gray-100 font-medium border-2 border-gray-300 transition-colors"
              >
                Previous Week
              </button>
              <button
                onClick={() => {
                  setWeekStart(getWeekStart(new Date()));
                  setShowWeekModal(false);
                }}
                className="w-full px-4 py-3 rounded-lg text-white bg-orange-600 hover:bg-orange-700 font-semibold border-2 border-orange-700 transition-colors"
              >
                Current Week
              </button>
              <button
                onClick={() => {
                  setWeekStart(addDays(weekStart, 7));
                  setShowWeekModal(false);
                }}
                className="w-full px-4 py-3 rounded-lg text-charcoal hover:bg-gray-100 font-medium border-2 border-gray-300 transition-colors"
              >
                Next Week
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {/* Location Selection Modal */}
      {showLocationModal && createPortal(
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-xl shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full max-h-[80vh] flex flex-col"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-charcoal">Select Location</h3>
              <button
                onClick={() => setShowLocationModal(false)}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto">
              {locations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    setSelectedLocation(loc.name);
                    setShowLocationModal(false);
                  }}
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
          </motion.div>
        </motion.div>,
        document.body
      )}

      {/* Shift Type Selection Modal - Same as Breaks */}
      {showShiftModal && createPortal(
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-xl shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-charcoal">Select Shift Type</h3>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setSelectedShiftType('all');
                  setShowShiftModal(false);
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                  selectedShiftType === 'all'
                    ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                    : 'text-charcoal hover:bg-gray-100 border-gray-300'
                }`}
              >
                All Shifts
              </button>
              <button
                onClick={() => {
                  setSelectedShiftType('day');
                  setShowShiftModal(false);
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                  selectedShiftType === 'day'
                    ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                    : 'text-charcoal hover:bg-gray-100 border-gray-300'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => {
                  setSelectedShiftType('afternoon');
                  setShowShiftModal(false);
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                  selectedShiftType === 'afternoon'
                    ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                    : 'text-charcoal hover:bg-gray-100 border-gray-300'
                }`}
              >
                Afternoon
              </button>
              <button
                onClick={() => {
                  setSelectedShiftType('night');
                  setShowShiftModal(false);
                }}
                className={`w-full px-4 py-3 rounded-lg font-semibold border-2 transition-colors ${
                  selectedShiftType === 'night'
                    ? 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700'
                    : 'text-charcoal hover:bg-gray-100 border-gray-300'
                }`}
              >
                Night
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {/* Share Options Modal - Dark Modern Premium Style */}
      {showShareOptionsModal && createPortal(
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-lg shadow-2xl border-2 border-gray-400 p-6 max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-charcoal mb-4">Choose Sharing Method</h3>
            <p className="text-gray-600 mb-6 text-sm">How would you like to share the schedule?</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  shareToWhatsApp();
                  setShowShareOptionsModal(false);
                }}
                className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-md transition-all duration-150 ease-in-out"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 01-1.516-5.26c0-5.445 4.455-9.885 9.942-9.885a9.865 9.865 0 017.021 2.91 9.788 9.788 0 012.909 6.99c-.004 5.444-4.46 9.885-9.935 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" />
                </svg>
                Text Format (WhatsApp)
              </button>
              <button
                onClick={() => {
                  generateAndSharePDF(); // This function already handles showing its own modal
                  setShowShareOptionsModal(false);
                }}
                className="w-full flex items-center justify-center px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold shadow-md transition-all duration-150 ease-in-out"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 2a5.53 5.53 0 0 0-3.594 1.342c-.766.66-1.321 1.52-1.464 2.383C1.266 6.095 0 7.555 0 9.318 0 11.366 1.708 13 3.781 13h8.906C14.502 13 16 11.57 16 9.773c0-1.636-1.242-2.969-2.834-3.194C12.923 3.999 10.69 2 8 2zm2.354 6.854-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7.5 9.293V5.5a.5.5 0 0 1 1 0v3.793l1.146-1.147a.5.5 0 0 1 .708.708z"/>
                  </svg>
                PDF Format
              </button>
              <button
                onClick={() => setShowShareOptionsModal(false)}
                className="w-full mt-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-charcoal rounded-lg font-semibold border-2 border-gray-300 shadow-sm transition-all duration-150 ease-in-out"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {/* Download File Modal - Dark Modern Premium Style */}
      {showDownloadModal && createPortal(
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
        >
          <motion.div 
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-lg shadow-2xl border-2 border-gray-400 overflow-hidden p-6 max-w-md w-full mx-4 md:mx-0"
          >
            <h3 className="text-xl font-bold text-charcoal mb-4">PDF Downloaded</h3>
            <div className="text-gray-600 mb-6 space-y-3">
              <p>
                <span className="font-medium">File: </span>
                <span className="text-orange-600 font-semibold">{downloadedFile.fileName}</span>
              </p>
              <p className="text-sm text-gray-500">Week: {downloadedFile.dateRange}</p>
              <p className="mt-4">Would you like to share the schedule via WhatsApp?</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button 
                onClick={() => setShowDownloadModal(false)} 
                className="px-4 py-2 bg-gray-200 text-charcoal rounded-lg border-2 border-gray-300 hover:bg-gray-300 font-semibold shadow-sm transition-all"
              >
                Close
              </button>
              <button 
                onClick={shareAfterDownload}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-md font-semibold transition-all flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 mr-2" fill="currentColor">
                  <path d="M17.498 14.382c-.301-.15-1.767-.867-2.04-.966-.273-.101-.473-.15-.673.15-.197.295-.771.964-.944 1.162-.175.195-.349.21-.646.075-.3-.15-1.263-.465-2.403-1.485-.888-.795-1.484-1.77-1.66-2.07-.174-.3-.019-.465.13-.615.136-.135.301-.345.451-.523.146-.181.194-.301.297-.496.1-.21.049-.375-.025-.524-.075-.15-.672-1.62-.922-2.206-.24-.584-.487-.51-.672-.51-.172-.015-.371-.015-.571-.015-.2 0-.523.074-.797.359-.273.3-1.045 1.02-1.045 2.475s1.07 2.865 1.219 3.075c.149.195 2.105 3.195 5.1 4.485.714.3 1.27.48 1.704.629.714.227 1.365.195 1.88.121.574-.091 1.767-.721 2.016-1.426.255-.705.255-1.29.18-1.425-.074-.135-.27-.21-.57-.345m-5.446 7.443h-.016c-1.77 0-3.524-.48-5.055-1.38l-.36-.214-3.75.975 1.005-3.645-.239-.375a9.869 9.869 0 01-1.516-5.26c0-5.445 4.455-9.885 9.942-9.885a9.865 9.865 0 017.021 2.91 9.788 9.788 0 012.909 6.99c-.004 5.444-4.46 9.885-9.935 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" />
                </svg>
                Share via WhatsApp
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
    </div>
  );
};

export default WeeklyRotaPage; 