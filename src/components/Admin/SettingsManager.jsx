import React, { useState, useEffect } from 'react';
import LocationConfigManager from './LocationConfigManager';
import AgencyConfigManager from './AgencyConfigManager';

export default function SettingsManager() {
  const [activeSection, setActiveSection] = useState('locations');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-row flex-nowrap items-center gap-2 md:h-8">
          <div className="h-8 bg-gray-100 rounded-lg p-0.5 w-48 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar – same as Tug Management: one line, tabs left, overflow-x-auto */}
      <div className="flex flex-row flex-nowrap items-center justify-between gap-1 md:gap-2 md:h-8 overflow-x-auto min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0 md:flex-1 md:min-w-0 md:h-8">
          <div className="flex bg-gray-100 rounded-lg p-0.5 h-8 flex-shrink-0">
            {[
              { id: 'locations', label: 'Locations' },
              { id: 'agencies', label: 'Agencies' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`h-7 px-3 text-xs font-medium rounded-md transition-all flex items-center ${
                  activeSection === tab.id
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-500 hover:text-charcoal'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeSection === 'locations' && (
          <div className="flex gap-1 md:gap-2 flex-shrink-0 h-8">
            <button
              onClick={() => setShowAddLocationForm(true)}
              className="h-8 px-2 md:px-4 text-xs font-semibold bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 md:gap-1.5 border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add
            </button>
          </div>
        )}
      </div>

      {/* Content – floating cards, no wrapper (same as Tug Management) */}
      <div className="space-y-4 -mt-px">
        {activeSection === 'locations' && (
          <LocationConfigManager
            showAddForm={showAddLocationForm}
            setShowAddForm={setShowAddLocationForm}
          />
        )}
        {activeSection === 'agencies' && <AgencyConfigManager />}
      </div>
    </div>
  );
}
