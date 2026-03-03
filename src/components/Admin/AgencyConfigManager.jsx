import React from 'react';
import AgencyManager from './AgencyManager';

export default function AgencyConfigManager({ showAddForm, setShowAddForm }) {
  return (
    <AgencyManager
      showAddForm={showAddForm}
      setShowAddForm={setShowAddForm}
    />
  );
} 