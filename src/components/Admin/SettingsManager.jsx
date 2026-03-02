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
      <div>
        <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
          <div className="w-full px-4 py-3 flex items-center justify-between bg-red-50 border-b border-red-200/60">
            <div className="h-4 w-24 bg-red-200/60 rounded animate-pulse" />
            <div className="flex gap-1 rounded-md border border-gray-200 p-0.5 bg-gray-100">
              <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="p-4 border-t border-red-100 bg-yellow-50/50">
            <div className="h-10 w-full max-w-md bg-gray-100 rounded-lg animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-xl border border-red-200 bg-yellow-50/80 shadow-sm overflow-hidden">
        {/* Header – red bar, yellow container like Shunter of the Month */}
        <div className="w-full px-4 py-3 bg-red-50 border-b border-red-200/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-red-800">Settings</p>
            <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-100">
              <button
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors ${
                  activeSection === 'locations'
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
                onClick={() => setActiveSection('locations')}
              >
                Locations
              </button>
              <button
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded transition-colors ${
                  activeSection === 'agencies'
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-600 hover:text-charcoal'
                }`}
                onClick={() => setActiveSection('agencies')}
              >
                Agencies
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="border-t border-red-100 p-4 bg-yellow-50/50">
          {activeSection === 'locations' && (
            <LocationConfigManager />
          )}
          {activeSection === 'agencies' && (
            <AgencyConfigManager />
          )}
        </div>
      </div>
    </div>
  );
}