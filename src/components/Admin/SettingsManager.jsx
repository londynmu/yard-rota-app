import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import LocationConfigManager from './LocationConfigManager';
import AgencyConfigManager from './AgencyConfigManager';

export default function SettingsManager() {
  // State for various settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [reminderDays, setReminderDays] = useState(2);
  const [availabilityUpdates, setAvailabilityUpdates] = useState(true);
  const [minStaffingDay, setMinStaffingDay] = useState(3);
  const [minStaffingNight, setMinStaffingNight] = useState(2);
  
  // State for active section
  const [activeSection, setActiveSection] = useState('notifications');
  
  // For form submissions and changes
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: '', type: '' });
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from database
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('settings')
          .select('key, value');
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Convert settings array to object for easier lookup
          const settingsMap = data.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
          }, {});
          
          // Update notification settings if available
          if (settingsMap.email_notifications) setEmailNotifications(settingsMap.email_notifications === 'true');
          if (settingsMap.reminder_days) setReminderDays(Number(settingsMap.reminder_days));
          if (settingsMap.availability_updates) setAvailabilityUpdates(settingsMap.availability_updates === 'true');
          
          // Update team settings if available
          if (settingsMap.min_staffing_day) setMinStaffingDay(Number(settingsMap.min_staffing_day));
          if (settingsMap.min_staffing_night) setMinStaffingNight(Number(settingsMap.min_staffing_night));
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
  }, []);

  // Save settings
  const saveSettings = async (section) => {
    setIsSaving(true);
    setSaveMessage({ text: '', type: '' });
    
    try {
      // Determine which settings to update based on the section
      let settingsToUpdate = [];
      
      if (section === 'Notification') {
        settingsToUpdate = [
          { key: 'email_notifications', value: emailNotifications.toString() },
          { key: 'reminder_days', value: reminderDays.toString() },
          { key: 'availability_updates', value: availabilityUpdates.toString() }
        ];
      }
      else if (section === 'Team') {
        settingsToUpdate = [
          { key: 'min_staffing_day', value: minStaffingDay.toString() },
          { key: 'min_staffing_night', value: minStaffingNight.toString() }
        ];
      }
      
      // Update settings in the database
      for (const setting of settingsToUpdate) {
        const { error } = await supabase
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
      <span className="text-gray-700 text-sm">{label}</span>
      <button
        type="button"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          enabled ? 'bg-charcoal' : 'bg-gray-300'
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
      <div className="w-full max-w-full animate-pulse">
        {/* Tabs skeleton */}
        <div className="flex mb-4 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-32 bg-slate-200 rounded-lg" />
          ))}
        </div>
        
        {/* Content skeleton */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <div className="h-6 w-40 bg-slate-300 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-slate-200 rounded" />
                <div className="h-10 bg-slate-200 rounded" />
                <div className="h-10 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
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
            activeSection === 'notifications' 
              ? 'bg-charcoal text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveSection('notifications')}
        >
          Notifications
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap text-sm ${
            activeSection === 'team' 
              ? 'bg-charcoal text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveSection('team')}
        >
          Team Management
        </button>
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
      
      {/* Notification Settings */}
      {activeSection === 'notifications' && (
        <div className="bg-gray-50 rounded-lg p-5 mb-4 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h3>
          
          <div className="space-y-4">
            <ToggleSwitch
              enabled={emailNotifications}
              onChange={setEmailNotifications}
              label="Email Notifications"
            />
            
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-2">
                Reminder Days Before Shift
              </label>
              <input
                type="number"
                min="0"
                max="14"
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
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
            className={`mt-4 px-4 py-2 bg-charcoal hover:bg-charcoal/90 rounded-lg text-white transition-colors ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Notification Settings'}
          </button>
        </div>
      )}
      
      {/* Team Management Settings */}
      {activeSection === 'team' && (
        <div className="bg-gray-50 rounded-lg p-5 mb-4 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Management</h3>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Minimum Staffing Level (Day Shift)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={minStaffingDay}
              onChange={(e) => setMinStaffingDay(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Minimum Staffing Level (Night Shift)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={minStaffingNight}
              onChange={(e) => setMinStaffingNight(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
            />
          </div>
          
          <button
            type="button"
            onClick={() => saveSettings('Team')}
            disabled={isSaving}
            className={`mt-4 px-4 py-2 bg-charcoal hover:bg-charcoal/90 rounded-lg text-white transition-colors ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Team Settings'}
          </button>
        </div>
      )}
      
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
      
      {/* Success/Error Message */}
      {saveMessage.text && (
        <div className={`mt-4 p-3 rounded-lg text-sm ${
          saveMessage.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {saveMessage.text}
        </div>
      )}
    </div>
  );
}