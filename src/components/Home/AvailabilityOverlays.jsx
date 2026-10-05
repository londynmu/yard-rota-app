import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import AvailabilityDialog from '../Calendar/AvailabilityDialog';

/** Centered save popup + availability dialog driven by `useAvailabilityEditor`. */
export default function AvailabilityOverlays({ editor }) {
  const {
    popup,
    selectedDate,
    selectedDates,
    dayData,
    isSavingAvailability,
    handleCloseDialog,
    handleSaveAvailability,
  } = editor;

  return (
    <>
      {popup.show && (
        <div className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 p-4 rounded-xl shadow-lg text-center text-base font-medium border backdrop-blur-sm
                     ${popup.type === 'error' ? 'bg-rota-alert-error-bg text-rota-alert-error-text border-rota-alert-error-border' : 'bg-emerald-50/95 text-emerald-800 border-emerald-300/70'}`}>
          {popup.message}
        </div>
      )}

      {selectedDate && (
        <AvailabilityDialog
          date={selectedDate}
          initialData={dayData[format(selectedDate, 'yyyy-MM-dd')]}
          availabilityByDate={dayData}
          initialSelectedDates={selectedDates}
          onClose={handleCloseDialog}
          onSave={handleSaveAvailability}
          isSaving={isSavingAvailability}
        />
      )}
    </>
  );
}

AvailabilityOverlays.propTypes = {
  editor: PropTypes.shape({
    popup: PropTypes.shape({
      show: PropTypes.bool,
      type: PropTypes.string,
      message: PropTypes.string,
    }).isRequired,
    selectedDate: PropTypes.instanceOf(Date),
    selectedDates: PropTypes.arrayOf(PropTypes.string).isRequired,
    dayData: PropTypes.object.isRequired,
    isSavingAvailability: PropTypes.bool.isRequired,
    handleCloseDialog: PropTypes.func.isRequired,
    handleSaveAvailability: PropTypes.func.isRequired,
  }).isRequired,
};
