/**
 * Schedule export utilities for PDF and WhatsApp sharing
 */

import { format, addDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatTime } from './rotaHelpers';

/**
 * Generate WhatsApp share text for schedule
 * @param {Object} params - Parameters for sharing
 * @param {Date} params.weekStart - Start date of the week
 * @param {string} params.selectedLocation - Location name
 * @param {Object} params.dailyRotaData - Schedule data grouped by date
 * @returns {string} Formatted text for WhatsApp
 */
export const generateWhatsAppScheduleText = ({ weekStart, selectedLocation, dailyRotaData }) => {
  const dateRange = `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;
  const baseText = `Schedule for ${selectedLocation} (${dateRange}):\n\n`;
  
  let scheduleText = baseText;
  
  // Group slots by days
  Object.entries(dailyRotaData).forEach(([date, slots]) => {
    const dateObj = new Date(date);
    const dayName = format(dateObj, 'EEEE, MMM d');
    scheduleText += `📅 ${dayName}:\n`;
    
    // Group slots by shift type
    const daySlots = slots.filter(slot => slot.profiles);
    const slotsByType = {
      day: daySlots.filter(s => s.shift_type === 'day'),
      afternoon: daySlots.filter(s => s.shift_type === 'afternoon'),
      night: daySlots.filter(s => s.shift_type === 'night')
    };
    
    // Add shift information
    Object.entries(slotsByType).forEach(([type, typeSlots]) => {
      if (typeSlots.length > 0) {
        const emoji = type === 'day' ? '☀️' : type === 'afternoon' ? '🌆' : '🌙';
        scheduleText += `${emoji} ${type.toUpperCase()} shift:\n`;
        
        // Add employees
        typeSlots.forEach(slot => {
          const name = slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : 'Unknown';
          scheduleText += `- ${name}: ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}${slot.task ? ` (${slot.task})` : ''}\n`;
        });
        scheduleText += '\n';
      }
    });
  });
  
  return scheduleText;
};

/**
 * Share schedule to WhatsApp
 * @param {Object} params - Parameters for sharing
 */
export const shareToWhatsApp = (params) => {
  const scheduleText = generateWhatsAppScheduleText(params);
  const encodedText = encodeURIComponent(scheduleText);
  window.open(`https://wa.me/?text=${encodedText}`, '_blank');
};

/**
 * Generate PDF for weekly schedule
 * @param {Object} params - Parameters for PDF generation
 * @param {Date} params.weekStart - Start date of the week
 * @param {string} params.selectedLocation - Location name
 * @param {Object} params.dailyRotaData - Schedule data grouped by date
 * @returns {Object} { success: boolean, fileName: string, error: string }
 */
export const generateSchedulePDF = ({ weekStart, selectedLocation, dailyRotaData }) => {
  try {
    // Create new PDF document (A4 landscape)
    const doc = new jsPDF('landscape');

    // Format date range for title
    const dateRange = `${format(weekStart, 'dd/MM/yyyy')} - ${format(addDays(weekStart, 6), 'dd/MM/yyyy')}`;
    const title = `Weekly Schedule: ${dateRange}`;
    
    // Add title
    doc.setFontSize(14);
    doc.text(title, 14, 20);
    
    // Add generation timestamp
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);

    // Draw rectangle with location information
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(14, 32, 100, 10, 1, 1, 'F');
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Location: ${selectedLocation}`, 18, 39);
    doc.setTextColor(0, 0, 0);

    // Prepare dates array for column headers
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
    
    // Group all employees from all days
    const employeesMap = {};
    
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
    
    // Prepare table data
    const tableData = [];
    
    // Add employee rows
    employees.forEach(employee => {
      const row = [employee.name];
      
      // For each day of the week, add shift info
      dates.forEach((dateInfo, index) => {
        const currentDate = format(addDays(weekStart, index), 'yyyy-MM-dd');
        const shiftsForDay = employee.shifts[currentDate] || [];
        
        if (shiftsForDay.length === 0) {
          row.push('');
        } else {
          // Format shifts info, sorted by start time
          const shiftsText = shiftsForDay
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map(shift => {
              let shiftInfo = `${formatTime(shift.start_time)}-${formatTime(shift.end_time)}`;
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
      startY: 44,
      head: [tableColumn],
      foot: [tableColumn],
      body: tableData,
      theme: 'grid',
      styles: { 
        overflow: 'linebreak', 
        fontSize: 7,
        cellPadding: 1,
        lineColor: [210, 210, 210],
        lineWidth: 0.1,
        valign: 'middle'
      },
      headStyles: { 
        fillColor: [50, 50, 80],
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
        0: { cellWidth: 35 },
      },
      alternateRowStyles: {
        fillColor: [240, 240, 250]
      },
      rowPageBreak: 'avoid',
      bodyStyles: {
        minCellHeight: 10,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      margin: { top: 44, right: 10, bottom: 10, left: 10 },
      didParseCell: function(data) {
        if (data.cell.raw && typeof data.cell.raw === 'object' && data.cell.raw.colSpan) {
          data.cell.colSpan = data.cell.raw.colSpan;
          if (data.cell.raw.styles) {
            Object.assign(data.cell.styles, data.cell.raw.styles);
          }
        }
        
        if (data.cell.raw && 
            typeof data.cell.raw === 'object' && 
            data.cell.raw.colSpan && 
            data.row.index > 0 && 
            data.row.section === 'body') {
          data.row.pageBreak = 'before';
        }
        
        if (data.column.index > 0) {
          data.cell.styles.cellWidth = 'wrap';
          data.cell.styles.cellPadding = 1;
          data.cell.styles.halign = 'center';
        }
        
        if (data.column.index === 0 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'left';
        }
      },
      willDrawCell: function(data) {
        if (data.row.section === 'body' && 
            data.column.index === 0 && 
            data.cell.text && 
            typeof data.cell.text === 'string' &&
            !data.cell.raw?.colSpan) {
              
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
            
            const x = data.cell.x + data.cell.width / 2;
            const y = data.cell.y + data.cell.height - 2;
            
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
        
        // Draw rectangle with location info
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
        
        const totalPages = doc.getNumberOfPages();
        doc.text(`Page ${data.pageNumber} of ${totalPages}`, pageSize.width / 2, pageHeight - 10, { align: 'center' });
      }
    });
    
    // Generate filename
    const fileName = `${selectedLocation}_Schedule_${format(weekStart, 'yyyy-MM-dd')}.pdf`;
    
    // Save the PDF
    doc.save(fileName);
    
    return {
      success: true,
      fileName,
      dateRange: `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
    };
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    return {
      success: false,
      fileName: null,
      dateRange: null,
      error: error.message || 'Unknown error'
    };
  }
};

/**
 * Share schedule message via WhatsApp after PDF download
 * @param {string} selectedLocation - Location name
 * @param {string} dateRange - Date range string
 */
export const shareScheduleMessage = (selectedLocation, dateRange) => {
  const message = encodeURIComponent(
    `Schedule for ${selectedLocation} (${dateRange}). Please see the PDF I've just sent you separately.`
  );
  window.open(`https://wa.me/?text=${message}`, '_blank');
};
