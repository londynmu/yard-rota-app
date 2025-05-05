import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { format, addDays, startOfWeek } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { createPortal } from 'react-dom';

const ExportRota = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [startDate, setStartDate] = useState(format(startOfWeek(new Date(), { weekStartsOn: 6 }), 'yyyy-MM-dd'));
  const [agencies, setAgencies] = useState([]);
  const [selectedAgencies, setSelectedAgencies] = useState([]);
  const [rotaData, setRotaData] = useState([]);
  const [fetchingData, setFetchingData] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [emailMessage, setEmailMessage] = useState(
    `Please find attached the weekly staff schedule for the upcoming week.\n\nPlease confirm receipt of this schedule.\n\nThank you.`
  );
  const [currentUser, setCurrentUser] = useState(null);

  // Fetch agencies list
  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const { data, error } = await supabase
          .from('agencies')
          .select('id, name, email, phone_number, is_active')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setAgencies(data || []);
      } catch (err) {
        console.error('Error fetching agency managers:', err);
        setError('Could not load agency managers list');
      }
    };

    fetchAgencies();
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentUser(data?.user || null);
    };
    fetchUser();
  }, []);

  // Get roster data for selected week
  const fetchRotaForWeek = async () => {
    setFetchingData(true);
    setError(null);
    setRotaData([]);
    
    try {
      // Calculate end date (7 days)
      const start = new Date(startDate);
      const end = addDays(start, 6);
      const endDate = format(end, 'yyyy-MM-dd');
      
      // Fetch all scheduled slots for the date range
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('scheduled_rota')
        .select(`
          id,
          date,
          shift_type,
          location,
          start_time,
          end_time,
          user_id
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('user_id', 'is', null);
      
      if (scheduleError) throw scheduleError;

      // Get all profiles in one query to minimize API calls
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, agency_id');

      if (profilesError) throw profilesError;

      // Get all agencies for reference
      const { data: agenciesData, error: agenciesError } = await supabase
        .from('agencies')
        .select('id, name');

      if (agenciesError) throw agenciesError;

      // Create a map of profiles by id for easy lookup
      const profilesMap = {};
      profilesData.forEach(profile => {
        profilesMap[profile.id] = profile;
      });
      
      // Create a map of agencies by id for easy lookup
      const agenciesMap = {};
      agenciesData.forEach(agency => {
        agenciesMap[agency.id] = agency;
      });

      // Process the data for export formats
      const processedData = scheduleData.map(slot => {
        const profile = profilesMap[slot.user_id] || {};
        const agencyId = profile.agency_id;
        const agency = agencyId ? (agenciesMap[agencyId]?.name || 'No info') : 'No info';
        return {
          date: format(new Date(slot.date), 'dd/MM/yyyy'),
          day: format(new Date(slot.date), 'EEEE'),
          location: slot.location,
          shift: slot.shift_type,
          time: `${slot.start_time} - ${slot.end_time}`,
          staff: profile.first_name && profile.last_name ? 
                 `${profile.first_name} ${profile.last_name}` : 'Unassigned',
          email: profile.email || '',
          agency: agency
        };
      });
      
      // Wczytaj dane i usuń informacje o typie zmiany z czasu pracy
      const cleanedData = processedData.map(item => {
        // Usuwamy dodatek "(day)", "(afternoon)", "(night)" z tabeli
        const cleanTime = item.time.replace(/\s*\([^)]*\)\s*$/, '');
        return {
          ...item,
          time: cleanTime
        };
      });
      
      setRotaData(cleanedData);
    } catch (err) {
      console.error('Error fetching rota data:', err);
      setError('Failed to load schedule data');
    } finally {
      setFetchingData(false);
    }
  };

  // Funkcja do grupowania danych według pracowników
  const groupDataByStaff = () => {
    // Grupowanie danych według pracowników
    const staffMap = {};
    
    rotaData.forEach(row => {
      if (!staffMap[row.staff]) {
        staffMap[row.staff] = {
          name: row.staff,
          agency: row.agency, // Używamy rzeczywistej agencji z danych
          shifts: {
            saturday: [],
            sunday: [],
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: []
          }
        };
      }
      
      // Określ dzień tygodnia i dodaj zmianę do odpowiedniego dnia
      const dayLower = row.day.toLowerCase();
      if (staffMap[row.staff].shifts[dayLower]) {
        staffMap[row.staff].shifts[dayLower].push({
          date: row.date,
          location: row.location,
          time: row.time
        });
      }
    });
    
    // Konwertuj na tablicę i sortuj według agencji, a następnie według nazwiska
    return Object.values(staffMap).sort((a, b) => {
      // Najpierw sortuj według agencji
      if (a.agency < b.agency) return -1;
      if (a.agency > b.agency) return 1;
      
      // W obrębie agencji sortuj według nazwiska
      return a.name.localeCompare(b.name);
    });
  };

  // Generate and download CSV
  const generateCSV = () => {
    if (rotaData.length === 0) {
      setError('No data available to export');
      return;
    }

    try {
      // Grupowanie danych według pracowników
      const staffData = groupDataByStaff();
      
      // Pobieranie zakresu dat dla nagłówków kolumn
      const dates = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(new Date(startDate), i);
        return {
          day: format(date, 'EEEE'),
          date: format(date, 'dd/MM/yyyy')
        };
      });
      
      // Tworzenie CSV
      let csvRows = [];
      
      // Nagłówek
      const headerRow = ['Name', 'Agency'];
      dates.forEach(d => {
        headerRow.push(`${d.day} (${d.date})`);
      });
      csvRows.push(headerRow.join(','));
      
      // Ostatnia agencja do śledzenia zmian i dodawania separatorów
      let lastAgency = null;
      
      // Dodawanie danych pracowników
      staffData.forEach(staff => {
        // Dodaj pusty wiersz jako separator między agencjami
        if (lastAgency !== null && lastAgency !== staff.agency) {
          csvRows.push(Array(headerRow.length).fill('').join(','));
        }
        lastAgency = staff.agency;
        
        const row = [staff.name, staff.agency];
        
        // Dla każdego dnia tygodnia, dodaj informacje o zmianach lub pustą komórkę
        ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
          const dayShifts = staff.shifts[day];
          if (dayShifts.length === 0) {
            row.push('');
          } else {
            const shiftsText = dayShifts.map(shift => {
              // Usuń typ zmiany z wyświetlania jeśli istnieje
              const timeOnly = shift.time.replace(/\s*\([^)]*\)\s*$/, '');
              return timeOnly;
            }).join('; ');
            row.push(`"${shiftsText}"`);
          }
        });
        
        csvRows.push(row.join(','));
      });
      
      // Create blob and download
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      const fileName = `rota_${startDate}_${format(addDays(new Date(startDate), 6), 'yyyy-MM-dd')}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return csvContent; // Return for potential email attachment
    } catch (err) {
      console.error('Error generating CSV:', err);
      setError('Failed to generate CSV file');
      return null;
    }
  };

  // Generate and download PDF
  const generatePDF = () => {
    if (rotaData.length === 0) {
      setError('No data available to export');
      return;
    }

    try {
      // Grupowanie danych według pracowników i agencji
      const staffData = groupDataByStaff();
      
      // Pobieranie zakresu dat dla nagłówków kolumn
      const dates = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(new Date(startDate), i);
        return {
          day: format(date, 'EEEE'),
          date: format(date, 'dd/MM/yyyy')
        };
      });
      
      // Create new PDF document (A4 landscape dla lepszego dopasowania tabeli)
      const doc = new jsPDF('landscape');
      
      // Add title
      const title = `Weekly Schedule: ${format(new Date(startDate), 'dd/MM/yyyy')} - ${format(addDays(new Date(startDate), 6), 'dd/MM/yyyy')}`;
      doc.setFontSize(14);
      doc.text(title, 14, 20);
      
      // Add current date
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
      
      // Przygotuj nagłówki kolumn
      const tableColumn = ['Name', 'Agency'];
      dates.forEach(d => {
        tableColumn.push(`${d.day}\n(${d.date})`);
      });
      
      // Przygotuj dane tabeli
      const tableRows = [];
      
      // Śledź zmiany agencji, aby dodać nagłówki agencji
      let currentAgency = null;
      
      staffData.forEach(staff => {
        // Dodaj wiersz nagłówka agencji, jeśli zmienia się agencja
        if (currentAgency !== staff.agency) {
          currentAgency = staff.agency;
          tableRows.push([
            { content: `Agency: ${staff.agency}`, colSpan: tableColumn.length, styles: { fontStyle: 'bold', fillColor: [200, 200, 200], textColor: [0, 0, 0] } }
          ]);
        }
        
        const row = [staff.name, staff.agency];
        
        // Dla każdego dnia tygodnia, dodaj informacje o zmianach lub pustą komórkę
        ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
          const dayShifts = staff.shifts[day];
          if (dayShifts.length === 0) {
            row.push('');
          } else {
            const shiftsText = dayShifts.map(shift => {
              // Usuń typ zmiany z wyświetlania jeśli istnieje
              const timeOnly = shift.time.replace(/\s*\([^)]*\)\s*$/, '');
              return timeOnly;
            }).join('\n');
            row.push(shiftsText);
          }
        });
        
        tableRows.push(row);
      });
      
      // Add table to document with jspdf-autotable
      doc.autoTable({
        startY: 35,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { 
          fillColor: [66, 66, 66],
          halign: 'center'
        },
        styles: { 
          overflow: 'linebreak', 
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 40 },  // Name
          1: { cellWidth: 30 },  // Agency
          // Pozostałe kolumny (dni) mają równą szerokość
        },
        rowPageBreak: 'avoid', // Unikaj łamania wierszy między stronami
        bodyStyles: {
          minCellHeight: 10
        },
        margin: { top: 35, right: 10, bottom: 10, left: 10 }, // Zmniejsz marginesy
        didParseCell: function(data) {
          // Dla nagłówków agencji ustawia się kolSpan
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.colSpan) {
            data.cell.colSpan = data.cell.raw.colSpan;
            if (data.cell.raw.styles) {
              Object.assign(data.cell.styles, data.cell.raw.styles);
            }
          }
          
          // Dla nagłówków agencji, ustaw również pageBreak na 'before' aby
          // uniknąć łamania grupy tej samej agencji między stronami
          if (data.cell.raw && 
              typeof data.cell.raw === 'object' && 
              data.cell.raw.colSpan && 
              data.row.index > 0 && 
              data.row.section === 'body') {
            data.row.pageBreak = 'before';
          }
        },
        willDrawCell: function(data) {
          // Jeśli wiersz zawiera nazwisko pracownika, upewnij się, że wszystkie 
          // komórki tego pracownika są na tej samej stronie
          if (data.row.section === 'body' && 
              data.column.index === 0 && 
              data.cell.text && 
              typeof data.cell.text === 'string' &&
              !data.cell.raw?.colSpan) { // Nie jest nagłówkiem agencji
                
            // Jeśli jest zbyt mało miejsca dla całego wiersza, zacznij od nowej strony
            if (data.cursor.y > doc.internal.pageSize.height - 50) {
              data.cursor.y = data.cursor.y + data.cursor.y / 2;
            }
          }
        },
        didDrawPage: function(data) {
          // Dodaj nagłówek na każdej stronie
          doc.setFontSize(14);
          doc.text(title, 14, 20);
          doc.setFontSize(10);
          doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
          
          // Dodaj stopkę z numerem strony
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.setFontSize(8);
          doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, pageSize.width / 2, pageHeight - 10, { align: 'center' });
        }
      });
      
      // Save PDF
      const fileName = `rota_${startDate}_${format(addDays(new Date(startDate), 6), 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      
      return doc; // Return for potential email attachment
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF file');
      return null;
    }
  };

  // Show confirmation dialog before sending
  const confirmSend = () => {
    if (selectedAgencies.length === 0) {
      setError('Please select at least one agency to send to');
      return;
    }

    if (rotaData.length === 0) {
      setError('No data available to send');
      return;
    }

    setShowConfirmation(true);
  };

  // Cancel send operation
  const cancelSend = () => {
    setShowConfirmation(false);
  };

  // Send to agencies via email (after confirmation)
  const sendToAgencies = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowConfirmation(false);

    try {
      // Generate CSV content
      const csvContent = generateCSV();
      
      // For each selected agency
      for (const agencyId of selectedAgencies) {
        const agency = agencies.find(a => a.id === agencyId);
        
        if (!agency) continue;
        
        // Send email with attachments via backend function
        const { error } = await supabase.functions.invoke('send-rota-email', {
          body: {
            recipient: agency.email,
            agencyName: agency.name,
            weekStart: format(new Date(startDate), 'dd/MM/yyyy'),
            weekEnd: format(addDays(new Date(startDate), 6), 'dd/MM/yyyy'),
            csvData: csvContent,
            message: emailMessage,
            sender: currentUser?.email || 'unknown'
          }
        });
        
        if (error) throw error;
      }
      
      setSuccess(`Schedule sent to ${selectedAgencies.length} agencies successfully`);
    } catch (err) {
      console.error('Error sending emails:', err);
      setError('Failed to send emails to agencies');
    } finally {
      setLoading(false);
    }
  };

  const handleAgencySelection = (agencyId) => {
    setSelectedAgencies(prev =>
      prev.includes(agencyId)
        ? prev.filter(id => id !== agencyId)
        : [...prev, agencyId]
    );
  };

  return (
    <div className="bg-black/80 border border-white/20 rounded-xl p-4 md:p-6 space-y-6">
      <h2 className="text-xl font-semibold text-white">Export & Send Weekly Schedule</h2>
      
      {/* Date Selection */}
      <div>
        <label htmlFor="start-date" className="block text-white mb-2">
          Select Week (Starting Saturday)
        </label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white"
        />
        <p className="text-white/60 text-sm mt-1">
          Week: {startDate} to {startDate ? format(addDays(new Date(startDate), 6), 'yyyy-MM-dd') : ''}
        </p>
      </div>
      
      {/* Fetch data button */}
      <div>
        <button
          onClick={fetchRotaForWeek}
          disabled={fetchingData}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-800/50 disabled:cursor-not-allowed"
        >
          {fetchingData ? (
            <>
              <span className="animate-pulse">Loading data...</span>
            </>
          ) : (
            'Fetch Schedule Data'
          )}
        </button>
        
        {rotaData.length > 0 && (
          <p className="text-green-400 text-sm mt-2">
            {rotaData.length} shifts loaded for selected week
          </p>
        )}
      </div>
      
      {/* Download buttons */}
      {rotaData.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={generateCSV}
            className="px-4 py-2 bg-blue-600/30 border border-blue-400/30 rounded text-white hover:bg-blue-600/40"
          >
            Download CSV
          </button>
          <button
            onClick={generatePDF}
            className="px-4 py-2 bg-green-600/30 border border-green-400/30 rounded text-white hover:bg-green-600/40"
          >
            Download PDF
          </button>
        </div>
      )}
      
      {/* Agency Selection */}
      {agencies.length > 0 && rotaData.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-white mb-3">Send to Agency Managers</h3>
          
          <div className="mb-4 max-h-60 overflow-y-auto bg-white/5 rounded border border-white/10 p-3">
            {agencies.map(agency => (
              <div key={agency.id} className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id={`agency-${agency.id}`}
                  checked={selectedAgencies.includes(agency.id)}
                  onChange={() => handleAgencySelection(agency.id)}
                  className="mr-2 accent-purple-500 w-4 h-4"
                />
                <label htmlFor={`agency-${agency.id}`} className="text-white cursor-pointer">
                  {agency.name} ({agency.email})
                </label>
              </div>
            ))}
          </div>
          
          {/* Recipients Preview */}
          {selectedAgencies.length > 0 && (
            <div className="mb-4 p-3 bg-white/5 rounded border border-white/10">
              <h4 className="text-white text-md font-medium mb-2">Recipients ({selectedAgencies.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                {selectedAgencies.map(agencyId => {
                  const agency = agencies.find(a => a.id === agencyId);
                  return (
                    <div key={agencyId} className="text-white mb-1 flex items-center">
                      <div className="bg-purple-500/20 px-2 py-1 rounded-full text-xs mr-2">
                        To
                      </div>
                      {agency?.name}: {agency?.email}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Email Message Template */}
          <div className="mb-4">
            <label htmlFor="email-message" className="block text-white mb-2">
              Email Message
            </label>
            <textarea
              id="email-message"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={5}
              className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white resize-y"
              placeholder="Enter custom message to send with the schedule..."
            />
          </div>
          
          <button
            onClick={confirmSend}
            disabled={loading || selectedAgencies.length === 0}
            className="w-full px-4 py-2 bg-red-600/30 border border-red-400/30 rounded text-white hover:bg-red-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : `Send to ${selectedAgencies.length} Selected Agency Managers`}
          </button>
        </div>
      )}
      
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-md p-3 text-red-100">
          {error}
          <button className="ml-2 text-white/80 hover:text-white font-bold" onClick={() => setError(null)}>
            &times;
          </button>
        </div>
      )}
      
      {success && (
        <div className="bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-md p-3 text-green-100">
          {success}
          <button className="ml-2 text-white/80 hover:text-white font-bold" onClick={() => setSuccess(null)}>
            &times;
          </button>
        </div>
      )}
      
      {/* Confirmation Dialog */}
      {showConfirmation && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 md:mx-0">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Send</h3>
            <div className="text-gray-700 mb-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {currentUser && (
                <p><span className="font-medium">From:</span> {currentUser.email}</p>
              )}
              <p className="font-medium">Recipients ({selectedAgencies.length}):</p>
              <ul className="ml-4 list-disc">
                {selectedAgencies.map(agencyId => {
                  const agency = agencies.find(a => a.id === agencyId);
                  return (
                    <li key={agencyId}>{agency?.name} ({agency?.email})</li>
                  );
                })}
              </ul>
              <p className="text-sm text-gray-600">Week period: {format(new Date(startDate), 'dd/MM/yyyy')} - {format(addDays(new Date(startDate), 6), 'dd/MM/yyyy')}</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button onClick={cancelSend} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 font-medium transition-colors">
                Cancel
              </button>
              <button onClick={sendToAgencies} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-medium transition-colors">
                Yes, I&apos;m 100% Sure - Send Now
              </button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};

export default ExportRota; 