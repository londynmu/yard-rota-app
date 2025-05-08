import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { format, addDays, startOfWeek } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  const [step, setStep] = useState(1);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ url: '', fileName: '', type: '' });

  // Helper – can we go to the next step?
  const isNextDisabled = () => {
    if (step === 1) {
      return rotaData.length === 0; // need data first
    }
    if (step === 3) {
      return selectedAgencies.length === 0; // need at least one agency
    }
    return false;
  };

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

  // Funkcja do grupowania danych według lokalizacji
  const groupDataByLocation = () => {
    // Grupowanie danych według lokalizacji
    const locationMap = {};
    
    rotaData.forEach(row => {
      const location = row.location;
      
      // Inicjalizuj strukturę dla lokalizacji, jeśli nie istnieje
      if (!locationMap[location]) {
        locationMap[location] = {
          name: location,
          agencies: {}
        };
      }
      
      const agency = row.agency;
      
      // Inicjalizuj strukturę dla agencji w danej lokalizacji, jeśli nie istnieje
      if (!locationMap[location].agencies[agency]) {
        locationMap[location].agencies[agency] = {
          name: agency,
          staff: {}
        };
      }
      
      const staffName = row.staff;
      
      // Inicjalizuj strukturę dla pracownika, jeśli nie istnieje
      if (!locationMap[location].agencies[agency].staff[staffName]) {
        locationMap[location].agencies[agency].staff[staffName] = {
          name: staffName,
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
      
      // Dodaj zmianę do odpowiedniego dnia dla danego pracownika
      const dayLower = row.day.toLowerCase();
      if (locationMap[location].agencies[agency].staff[staffName].shifts[dayLower]) {
        locationMap[location].agencies[agency].staff[staffName].shifts[dayLower].push({
          date: row.date,
          time: row.time
        });
      }
    });
    
    // Konwertuj zagnieżdżoną mapę na strukturę tablicową dla łatwiejszego użycia
    const result = Object.keys(locationMap).sort().map(locationName => {
      const location = locationMap[locationName];
      
      // Konwertuj agencje na tablicę i sortuj alfabetycznie
      const agencies = Object.keys(location.agencies).sort().map(agencyName => {
        const agency = location.agencies[agencyName];
        
        // Konwertuj pracowników na tablicę i sortuj alfabetycznie
        const staff = Object.keys(agency.staff).sort().map(staffName => {
          return agency.staff[staffName];
        });
        
        return {
          name: agency.name,
          staff: staff
        };
      });
      
      return {
        name: location.name,
        agencies: agencies
      };
    });
    
    return result;
  };

  // Generate and download CSV
  const generateCSV = () => {
    if (rotaData.length === 0) {
      setError('No data available to export');
      return;
    }

    try {
      // Grupowanie danych według lokalizacji
      const locationData = groupDataByLocation();
      
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
      const headerRow = ['Name', 'Agency', 'Location'];
      dates.forEach(d => {
        headerRow.push(`${d.day} (${d.date})`);
      });
      csvRows.push(headerRow.join(','));
      
      // Przejdź przez wszystkie lokalizacje
      locationData.forEach(location => {
        // Dodaj nagłówek lokalizacji
        csvRows.push(Array(headerRow.length).fill('').join(','));
        csvRows.push([`Location: ${location.name}`, ...Array(headerRow.length - 1).fill('')].join(','));
        
        // Przejdź przez wszystkie agencje w tej lokalizacji
        location.agencies.forEach(agency => {
          // Dodaj nagłówek agencji
          csvRows.push([`Agency: ${agency.name}`, ...Array(headerRow.length - 1).fill('')].join(','));
          
          // Przejdź przez wszystkich pracowników w tej agencji
          agency.staff.forEach(staff => {
            const row = [staff.name, agency.name, location.name];
            
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
          
          // Dodaj odstęp po agencji, jeśli to nie jest ostatnia agencja w lokalizacji
          if (agency !== location.agencies[location.agencies.length - 1]) {
            csvRows.push(Array(headerRow.length).fill('').join(','));
          }
        });
      });
      
      // Create blob and download
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const fileName = `rota_${startDate}_${format(addDays(new Date(startDate), 6), 'yyyy-MM-dd')}.csv`;
      
      // Show download modal instead of auto-downloading
      setDownloadInfo({
        url,
        fileName,
        type: 'CSV'
      });
      setShowDownloadModal(true);
      
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
      // Grupowanie danych według lokalizacji
      const locationData = groupDataByLocation();
      
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
      const tableColumn = ['Name', 'Agency', 'Location'];
      dates.forEach(d => {
        tableColumn.push(`${d.day}\n(${d.date})`);
      });
      
      // Przygotuj dane tabeli
      const tableRows = [];
      
      // Przejdź przez wszystkie lokalizacje
      locationData.forEach(location => {
        // Dodaj nagłówek lokalizacji
        tableRows.push([
          { content: `Location: ${location.name}`, colSpan: tableColumn.length, styles: { fontStyle: 'bold', fillColor: [200, 200, 200], textColor: [0, 0, 0] } }
        ]);
        
        // Przejdź przez wszystkie agencje w tej lokalizacji
        location.agencies.forEach(agency => {
          // Dodaj nagłówek agencji
          tableRows.push([
            { content: `Agency: ${agency.name}`, colSpan: tableColumn.length, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: [0, 0, 0] } }
          ]);
          
          // Przejdź przez wszystkich pracowników w tej agencji
          agency.staff.forEach(staff => {
            const row = [staff.name, agency.name, location.name];
            
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
        });
      });
      
      // Initialize autoTable plugin
      autoTable(doc, {
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
          0: { cellWidth: 40 },  // Location
          1: { cellWidth: 30 },  // Agency
          // Pozostałe kolumny (dni) mają równą szerokość
        },
        rowPageBreak: 'avoid', // Unikaj łamania wierszy między stronami
        bodyStyles: {
          minCellHeight: 10
        },
        margin: { top: 35, right: 10, bottom: 10, left: 10 }, // Zmniejsz marginesy
        didParseCell: function(data) {
          // Dla nagłówków lokalizacji ustawia się kolSpan
          if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.colSpan) {
            data.cell.colSpan = data.cell.raw.colSpan;
            if (data.cell.raw.styles) {
              Object.assign(data.cell.styles, data.cell.raw.styles);
            }
          }
          
          // Dla nagłówków lokalizacji, ustaw również pageBreak na 'before' aby
          // uniknąć łamania grupy tej samej lokalizacji między stronami
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
              !data.cell.raw?.colSpan) { // Nie jest nagłówkiem lokalizacji
                
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
          
          // Get the total number of pages before generating the document
          const totalPages = doc.getNumberOfPages();
          doc.text(`Page ${data.pageNumber} of ${totalPages}`, pageSize.width / 2, pageHeight - 10, { align: 'center' });
        }
      });
      
      // Get the PDF as blob URL instead of saving directly
      const fileName = `rota_${startDate}_${format(addDays(new Date(startDate), 6), 'yyyy-MM-dd')}.pdf`;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      
      // Show download modal
      setDownloadInfo({
        url,
        fileName,
        type: 'PDF'
      });
      setShowDownloadModal(true);
      
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
      // Generate CSV file (will download automatically)
      generateCSV();
      
      // Generate PDF file (will download automatically)
      generatePDF();
      
      // Prepare email - we'll use mailto protocol to open the default email client
      const selectedEmails = selectedAgencies
        .map(agencyId => {
          const agency = agencies.find(a => a.id === agencyId);
          return agency?.email;
        })
        .filter(email => email) // Remove any undefined emails
        .join(',');
      
      if (!selectedEmails) {
        throw new Error('No valid email addresses found');
      }
      
      // Format date range for subject
      const weekRange = `${format(new Date(startDate), 'dd/MM/yyyy')} - ${format(addDays(new Date(startDate), 6), 'dd/MM/yyyy')}`;
      
      // Create email subject - now using "Shunters" in the title as shown in screenshot
      const subject = encodeURIComponent(`Weekly Shunters Schedule: ${weekRange}`);
      
      // Create email body to match exactly what's in the screenshot
      const body = encodeURIComponent(
        `Please find attached the weekly shunters schedule for ${weekRange}.\n\n` +
        `Please confirm receipt of this schedule.\n\n` +
        `Best regards\n\n` +
        `Keith Thomas`
      );
      
      // Open default email client with prefilled information
      window.location.href = `mailto:${selectedEmails}?subject=${subject}&body=${body}`;
      
      setSuccess(`CSV and PDF files downloaded. Email draft prepared for ${selectedAgencies.length} agencies.`);
    } catch (err) {
      console.error('Error preparing email:', err);
      setError('Failed to prepare email draft: ' + err.message);
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
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/40 rounded-xl p-4 md:p-6 shadow-xl space-y-6">
      {/* Heading */}
      <h2 className="text-xl font-semibold text-white mb-4">Export & Send Weekly Schedule</h2>

      {/* Progress bar */}
      <div className="flex items-center space-x-3">
        <span className="text-slate-400 text-sm">Step {step} / 4</span>
        <div className="flex-1 h-2 bg-slate-700/60 rounded">
          <div
            className="h-2 bg-blue-500 rounded transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* STEP 1 – Week selection & Fetch */}
      {step === 1 && (
        <>
          <div>
            <label htmlFor="start-date" className="block text-white mb-1">Select Week (Starting Saturday)</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-3 py-2 text-white [color-scheme:dark] focus:outline-none"
            />
            <p className="text-slate-400 text-sm mt-1">
              Week: {startDate} to {startDate ? format(addDays(new Date(startDate), 6), 'yyyy-MM-dd') : ''}
            </p>
          </div>

          <div>
            <button
              onClick={fetchRotaForWeek}
              disabled={fetchingData}
              className="px-4 py-2 bg-blue-600/80 text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fetchingData ? <span className="animate-pulse">Loading data...</span> : 'Fetch Schedule Data'}
            </button>
            {rotaData.length > 0 && (
              <p className="text-slate-300 text-sm mt-2">{rotaData.length} shifts loaded for selected week</p>
            )}
          </div>
        </>
      )}

      {/* STEP 2 – Download files */}
      {step === 2 && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={generateCSV}
            className="px-4 py-2 bg-slate-700/80 text-white rounded border border-slate-600/30 hover:bg-slate-600/90 shadow-md backdrop-blur-sm transition-all"
          >
            Download CSV
          </button>
          <button
            onClick={generatePDF}
            className="px-4 py-2 bg-slate-700/80 text-white rounded border border-slate-600/30 hover:bg-slate-600/90 shadow-md backdrop-blur-sm transition-all"
          >
            Download PDF
          </button>
        </div>
      )}

      {/* STEP 3 – Agency selection */}
      {step === 3 && agencies.length > 0 && (
        <>
          <h3 className="text-lg font-medium text-white mb-3">Send to Agency Managers</h3>
          <div className="mb-4 max-h-60 overflow-y-auto bg-slate-800/50 rounded border border-slate-700/50 p-3">
            {agencies.map(agency => (
              <div key={agency.id} className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id={`agency-${agency.id}`}
                  checked={selectedAgencies.includes(agency.id)}
                  onChange={() => handleAgencySelection(agency.id)}
                  className="mr-2 accent-blue-500 w-4 h-4"
                />
                <label htmlFor={`agency-${agency.id}`} className="text-white cursor-pointer">
                  {agency.name} ({agency.email})
                </label>
              </div>
            ))}
          </div>
          {selectedAgencies.length > 0 && (
            <div className="mb-4 p-3 bg-slate-800/50 rounded border border-slate-700/50">
              <h4 className="text-white text-md font-medium mb-2">Recipients ({selectedAgencies.length})</h4>
              <div className="max-h-32 overflow-y-auto">
                {selectedAgencies.map(agencyId => {
                  const agency = agencies.find(a => a.id === agencyId);
                  return (
                    <div key={agencyId} className="text-white mb-1 flex items-center">
                      <div className="bg-blue-600/30 px-2 py-1 rounded-full text-xs mr-2">To</div>
                      {agency?.name}: {agency?.email}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* STEP 4 – Email message & send */}
      {step === 4 && (
        <>
          <div className="mb-4">
            <label htmlFor="email-message" className="block text-white mb-1">Email Message</label>
            <textarea
              id="email-message"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              rows={5}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded px-3 py-2 text-white resize-y focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter custom message to send with the schedule..."
            />
          </div>
          <button
            onClick={confirmSend}
            disabled={loading || selectedAgencies.length === 0}
            className="w-full px-4 py-2 bg-blue-600/80 text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : `Send to ${selectedAgencies.length} Selected Agency Managers`}
          </button>
        </>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between pt-4">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="px-4 py-2 bg-slate-700/80 text-white rounded border border-slate-600/30 hover:bg-slate-600/90 shadow-md backdrop-blur-sm transition-all"
          >
            Back
          </button>
        ) : <span />}

        {step < 4 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={isNextDisabled()}
            className="px-4 py-2 bg-blue-600/80 text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-white/90 text-slate-800 px-6 py-3 rounded-lg shadow-lg border border-slate-300/30 flex items-center space-x-3 transform transition-all duration-300 animate-fade-in backdrop-blur-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            {error}
          </div>
          <button className="text-slate-600 hover:text-slate-800 font-bold" onClick={() => setError(null)}>
            &times;
          </button>
        </div>
      )}
      
      {success && (
        <div className="bg-white/90 text-slate-800 px-6 py-3 rounded-lg shadow-lg border border-slate-300/30 flex items-center space-x-3 transform transition-all duration-300 animate-fade-in backdrop-blur-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            {success}
          </div>
          <button className="text-slate-600 hover:text-slate-800 font-bold" onClick={() => setSuccess(null)}>
            &times;
          </button>
        </div>
      )}
      
      {/* Confirmation Dialog */}
      {showConfirmation && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl border border-slate-700/40 overflow-hidden p-6 max-w-md w-full mx-4 md:mx-0">
            <h3 className="text-xl font-bold text-white mb-4">Confirm Send</h3>
            <div className="text-slate-300 mb-6 space-y-3 max-h-[60vh] overflow-y-auto">
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
              <p className="text-sm text-slate-400">Week period: {format(new Date(startDate), 'dd/MM/yyyy')} - {format(addDays(new Date(startDate), 6), 'dd/MM/yyyy')}</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button 
                onClick={cancelSend} 
                className="px-4 py-2 bg-slate-800/80 text-white rounded border border-slate-700/50 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={sendToAgencies} 
                className="px-4 py-2 bg-blue-600/80 text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all"
              >
                Yes, I&apos;m 100% Sure - Send Now
              </button>
            </div>
          </div>
        </div>, document.body)}

      {/* Download File Modal */}
      {showDownloadModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-xl border border-slate-700/40 overflow-hidden p-6 max-w-md w-full mx-4 md:mx-0">
            <h3 className="text-xl font-bold text-white mb-4">Download File</h3>
            <div className="text-slate-300 mb-6 space-y-3 max-h-[60vh] overflow-y-auto">
              <p>
                <span className="font-medium">File ready: </span>
                <span className="text-blue-400">{downloadInfo.fileName}</span>
              </p>
              <p className="text-sm text-slate-400">Week: {format(new Date(startDate), 'dd/MM/yyyy')} - {format(addDays(new Date(startDate), 6), 'dd/MM/yyyy')}</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button 
                onClick={() => setShowDownloadModal(false)} 
                className="px-4 py-2 bg-slate-800/80 text-white rounded border border-slate-700/50 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <a 
                href={downloadInfo.url}
                download={downloadInfo.fileName}
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 bg-blue-600/80 text-white rounded border border-blue-500/30 hover:bg-blue-700/90 shadow-md backdrop-blur-sm transition-all text-center"
              >
                Download {downloadInfo.type}
              </a>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};

export default ExportRota; 