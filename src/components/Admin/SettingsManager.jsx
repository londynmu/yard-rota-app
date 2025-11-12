import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';

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
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black dark:border-white"></div>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm w-full max-w-full overflow-hidden">
      {/* Settings Sections Navigation */}
      <div className="flex mb-6 overflow-x-auto pb-2 -mx-4 px-4">
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 ${
            activeSection === 'notifications' 
              ? 'bg-black dark:bg-white text-white dark:text-black' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
          onClick={() => setActiveSection('notifications')}
        >
          Notifications
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium mr-2 ${
            activeSection === 'team' 
              ? 'bg-black dark:bg-white text-white dark:text-black' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
          onClick={() => setActiveSection('team')}
        >
          Team Management
        </button>
      </div>
      
      {/* Notification Settings */}
      {activeSection === 'notifications' && (
        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-charcoal dark:text-white mb-4">Notification Settings</h3>
          
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
            ? 'bg-green-500 text-green-100 border border-green-400' 
            : 'bg-red-500 text-red-100 border border-red-400'
        }`}>
          {saveMessage.text}
        </div>
      )}
    </div>
  );
}