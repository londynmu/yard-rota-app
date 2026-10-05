import React, { useRef } from 'react';
import CalendarGrid from '../../components/Calendar/CalendarGrid';
import CalendarMonthHeader from '../../components/Home/CalendarMonthHeader';
import AvailabilityOverlays from '../../components/Home/AvailabilityOverlays';
import { useAvailabilityEditor } from '../../hooks/useAvailabilityEditor';
import { useFitScreenScrollLock } from '../../hooks/useFitScreenScrollLock';

/** Mobile Home → Calendar: month view for setting availability, nothing else. */
export default function CalendarTab() {
  const editor = useAvailabilityEditor();
  const contentRef = useRef(null);

  // The month fits on one screen, so it must not slide under the sticky tabs bar
  useFitScreenScrollLock(contentRef);

  return (
    <>
      <div ref={contentRef} className="bg-transparent px-4 py-6">
        <div className="max-w-4xl mx-auto">
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
