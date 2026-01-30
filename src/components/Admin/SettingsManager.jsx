import React, { useState, useEffect } from 'react';
import LocationConfigManager from './LocationConfigManager';
import AgencyConfigManager from './AgencyConfigManager';

export default function SettingsManager() {
  // State for active section
  const [activeSection, setActiveSection] = useState('locations');
  
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from database
  useEffect(() => {
    // Simply mark as loaded since we only have component-based managers now
    setIsLoading(false);
  }, []);

  
  if (isLoading) {
    return (
      <div className="w-full max-w-full animate-pulse">
        {/* Tabs skeleton */}
        <div className="flex mb-4 gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-10 w-32 bg-slate-200 rounded-lg" />
          ))}
        </div>
        
        {/* Content skeleton */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <div className="h-6 w-40 bg-slate-300 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-10 bg-slate-200 rounded" />
              <div className="h-10 bg-slate-200 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full max-w-full">
      {/* Settings Sections Navigation */}
      <div className="flex mb-4 overflow-x-auto pb-2 gap-2">
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap text-sm ${
            activeSection === 'locations' 
              ? 'bg-charcoal text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveSection('locations')}
        >
          Locations
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap text-sm ${
            activeSection === 'agencies' 
              ? 'bg-charcoal text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveSection('agencies')}
        >
          Agencies
        </button>
      </div>
      
      {/* Locations Management */}
      {activeSection === 'locations' && (
        <div className="mb-4">
          <LocationConfigManager />
        </div>
      )}
      
      {/* Agencies Management */}
      {activeSection === 'agencies' && (
        <div className="mb-4">
          <AgencyConfigManager />
        </div>
      )}
    </div>
  );
}