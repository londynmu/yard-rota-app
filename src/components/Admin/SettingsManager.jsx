import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LocationConfigManager from './LocationConfigManager';
import AgencyConfigManager from './AgencyConfigManager';

export default function SettingsManager() {
  const [activeSection, setActiveSection] = useState('locations');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [showAddAgencyForm, setShowAddAgencyForm] = useState(false);
  const [showManageBreaksButton, setShowManageBreaksButton] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection !== 'home-page') return;
    const fetchSetting = async () => {
      setSettingsLoading(true);
      try {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'show_manage_breaks_button')
          .single();
        setShowManageBreaksButton(data?.value !== 'false');
      } catch (err) {
        console.error('[SettingsManager] Fetch show_manage_breaks_button error:', err);
        setShowManageBreaksButton(true);
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSetting();
  }, [activeSection]);

  const saveShowManageBreaksButton = async (enabled, rollback) => {
    setSettingsSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'show_manage_breaks_button',
          value: enabled ? 'true' : 'false',
          description: 'Show the Manage my breaks button on the home (calendar) page',
        }, { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('[SettingsManager] Save show_manage_breaks_button error:', err);
      rollback();
      alert('Error saving setting.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleToggleManageBreaks = async () => {
    if (settingsLoading || settingsSaving) return;
    const nextValue = !showManageBreaksButton;
    setShowManageBreaksButton(nextValue);
    await saveShowManageBreaksButton(nextValue, () => setShowManageBreaksButton(!nextValue));
  };

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
              { id: 'home-page', label: 'Home page' },
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
        {activeSection === 'agencies' && (
          <div className="flex gap-1 md:gap-2 flex-shrink-0 h-8">
            <button
              onClick={() => setShowAddAgencyForm(true)}
              className="h-8 px-2 md:px-4 text-xs font-semibold bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1 md:gap-1.5 border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Agency
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
        {activeSection === 'agencies' && (
          <AgencyConfigManager
            showAddForm={showAddAgencyForm}
            setShowAddForm={setShowAddAgencyForm}
          />
        )}
        {activeSection === 'home-page' && (
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
            <div className="px-3 py-2 min-h-[44px] bg-gray-50 border-b border-gray-200 flex items-center">
              <h3 className="text-sm font-semibold text-charcoal">Home page</h3>
            </div>
            <div className="p-3 bg-yellow-50/50">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="show-manage-breaks-toggle" className="text-sm text-charcoal font-medium">
                  Show &quot;Manage my breaks&quot; button on home page
                </label>
                <button
                  type="button"
                  id="show-manage-breaks-toggle"
                  role="switch"
                  aria-checked={showManageBreaksButton}
                  disabled={settingsLoading || settingsSaving}
                  onClick={handleToggleManageBreaks}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    showManageBreaksButton ? 'bg-black' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                      showManageBreaksButton ? 'translate-x-5' : 'translate-x-1'
                    }`}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
