import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ui/ToastContext';

export default function BreaksConfigManager() {
  // State for system configuration settings
  const [workHoursStart, setWorkHoursStart] = useState('08:00');
  const [workHoursEnd, setWorkHoursEnd] = useState('16:00');
  const [weekStartDay, setWeekStartDay] = useState('saturday');
  const [defaultShiftLength, setDefaultShiftLength] = useState(8);
  const [minBreakBetweenSlots, setMinBreakBetweenSlots] = useState(60); // Value in minutes (for DB)
  const [minBreakHours, setMinBreakHours] = useState(1); // Value in hours (for UI)
  
  // For form submissions and changes
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

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
          
          // Update state with values from database
          if (settingsMap.working_hours_start) setWorkHoursStart(settingsMap.working_hours_start);
          if (settingsMap.working_hours_end) setWorkHoursEnd(settingsMap.working_hours_end);
          if (settingsMap.default_shift_length) setDefaultShiftLength(Number(settingsMap.default_shift_length));
          
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
        toast.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, [toast]);

  // Save system settings
  const saveSettings = async () => {
    setIsSaving(true);
    
    try {
      // Define settings to update
      const settingsToUpdate = [
        { key: 'working_hours_start', value: workHoursStart },
        { key: 'working_hours_end', value: workHoursEnd },
        { key: 'default_shift_length', value: defaultShiftLength.toString() },
        { key: 'min_break_between_slots', value: minBreakBetweenSlots.toString() } // Save minutes to DB
      ];
      
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
      toast.success('Breaks configuration settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setIsSaving(false);
    }
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
      <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
        <h3 className="text-lg font-semibold text-charcoal mb-4">Breaks Configuration</h3>
        
        <div className="mb-4">
          <label className="block text-charcoal text-sm font-medium mb-2">
            Working Hours
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="time"
              value={workHoursStart}
              onChange={(e) => setWorkHoursStart(e.target.value)}
              className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
            />
            <span className="text-charcoal">to</span>
            <input
              type="time"
              value={workHoursEnd}
              onChange={(e) => setWorkHoursEnd(e.target.value)}
              className="px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-charcoal text-sm font-medium mb-2">
            Week Start Day
          </label>
          <select
            value={weekStartDay}
            onChange={(e) => setWeekStartDay(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
          >
            <option value="monday">Monday</option>
            <option value="saturday">Saturday</option>
            <option value="sunday">Sunday</option>
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-charcoal text-sm font-medium mb-2">
            Default Shift Length (hours)
          </label>
          <input
            type="number"
            min="1"
            max="24"
            value={defaultShiftLength}
            onChange={(e) => setDefaultShiftLength(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-charcoal text-sm font-medium mb-2">
            Minimum Break Between Shifts (hours)
          </label>
          <input
            type="number"
            min="0"
            max="24"
            step="0.25"
            value={minBreakHours}
            onChange={(e) => {
              const hours = Number(e.target.value);
              setMinBreakHours(hours);
              // Convert hours to minutes for DB storage
              setMinBreakBetweenSlots(Math.round(hours * 60));
            }}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
          />
          <p className="text-charcoal/60 text-xs mt-1">
            Minimum time required between consecutive shifts for an employee
          </p>
        </div>
        
        <button
          type="button"
          onClick={saveSettings}
          disabled={isSaving}
          className={`mt-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-charcoal transition-colors ${
            isSaving ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isSaving ? 'Saving...' : 'Save Breaks Configuration'}
        </button>
      </div>
    </div>
  );
} 