import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ShiftDashboard from '../User/ShiftDashboard';
import BreaksFilterBar from './BreaksFilterBar';

const stopPropagation = (event) => event.stopPropagation();

/** Main page break list (ShiftDashboard breaks view) with the location + shift filter bar. */
export default function BreaksPanel({ filters, fullWidthFilters = false, isolateFilterClicks = false }) {
  const [shiftCounts, setShiftCounts] = useState({ day: 0, afternoon: 0, night: 0 });
  const {
    availableLocations,
    selectedLocation,
    selectedShifts,
    handleLocationToggle,
    handleShiftToggle,
  } = filters;

  const filterBar = (
    <BreaksFilterBar
      availableLocations={availableLocations}
      selectedLocation={selectedLocation}
      selectedShifts={selectedShifts}
      shiftCounts={shiftCounts}
      onLocationToggle={handleLocationToggle}
      onShiftToggle={handleShiftToggle}
      fullWidth={fullWidthFilters}
    />
  );

  return (
    <ShiftDashboard
      initialView="breaks"
      hideTabSwitcher={true}
      hideLocationButton={true}
      selectedLocation={selectedLocation}
      selectedShifts={selectedShifts}
      onShiftCountsChange={setShiftCounts}
      breakHeaderControls={
        isolateFilterClicks ? <div onClick={stopPropagation}>{filterBar}</div> : filterBar
      }
    />
  );
}

BreaksPanel.propTypes = {
  filters: PropTypes.shape({
    availableLocations: PropTypes.arrayOf(PropTypes.string).isRequired,
    selectedLocation: PropTypes.string,
    selectedShifts: PropTypes.arrayOf(PropTypes.string).isRequired,
    handleLocationToggle: PropTypes.func.isRequired,
    handleShiftToggle: PropTypes.func.isRequired,
  }).isRequired,
  fullWidthFilters: PropTypes.bool,
  isolateFilterClicks: PropTypes.bool,
};
