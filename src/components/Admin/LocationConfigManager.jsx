import React from 'react';
import LocationManager from './LocationManager';

export default function LocationConfigManager({ showAddForm, setShowAddForm }) {
  return (
    <LocationManager
      showAddForm={showAddForm}
      setShowAddForm={setShowAddForm}
    />
  );
} 