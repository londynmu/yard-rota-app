import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { logSystemActivity } from '../../lib/systemActivityLog';
import { format, addDays, getDay, nextSaturday } from 'date-fns';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import AdditionalBookingsPanel from './AdditionalBookingsPanel';
import { EMAIL_SIGN_OFF, formatShiftClock } from '../../utils/rotaAdditionalBookings';
import { ensureWeekBaseline, fetchAssignedSlotsForWeek, weekStartIso } from '../../utils/rotaWeekBaseline';

/** Display / confirm From for weekly rota emails (SendGrid EMAIL_FROM). */
const ROTA_EMAIL_FROM = 'bookings@shunters.net';
/** Inbox display name paired with ROTA_EMAIL_FROM in SendGrid. */
const ROTA_EMAIL_FROM_NAME = 'Rugby Shunters Rota';

const buildDefaultWeeklyMessage = (weekStart, signOff = EMAIL_SIGN_OFF) => {
  const weekRange = `${format(weekStart, 'dd/MM/yyyy')} - ${format(addDays(weekStart, 6), 'dd/MM/yyyy')}`;
  return [
    `Please find attached the weekly shunters schedule for ${weekRange}.`,
    '',
    'Please confirm receipt of this schedule.',
    '',
    'Best regards',
    '',
    signOff,
  ].join('\n');
};

// Funkcja pomocnicza do uzyskania następnej soboty lub bieżącej, jeśli dzisiaj jest sobota
const getNextOrCurrentSaturday = (date) => {
  const today = getDay(date); // 0 (Niedziela) do 6 (Sobota)
  if (today === 6) { // Jeśli dzisiaj jest sobota
    return date;
  }
  return nextSaturday(date);
};

const ExportRota = ({ initialTab = 'weekly', initialStartDate = null, onBaselineChanged = null }) => {
  const { sessionProfile } = useAuth();
  const [mode, setMode] = useState(() => (
    initialTab === 'additional' ? 'additional' : 'weekly'
  ));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    if (initialStartDate) {
      const raw = initialStartDate instanceof Date ? initialStartDate : new Date(initialStartDate);
      return getNextOrCurrentSaturday(raw);
    }
    return getNextOrCurrentSaturday(new Date());
  });
  const [agencies, setAgencies] = useState([]);
  const [selectedAgencies, setSelectedAgencies] = useState([]);
  const [rotaData, setRotaData] = useState([]);
  const [fetchingData, setFetchingData] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({ url: '', fileName: '', type: '' });

  const senderName = useMemo(() => {
    const fromProfile = [sessionProfile?.first_name, sessionProfile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fromProfile || EMAIL_SIGN_OFF;
  }, [sessionProfile]);

  const [emailMessage, setEmailMessage] = useState(() => buildDefaultWeeklyMessage(startDate, senderName));

  useEffect(() => {
    setEmailMessage(buildDefaultWeeklyMessage(startDate, senderName));
  }, [startDate, senderName]);

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
  const fetchRotaForWeek = useCallback(async () => {
    if (!startDate) return;
    setFetchingData(true);
    setError(null);
    setRotaData([]);

    try {
      const start = startDate;
      const end = addDays(start, 6);
      const formattedStartDate = format(start, 'yyyy-MM-dd');
      const formattedEndDate = format(end, 'yyyy-MM-dd');

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
        .gte('date', formattedStartDate)
        .lte('date', formattedEndDate)
        .not('user_id', 'is', null);

      if (scheduleError) throw scheduleError;

      const { data: profilesData, error: profilesError } = await supabase.rpc(
        'get_admin_profiles_with_emails',
      );

      if (profilesError) throw profilesError;

      const { data: agenciesData, error: agenciesError } = await supabase
        .from('agencies')
        .select('id, name');

      if (agenciesError) throw agenciesError;

      const profilesMap = {};
      profilesData.forEach((profile) => {
        profilesMap[profile.id] = profile;
      });

      const agenciesMap = {};
      agenciesData.forEach((agency) => {
        agenciesMap[agency.id] = agency;
      });

      const processedData = scheduleData.map((slot) => {
        const profile = profilesMap[slot.user_id] || {};
        const agencyId = profile.agency_id;
        const agency = agencyId ? (agenciesMap[agencyId]?.name || 'No info') : 'No info';
        return {
          date: format(new Date(slot.date), 'dd/MM/yyyy'),
          day: format(new Date(slot.date), 'EEEE'),
          location: slot.location,
          shift: slot.shift_type,
          time: `${formatShiftClock(slot.start_time)} - ${formatShiftClock(slot.end_time)}`,
          staff: profile.first_name && profile.last_name
            ? `${profile.first_name} ${profile.last_name}`
            : 'Unassigned',
          email: profile.email || '',
          agency,
        };
      });

      const cleanedData = processedData.map((item) => {
        const cleanTime = item.time.replace(/\s*\([^)]*\)\s*$/, '');
        return {
          ...item,
          time: cleanTime,
        };
      });

      setRotaData(cleanedData);
    } catch (err) {
      console.error('Error fetching rota data:', err);
      setError('Failed to load schedule data');
    } finally {
      setFetchingData(false);
    }
  }, [startDate]);

  useEffect(() => {
    if (mode !== 'weekly') return undefined;
    fetchRotaForWeek();
    return undefined;
  }, [mode, fetchRotaForWeek]);

  const normalizeExportTimeRange = (value) => {
    const cleaned = String(value || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const parts = cleaned.split(/\s*-\s*/);
    if (parts.length === 2) {
      return `${formatShiftClock(parts[0])} - ${formatShiftClock(parts[1])}`;
    }
    return cleaned;
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
      const dayShifts = locationMap[location].agencies[agency].staff[staffName].shifts[dayLower];
      if (dayShifts) {
        const time = normalizeExportTimeRange(row.time);
        const alreadyListed = dayShifts.some(
          (shift) => shift.date === row.date && normalizeExportTimeRange(shift.time) === time
        );
        if (!alreadyListed) {
          dayShifts.push({
            date: row.date,
            time
          });
        }
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

  // Funkcja do filtrowania dat, aby zezwolić tylko na soboty
  const isSaturday = (date) => {
    const day = getDay(date);
    return day === 6; // 6 to sobota w date-fns (0 - niedziela)
  };

  const persistWeekBaseline = async (source) => {
    try {
      const slots = await fetchAssignedSlotsForWeek(supabase, startDate);
      const result = await ensureWeekBaseline(supabase, {
        weekStartIso: weekStartIso(startDate),
        source,
        slots,
        userId: currentUser?.id,
      });
      if (result.created) {
        await logSystemActivity(supabase, currentUser, {
          entity_type: 'rota',
          action_type: 'rota_baseline_created',
          payload: {
            week_start: weekStartIso(startDate),
            source,
            slots_count: slots.length,
          },
        });
        if (onBaselineChanged) onBaselineChanged();
      }
    } catch (err) {
      console.error('Failed to save week baseline', err);
    }
  };

  // Build weekly CSV string (no download UI).
  const buildCsvContent = () => {
    if (rotaData.length === 0) return null;

    const locationData = groupDataByLocation();
    const dates = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(new Date(startDate), i);
      return {
        day: format(date, 'EEEE'),
        date: format(date, 'dd/MM/yyyy'),
      };
    });

    const csvRows = [];
    const headerRow = ['Name', 'Agency', 'Location'];
    dates.forEach((d) => {
      headerRow.push(`${d.day} (${d.date})`);
    });
    csvRows.push(headerRow.join(','));

    locationData.forEach((location) => {
      csvRows.push(Array(headerRow.length).fill('').join(','));
      csvRows.push([`Location: ${location.name}`, ...Array(headerRow.length - 1).fill('')].join(','));

      location.agencies.forEach((agency) => {
        csvRows.push([`Agency: ${agency.name}`, ...Array(headerRow.length - 1).fill('')].join(','));

        agency.staff.forEach((staff) => {
          const row = [staff.name, agency.name, location.name];
          ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day) => {
            const dayShifts = staff.shifts[day];
            if (dayShifts.length === 0) {
              row.push('');
            } else {
              const shiftsText = dayShifts.map((shift) => {
                const timeOnly = shift.time.replace(/\s*\([^)]*\)\s*$/, '');
                return timeOnly;
              }).join('; ');
              row.push(`"${shiftsText}"`);
            }
          });
          csvRows.push(row.join(','));
        });

        if (agency !== location.agencies[location.agencies.length - 1]) {
          csvRows.push(Array(headerRow.length).fill('').join(','));
        }
      });
    });

    return csvRows.join('\n');
  };

  // Generate and download CSV
  const generateCSV = ({ skipBaseline = false } = {}) => {
    if (rotaData.length === 0) {
      setError('No data available to export');
      return;
    }

    try {
      const csvContent = buildCsvContent();
      if (!csvContent) {
        setError('Failed to generate CSV file');
        return null;
      }

      const fileName = `rota_${format(startDate, 'yyyy-MM-dd')}_${format(addDays(startDate, 6), 'yyyy-MM-dd')}.csv`;

      // For mobile compatibility, use data URI instead of Blob URL
      const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
      const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(BOM + csvContent);

      setDownloadInfo({
        url: dataUri,
        fileName,
        type: 'CSV',
        csvContent,
      });
      setShowDownloadModal(true);

      if (!skipBaseline) {
        persistWeekBaseline('download');
      }

      return csvContent;
    } catch (err) {
      console.error('Error generating CSV:', err);
      setError('Failed to generate CSV file');
      return null;
    }
  };

  // Generate and download PDF
  const generatePDF = async ({ skipBaseline = false } = {}) => {
    if (rotaData.length === 0) {
      setError('No data available to export');
      return;
    }

    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

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
      const title = `Weekly Schedule: ${format(startDate, 'dd/MM/yyyy')} - ${format(addDays(startDate, 6), 'dd/MM/yyyy')}`;
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
      
      // Get the PDF as data URI for better mobile compatibility
      const fileName = `rota_${format(startDate, 'yyyy-MM-dd')}_${format(addDays(startDate, 6), 'yyyy-MM-dd')}.pdf`;
      const dataUri = doc.output('datauristring');
      
      // Show download modal
      setDownloadInfo({
        url: dataUri,
        fileName,
        type: 'PDF'
      });
      setShowDownloadModal(true);

      if (!skipBaseline) {
        persistWeekBaseline('download');
      }
      
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

  // Send to agencies via SendGrid Edge Function (after confirmation)
  const sendToAgencies = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setShowConfirmation(false);

    try {
      const csvContent = buildCsvContent();
      if (!csvContent) {
        throw new Error('No data available to send');
      }

      const agenciesPayload = selectedAgencies
        .map((agencyId) => agencies.find((a) => a.id === agencyId))
        .filter((agency) => agency && agency.email)
        .map((agency) => ({
          name: agency.name,
          email: agency.email,
        }));

      if (agenciesPayload.length === 0) {
        throw new Error('No valid email addresses found');
      }

      const weekStart = format(startDate, 'yyyy-MM-dd');
      const weekEnd = format(addDays(startDate, 6), 'yyyy-MM-dd');

      const { data, error: invokeError } = await supabase.functions.invoke(
        'send-rota-email',
        {
          body: {
            agencies: agenciesPayload,
            weekStart,
            weekEnd,
            csvData: csvContent,
            message: emailMessage.trim() || buildDefaultWeeklyMessage(startDate, senderName),
          },
        },
      );

      if (invokeError) {
        throw new Error(invokeError.message || 'Email send failed');
      }
      if (data?.error && !Array.isArray(data?.results)) {
        throw new Error(data.error);
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      const sent = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      const failedNames = failed.map((r) => r.agencyName).filter(Boolean);

      if (sent > 0) {
        await persistWeekBaseline('send');
      }

      if (failed.length === 0 && sent > 0) {
        setSuccess(`Email sent to ${sent} agenc${sent === 1 ? 'y' : 'ies'} as ${ROTA_EMAIL_FROM_NAME} from ${ROTA_EMAIL_FROM}.`);
      } else if (sent > 0 && failed.length > 0) {
        setSuccess(`Sent to ${sent} agenc${sent === 1 ? 'y' : 'ies'}. Failed: ${failedNames.join(', ') || failed.length}.`);
        setError(`Some agencies failed: ${failed.map((r) => `${r.agencyName}: ${r.error || 'error'}`).join('; ')}`);
      } else {
        throw new Error(
          failed.map((r) => `${r.agencyName}: ${r.error || 'error'}`).join('; ')
            || data?.error
            || 'Email send failed',
        );
      }
    } catch (err) {
      console.error('Error sending rota email:', err);
      setError('Failed to send email: ' + (err.message || String(err)));
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

  const allAgenciesSelected = agencies.length > 0
    && selectedAgencies.length === agencies.length;

  const toggleSelectAllAgencies = () => {
    if (allAgenciesSelected) setSelectedAgencies([]);
    else setSelectedAgencies(agencies.map((agency) => agency.id));
  };

  const weekLabel = startDate
    ? `${format(startDate, 'd MMM')} – ${format(addDays(startDate, 6), 'd MMM yyyy')}`
    : '';

  const selectAllBtn =
    'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rota-toolbar-border bg-white px-3 text-xs font-semibold text-rota-text-primary transition hover:bg-rota-day-other-bg-from/40 disabled:cursor-not-allowed disabled:opacity-50';

  const sendPrimaryBtn =
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#25D366] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 disabled:cursor-not-allowed disabled:opacity-50';

  const tabBtn = (active) => (
    `flex min-w-0 items-center justify-center rounded-xl px-2 py-2 text-xs font-medium transition-all sm:px-3 sm:py-2.5 sm:text-sm ${
      active
        ? 'border border-rota-toolbar-border bg-white text-rota-text-primary shadow-sm'
        : 'border border-transparent text-rota-text-muted hover:bg-rota-day-other-bg-from/30 hover:text-rota-text-primary'
    }`
  );

  const WeekPickerTrigger = React.forwardRef(function WeekPickerTrigger(
    { onClick },
    ref,
  ) {
    return (
      <button
        type="button"
        ref={ref}
        onClick={onClick}
        className="text-base font-semibold text-[#25D366] transition hover:underline focus:outline-none focus-visible:underline"
        title="Change week"
        aria-label={weekLabel ? `Week ${weekLabel}. Click to change week.` : 'Choose week'}
      >
        {weekLabel ? `Week ${weekLabel}` : 'Choose week'}
      </button>
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pr-8">
      <style>
        {`
          .export-rota-datepicker-popper.react-datepicker-popper {
            z-index: 10000;
          }
          .export-rota-datepicker-popper .react-datepicker {
            font-family: inherit;
            font-size: 0.8125rem;
            line-height: 1.25;
            color: #1f2937;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 0.75rem;
            box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
            padding: 0.5rem;
          }
          .export-rota-datepicker-popper .react-datepicker__month-container {
            float: none;
          }
          .export-rota-datepicker-popper .react-datepicker__header {
            background: transparent;
            border-bottom: 1px solid #e5e7eb;
            padding: 0.25rem 0 0.5rem;
          }
          .export-rota-datepicker-popper .react-datepicker__current-month {
            font-size: 0.8125rem;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 0.35rem;
          }
          .export-rota-datepicker-popper .react-datepicker__navigation {
            top: 0.65rem;
          }
          .export-rota-datepicker-popper .react-datepicker__navigation-icon::before {
            border-color: #6b7280;
            border-width: 2px 2px 0 0;
            height: 7px;
            width: 7px;
          }
          .export-rota-datepicker-popper .react-datepicker__day-names {
            margin: 0;
            display: flex;
            justify-content: space-between;
          }
          .export-rota-datepicker-popper .react-datepicker__day-name {
            width: 1.85rem;
            line-height: 1.85rem;
            margin: 0.05rem;
            color: #6b7280;
            font-size: 0.6875rem;
            font-weight: 600;
            text-transform: uppercase;
          }
          .export-rota-datepicker-popper .react-datepicker__month {
            margin: 0.25rem 0 0;
          }
          .export-rota-datepicker-popper .react-datepicker__week {
            display: flex;
            justify-content: space-between;
          }
          .export-rota-datepicker-popper .react-datepicker__day {
            width: 1.85rem;
            line-height: 1.85rem;
            margin: 0.05rem;
            border-radius: 0.4rem;
            color: #1f2937;
            background: transparent;
            font-size: 0.8125rem;
            font-weight: 500;
          }
          .export-rota-datepicker-popper .react-datepicker__day:hover:not(.react-datepicker__day--disabled):not(.react-datepicker__day--selected) {
            background: #f3f4f6;
            color: #111827;
          }
          .export-rota-datepicker-popper .react-datepicker__day--saturday:not(.react-datepicker__day--disabled):not(.react-datepicker__day--selected),
          .export-rota-datepicker-popper .react-datepicker__day[aria-label*="Saturday"]:not(.react-datepicker__day--disabled):not(.react-datepicker__day--selected) {
            background: #f3f4f6;
            color: #111827;
            font-weight: 600;
          }
          .export-rota-datepicker-popper .react-datepicker__day--selected,
          .export-rota-datepicker-popper .react-datepicker__day--keyboard-selected {
            background: #25D366 !important;
            color: #fff !important;
            font-weight: 600;
          }
          .export-rota-datepicker-popper .react-datepicker__day--selected:hover,
          .export-rota-datepicker-popper .react-datepicker__day--keyboard-selected:hover {
            background: #1ebe57 !important;
          }
          .export-rota-datepicker-popper .react-datepicker__day--today:not(.react-datepicker__day--selected) {
            font-weight: 600;
            box-shadow: inset 0 0 0 1px #d1d5db;
          }
          .export-rota-datepicker-popper .react-datepicker__day--outside-month {
            color: #d1d5db;
          }
          .export-rota-datepicker-popper .react-datepicker__day--disabled {
            color: #d1d5db !important;
            background: transparent !important;
            cursor: default;
          }
        `}
      </style>

      <div className="shrink-0 space-y-4">
        <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-6 text-lg font-semibold text-rota-text-primary">
          <span>Send to agency</span>
          <DatePicker
            selected={startDate}
            onChange={(date) => {
              setStartDate(date);
            }}
            dateFormat="dd/MM/yyyy"
            filterDate={isSaturday}
            customInput={<WeekPickerTrigger />}
            popperClassName="export-rota-datepicker-popper"
            calendarClassName="export-rota-datepicker"
            showPopperArrow={false}
          />
        </h3>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setMode('weekly')}
            className={tabBtn(mode === 'weekly')}
          >
            Weekly schedule
          </button>
          <button
            type="button"
            onClick={() => setMode('additional')}
            className={tabBtn(mode === 'additional')}
          >
            Additional bookings
          </button>
        </div>
      </div>

      {mode === 'additional' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AdditionalBookingsPanel
            startDate={startDate}
            currentUser={currentUser}
            onBaselineChanged={onBaselineChanged}
          />
        </div>
      )}

      {mode === 'weekly' && (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-rota-text-muted">
                {fetchingData
                  ? 'Loading shifts…'
                  : (rotaData.length > 0
                    ? `${rotaData.length} shifts loaded`
                    : 'No shifts for this week')}
              </p>
              {agencies.length > 0 && (
                <button
                  type="button"
                  className={selectAllBtn}
                  onClick={toggleSelectAllAgencies}
                  disabled={agencies.length === 0}
                  title={allAgenciesSelected ? 'Clear selection' : 'Select all recipients'}
                >
                  {allAgenciesSelected ? 'Clear' : 'Select all'}
                  <span className="font-normal text-rota-text-muted">
                    {selectedAgencies.length}/{agencies.length}
                  </span>
                </button>
              )}
            </div>

            {agencies.length > 0 ? (
              <ul className="min-h-0 max-h-[28rem] flex-1 overflow-y-auto divide-y divide-rota-toolbar-border rounded-lg border border-rota-toolbar-border">
                {agencies.map((agency) => {
                  const checked = selectedAgencies.includes(agency.id);
                  return (
                    <li key={agency.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-rota-day-other-bg-from/30">
                        <input
                          type="checkbox"
                          className="shrink-0"
                          checked={checked}
                          onChange={() => handleAgencySelection(agency.id)}
                        />
                        <span className="min-w-0 flex-1 font-medium text-rota-text-primary">
                          {agency.name}
                        </span>
                        <span className="max-w-[45%] shrink-0 truncate text-xs text-rota-text-muted" title={agency.email || ''}>
                          {agency.email}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-rota-text-muted">No active agencies found.</p>
            )}

            <div className="shrink-0 space-y-1.5">
              <label htmlFor="weekly-rota-email-message" className="block text-xs font-semibold text-rota-text-primary">
                Email message
              </label>
              <textarea
                id="weekly-rota-email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-rota-toolbar-border bg-white px-3 py-2 text-sm text-rota-text-primary shadow-sm focus:border-rota-toolbar-border focus:outline-none focus:ring-2 focus:ring-rota-day-other-bg-from/60"
                placeholder="Message sent with the CSV attachment"
              />
              <p className="text-[11px] text-rota-text-muted">
                Sent as {ROTA_EMAIL_FROM_NAME} from {ROTA_EMAIL_FROM} with CSV attached. Use Download PDF separately if needed.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs text-rota-text-muted">
                Selected {selectedAgencies.length}
                {rotaData.length > 0 ? ` · ${rotaData.length} shifts` : ''}
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-rota-text-muted underline-offset-2 transition hover:text-rota-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => generateCSV()}
                disabled={fetchingData || rotaData.length === 0}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-rota-text-muted underline-offset-2 transition hover:text-rota-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => generatePDF()}
                disabled={fetchingData || rotaData.length === 0 || loading}
              >
                Download PDF
              </button>
            </div>
            <button
              type="button"
              onClick={confirmSend}
              disabled={loading || fetchingData || selectedAgencies.length === 0 || rotaData.length === 0}
              className={sendPrimaryBtn}
              title={
                selectedAgencies.length === 0
                  ? 'Select recipients first'
                  : rotaData.length === 0
                    ? 'No shifts to send'
                    : `Send to ${selectedAgencies.length} selected`
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>
                {loading
                  ? 'Sending…'
                  : `Send to ${selectedAgencies.length} selected`}
              </span>
            </button>
          </div>
        </>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="flex shrink-0 items-center space-x-3 rounded-lg border border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 transition-all duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            {error}
          </div>
          <button className="text-red-500 hover:text-red-700" onClick={() => setError(null)}>
            &times;
          </button>
        </div>
      )}

      {success && (
        <div className="flex shrink-0 items-center space-x-3 rounded-lg border border-green-200 bg-green-50 px-6 py-3 text-sm text-green-700 transition-all duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            {success}
          </div>
          <button className="text-green-600 hover:text-green-800" onClick={() => setSuccess(null)}>
            &times;
          </button>
        </div>
      )}
      
      {/* Confirmation Dialog */}
      {showConfirmation && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-semibold text-charcoal">Confirm Send</h3>
            <div className="mb-6 max-h-[60vh] space-y-3 overflow-y-auto text-sm text-gray-600">
              <p><span className="font-medium">From:</span> {ROTA_EMAIL_FROM_NAME} &lt;{ROTA_EMAIL_FROM}&gt;</p>
              <p className="font-medium">Recipients ({selectedAgencies.length}):</p>
              <ul className="ml-4 list-disc">
                {selectedAgencies.map(agencyId => {
                  const agency = agencies.find(a => a.id === agencyId);
                  return (
                    <li key={agencyId}>{agency?.name} ({agency?.email})</li>
                  );
                })}
              </ul>
              <p className="text-xs text-gray-500">Week period: {format(startDate, 'dd/MM/yyyy')} - {format(addDays(startDate, 6), 'dd/MM/yyyy')}</p>
              <p className="text-xs text-gray-500">Attachment: CSV only (no PDF). Email is sent by the app — Outlook will not open.</p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button 
                onClick={cancelSend} 
                className="admin-btn-muted"
              >
                Cancel
              </button>
              <button 
                onClick={sendToAgencies} 
                className="admin-btn"
              >
                Yes, I&apos;m 100% Sure - Send Now
              </button>
            </div>
          </div>
        </div>, document.body)}

      {/* Download File Modal */}
      {showDownloadModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-xl font-semibold text-charcoal">Download File</h3>
            <div className="mb-6 max-h-[60vh] space-y-3 overflow-y-auto text-sm text-gray-600">
              <p className="font-medium text-charcoal">
                File ready: <span className="font-semibold text-black underline decoration-gray-300">{downloadInfo.fileName}</span>
              </p>
              <p className="text-xs text-gray-500">Week: {format(startDate, 'dd/MM/yyyy')} - {format(addDays(startDate, 6), 'dd/MM/yyyy')}</p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button 
                onClick={() => setShowDownloadModal(false)} 
                className="admin-btn-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  try {
                    // Detect if mobile device
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    if (isMobile) {
                      // For mobile: open in new window (allows user to save)
                      const newWindow = window.open(downloadInfo.url, '_blank');
                      if (!newWindow) {
                        // If popup blocked, try direct navigation
                        window.location.href = downloadInfo.url;
                      }
                    } else {
                      // For desktop: programmatic download
                      const link = document.createElement('a');
                      link.href = downloadInfo.url;
                      link.download = downloadInfo.fileName;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                    
                    // Small delay before closing modal on mobile
                    setTimeout(() => {
                      setShowDownloadModal(false);
                    }, isMobile ? 500 : 0);
                  } catch (error) {
                    console.error('Download error:', error);
                    alert('Failed to download file. Please try again.');
                  }
                }}
                className="admin-btn text-center"
              >
                Download {downloadInfo.type}
              </button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};

ExportRota.propTypes = {
  initialTab: PropTypes.oneOf(['weekly', 'additional']),
  initialStartDate: PropTypes.instanceOf(Date),
  onBaselineChanged: PropTypes.func,
};

ExportRota.defaultProps = {
  initialTab: 'weekly',
  initialStartDate: null,
  onBaselineChanged: null,
};

export default ExportRota; 