import React, { useState, useEffect } from 'react';
import LocationManager from './LocationManager';
import PropTypes from 'prop-types';

export default function SettingsManager({ supabaseClient }) {
  // State for various settings
  const [workHoursStart, setWorkHoursStart] = useState('08:00');
  const [workHoursEnd, setWorkHoursEnd] = useState('16:00');
  const [weekStartDay, setWeekStartDay] = useState('saturday');
  const [defaultShiftLength, setDefaultShiftLength] = useState(8);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [reminderDays, setReminderDays] = useState(2);
  const [availabilityUpdates, setAvailabilityUpdates] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [defaultView, setDefaultView] = useState('team');
  const [minStaffingDay, setMinStaffingDay] = useState(3);
  const [minStaffingNight, setMinStaffingNight] = useState(2);
  const [minBreakBetweenSlots, setMinBreakBetweenSlots] = useState(60); // Value in minutes (for DB)
  const [minBreakHours, setMinBreakHours] = useState(1); // Value in hours (for UI)
  
  // State for active section
  const [activeSection, setActiveSection] = useState('system');
  
  // For form submissions and changes
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: '', type: '' });
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from database
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabaseClient
          .from('settings')
          .select('key, value');
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Convert settings array to object for easier lookup
          const settingsMap = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {});
          
          // Update state with values from database
          if (settingsMap.working_hours_start) setWorkHoursStart(settingsMap.working_hours_start);
          if (settingsMap.working_hours_end) setWorkHoursEnd(settingsMap.working_hours_end);
          if (settingsMap.default_shift_length) setDefaultShiftLength(Number(settingsMap.default_shift_length));
          if (settingsMap.default_theme) setTheme(settingsMap.default_theme);
          
          // Set min break between slots if available
          if (settingsMap.min_break_between_slots) {
            const minutes = Number(settingsMap.min_break_between_slots);
            setMinBreakBetweenSlots(minutes);
            setMinBreakHours(minutes / 60); // Convert minutes from DB to hours for UI
          } else {
            // Default to 9 hours (540 minutes) if not set in DB
            setMinBreakBetweenSlots(540);
            setMinBreakHours(9);
          }
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        setSaveMessage({
          text: 'Failed to load settings',
          type: 'error'
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, [supabaseClient]);

  // Save settings
  const saveSettings = async (section) => {
    setIsSaving(true);
    setSaveMessage({ text: '', type: '' });
    
    try {
      // Determine which settings to update based on the section
      let settingsToUpdate = [];
      
      if (section === 'System') {
        settingsToUpdate = [
          { key: 'working_hours_start', value: workHoursStart },
          { key: 'working_hours_end', value: workHoursEnd },
          { key: 'default_shift_length', value: defaultShiftLength.toString() },
          { key: 'min_break_between_slots', value: minBreakBetweenSlots.toString() } // Save minutes to DB
        ];
      }
      else if (section === 'Preference') {
        settingsToUpdate = [
          { key: 'default_theme', value: theme },
          { key: 'default_view', value: defaultView }
        ];
      }
      // Add other sections as needed
      
      // Update settings in the database
      for (const setting of settingsToUpdate) {
        const { error } = await supabaseClient
          .from('settings')
          .upsert({ 
            key: setting.key, 
            value: setting.value 
          }, { 
            onConflict: 'key',
            returning: 'minimal'
          });
          
        if (error) throw error;
      }
      
      // Show success message
      setSaveMessage({ 
        text: `${section} settings saved successfully`, 
        type: 'success' 
      });
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setSaveMessage({ text: '', type: '' });
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage({ 
        text: 'Failed to save settings: ' + error.message, 
        type: 'error' 
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Toggle switch component
  const ToggleSwitch = ({ enabled, onChange, label }) => (
    <div className="flex items-center justify-between">
      <span className="text-white text-sm">{label}</span>
      <button
        type="button"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          enabled ? 'bg-blue-500/70' : 'bg-white/20'
        }`}
        onClick={() => onChange(!enabled)}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
  
  ToggleSwitch.propTypes = {
    enabled: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string.isRequired
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }
  
  return (
    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/20 shadow-xl w-full max-w-full overflow-hidden">
      {/* Settings Sections Navigation */}
      <div className="flex mb-6 overflow-x-auto pb-2 -mx-4 px-4">
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 transition-colors ${
            activeSection === 'system' 
              ? 'bg-blue-600/60 text-white' 
              : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
          }`}
          onClick={() => setActiveSection('system')}
        >
          System Config
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 transition-colors ${
            activeSection === 'notifications' 
              ? 'bg-blue-600/60 text-white' 
              : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
          }`}
          onClick={() => setActiveSection('notifications')}
        >
          Notifications
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 transition-colors ${
            activeSection === 'preferences' 
              ? 'bg-blue-600/60 text-white' 
              : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
          }`}
          onClick={() => setActiveSection('preferences')}
        >
          Preferences
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 transition-colors ${
            activeSection === 'team' 
              ? 'bg-blue-600/60 text-white' 
              : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
          }`}
          onClick={() => setActiveSection('team')}
        >
          Team Management
        </button>
      </div>
      
      {/* System Configuration Settings */}
      {activeSection === 'system' && (
        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">System Configuration</h3>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Working Hours
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="time"
                value={workHoursStart}
                onChange={(e) => setWorkHoursStart(e.target.value)}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
              />
              <span className="text-white">to</span>
              <input
                type="time"
                value={workHoursEnd}
                onChange={(e) => setWorkHoursEnd(e.target.value)}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Week Start Day
            </label>
            <select
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              <option value="monday">Monday</option>
              <option value="saturday">Saturday</option>
              <option value="sunday">Sunday</option>
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Default Shift Length (hours)
            </label>
            <input
              type="number"
              min="1"
              max="24"
              value={defaultShiftLength}
              onChange={(e) => setDefaultShiftLength(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Minimum Time Off Between Shifts (hours)
            </label>
            <div className="flex items-center">
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={minBreakHours}
                onChange={(e) => {
                  const hours = Number(e.target.value);
                  setMinBreakHours(hours);
                  setMinBreakBetweenSlots(Math.round(hours * 60));
                }}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Minimum required rest time for an employee before starting their next shift (0 = no restriction).
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => saveSettings('System')}
            disabled={isSaving}
            className={`mt-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save System Settings'}
          </button>
        </div>
      )}
      
      {/* User Preferences */}
      {activeSection === 'preferences' && (
        <>
          <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">User Preferences</h3>
            
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">
                Theme
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center justify-center p-3 border rounded-md cursor-pointer transition-colors ${
                  theme === 'dark' 
                  ? 'bg-blue-500/40 border-blue-400/50 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white/80'
                }`}>
                  <input
                    type="radio"
                    name="theme"
                    value="dark"
                    checked={theme === 'dark'}
                    onChange={() => setTheme('dark')}
                    className="sr-only"
                  />
                  <span>Dark Theme</span>
                </label>
                
                <label className={`flex items-center justify-center p-3 border rounded-md cursor-pointer transition-colors ${
                  theme === 'light' 
                  ? 'bg-blue-500/40 border-blue-400/50 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white/80'
                }`}>
                  <input
                    type="radio"
                    name="theme"
                    value="light"
                    checked={theme === 'light'}
                    onChange={() => setTheme('light')}
                    className="sr-only"
                  />
                  <span>Light Theme</span>
                </label>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-white text-sm font-medium mb-2">
                Default View
              </label>
              <select
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
              >
                <option value="team">Team View</option>
                <option value="calendar">Calendar</option>
                <option value="admin">Admin Dashboard</option>
              </select>
            </div>
            
            <button
              type="button"
              onClick={() => saveSettings('Preference')}
              disabled={isSaving}
              className={`mt-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
          
          {/* Location Manager */}
          <LocationManager supabaseClient={supabaseClient} />
        </>
      )}
      
      {/* Notification Settings */}
      {activeSection === 'notifications' && (
        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Notification Settings</h3>
          
          <div className="space-y-4">
            <ToggleSwitch
              enabled={emailNotifications}
              onChange={setEmailNotifications}
              label="Email Notifications"
            />
            
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Reminder Days Before Shift
              </label>
              <input
                type="number"
                min="0"
                max="14"
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            
            <ToggleSwitch
              enabled={availabilityUpdates}
              onChange={setAvailabilityUpdates}
              label="Availability Update Notifications"
            />
          </div>
          
          <button
            type="button"
            onClick={() => saveSettings('Notification')}
            disabled={isSaving}
            className={`mt-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Notification Settings'}
          </button>
        </div>
      )}
      
      {/* Team Management Settings */}
      {activeSection === 'team' && (
        <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Team Management</h3>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Minimum Staffing Level (Day Shift)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={minStaffingDay}
              onChange={(e) => setMinStaffingDay(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-white text-sm font-medium mb-2">
              Minimum Staffing Level (Night Shift)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={minStaffingNight}
              onChange={(e) => setMinStaffingNight(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          
          <div className="mb-4 mt-6 border-t border-white/10 pt-4">
            <h4 className="text-md font-medium text-white mb-2">Performance Score Legend</h4>
            <div className="grid grid-cols-3 gap-2">
              <div className="px-2 py-1 bg-emerald-500/70 rounded text-white text-xs text-center">
                90-99: Excellent
              </div>
              <div className="px-2 py-1 bg-green-400/70 rounded text-white text-xs text-center">
                80-89: Very Good
              </div>
              <div className="px-2 py-1 bg-emerald-200/80 rounded text-white text-xs text-center">
                70-79: Good
              </div>
              <div className="px-2 py-1 bg-yellow-400/70 rounded text-white text-xs text-center">
                60-69: Above Average
              </div>
              <div className="px-2 py-1 bg-orange-400/70 rounded text-white text-xs text-center">
                50-59: Average
              </div>
              <div className="px-2 py-1 bg-pink-400/70 rounded text-white text-xs text-center">
                40-49: Below Average
              </div>
              <div className="px-2 py-1 bg-rose-400/70 rounded text-white text-xs text-center">
                30-39: Poor
              </div>
              <div className="px-2 py-1 bg-red-500/70 rounded text-white text-xs text-center">
                20-29: Very Poor
              </div>
              <div className="px-2 py-1 bg-red-700/70 rounded text-white text-xs text-center">
                1-19: Critical
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => saveSettings('Team')}
            disabled={isSaving}
            className={`mt-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Team Settings'}
          </button>
        </div>
      )}
      
      {/* Success/Error Message */}
      {saveMessage.text && (
        <div className={`mt-4 p-3 rounded-md ${
          saveMessage.type === 'success' 
            ? 'bg-green-500/20 text-green-100 border border-green-400/30' 
            : 'bg-red-500/20 text-red-100 border border-red-400/30'
        }`}>
          {saveMessage.text}
        </div>
      )}
    </div>
  );
}

SettingsManager.propTypes = {
  supabaseClient: PropTypes.object.isRequired,
}; 