import React from 'react';
import CalendarGrid from '../../components/Calendar/CalendarGrid';
import CalendarMonthHeader from '../../components/Home/CalendarMonthHeader';
import AvailabilityOverlays from '../../components/Home/AvailabilityOverlays';
import { useAvailabilityEditor } from '../../hooks/useAvailabilityEditor';

/** Mobile Home → Calendar: month view for setting availability, nothing else. */
export default function CalendarTab() {
  const editor = useAvailabilityEditor();

  return (
    <>
      <div className="h-full overflow-y-auto bg-transparent px-4 py-6 pb-6">
        <div className="page-content-inner-desktop-wide">
          {editor.errorMessage && (
            <div className="mb-4 p-3 bg-rota-alert-error-bg text-rota-alert-error-text border border-rota-alert-error-border rounded-xl shadow-sm">
              {editor.errorMessage}
            </div>
          )}

          <div className="min-w-0">
            <CalendarMonthHeader
              currentDate={editor.currentDate}
              onPrevious={editor.handlePreviousMonth}
              onNext={editor.handleNextMonth}
            />

            <CalendarGrid
              currentDate={editor.currentDate}
              dayData={editor.dayData}
              onDayClick={editor.handleDayClick}
              isLoading={editor.loading}
            />
          </div>
        </div>
      </div>

      <AvailabilityOverlays editor={editor} />
    </>
  );
}
