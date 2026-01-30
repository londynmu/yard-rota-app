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
      toast.success('Configuration saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg p-5 border border-gray-200 animate-pulse">
        <div className="h-6 w-48 bg-slate-300 rounded mb-4" />
        <div className="space-y-4">
          <div>
            <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
          <div>
            <div className="h-4 w-40 bg-slate-200 rounded mb-2" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
          <div>
            <div className="h-4 w-36 bg-slate-200 rounded mb-2" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Breaks Configuration</h3>
      
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-medium mb-2">
          Working Hours
        </label>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={workHoursStart}
            onChange={(e) => setWorkHoursStart(e.target.value)}
            className="px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
          />
          <span className="text-gray-600">to</span>
          <input
            type="time"
            value={workHoursEnd}
            onChange={(e) => setWorkHoursEnd(e.target.value)}
            className="px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
          />
        </div>
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-medium mb-2">
          Week Start Day
        </label>
        <select
          value={weekStartDay}
          onChange={(e) => setWeekStartDay(e.target.value)}
          className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
        >
          <option value="monday">Monday</option>
          <option value="saturday">Saturday</option>
          <option value="sunday">Sunday</option>
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-medium mb-2">
          Default Shift Length (hours)
        </label>
        <input
          type="number"
          min="1"
          max="24"
          value={defaultShiftLength}
          onChange={(e) => setDefaultShiftLength(Number(e.target.value))}
          className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
        />
      </div>
      
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-medium mb-2">
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
            setMinBreakBetweenSlots(Math.round(hours * 60));
          }}
          className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
        />
        <p className="text-gray-500 text-xs mt-1">
          Minimum time required between consecutive shifts for an employee
        </p>
      </div>
      
      <button
        type="button"
        onClick={saveSettings}
        disabled={isSaving}
        className={`mt-4 px-4 py-2 bg-charcoal hover:bg-charcoal/90 rounded-lg text-white transition-colors ${
          isSaving ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isSaving ? 'Saving...' : 'Save Breaks Configuration'}
      </button>
    </div>
  );
} 