import { useState, useEffect, useRef } from 'react';
import React from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ui/ToastContext';

// Helper function to capitalize first letter
const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export default function UserEditForm({ user, onClose, onSuccess }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [shiftPreference, setShiftPreference] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [performanceScore, setPerformanceScore] = useState(50);
  const [avatar, setAvatar] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  
  // Rota Planner fields
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [maxDailyHours, setMaxDailyHours] = useState('');
  const [unavailableDays, setUnavailableDays] = useState([]);
  const [notesForAdmin, setNotesForAdmin] = useState('');
  const [locations, setLocations] = useState([]);
  
  // Agency field
  const [agencies, setAgencies] = useState([]);
  const [agencyId, setAgencyId] = useState(null);
  
  const [formErrors, setFormErrors] = useState({
    firstName: '',
    lastName: '',
    shiftPreference: '',
    performanceScore: '',
    timeRange: '',
    maxDailyHours: ''
  });

  const modalRef = useRef(null);

  // Load available locations
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('is_active', true);
          
        if (error) throw error;
        setLocations(data || []);
      } catch (error) {
        console.error('Error fetching locations:', error);
        toast.error('Error loading locations: ' + error.message);
      }
    };
    
    fetchLocations();
  }, [toast]);
  
  // Load available agencies
  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const { data, error } = await supabase
          .from('agencies')
          .select('*')
          .eq('is_active', true)
          .order('name');
          
        if (error) throw error;
        setAgencies(data || []);
      } catch (error) {
        console.error('Error fetching agencies:', error);
        toast.error('Error loading agencies: ' + error.message);
      }
    };
    
    fetchAgencies();
  }, [toast]);

  // Load user data when the component mounts
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setShiftPreference(user.shift_preference || '');
      setIsActive(user.is_active !== false); // Default to true if not set
      setPerformanceScore(user.performance_score || 50);
      setAvatarUrl(user.avatar_url || null);
      setCustomStartTime(user.custom_start_time || '');
      setCustomEndTime(user.custom_end_time || '');
      setPreferredLocation(user.preferred_location || '');
      setMaxDailyHours(user.max_daily_hours || '');
      setUnavailableDays(user.unavailable_days || []);
      setNotesForAdmin(user.notes_for_admin || '');
      setAgencyId(user.agency_id || null);
    }
  }, [user]);

  // Handle avatar selection
  const handleAvatarChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image is too large. Maximum size is 5MB.');
        return;
      }
      
      setAvatar(file);
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  // Handle unavailable days selection
  const handleUnavailableDayToggle = (day) => {
    if (unavailableDays.includes(day)) {
      setUnavailableDays(unavailableDays.filter(d => d !== day));
    } else {
      setUnavailableDays([...unavailableDays, day]);
    }
  };

  // Form validation
  const validateForm = () => {
    let isValid = true;
    const errors = {
      firstName: '',
      lastName: '',
      shiftPreference: '',
      performanceScore: '',
      timeRange: '',
      maxDailyHours: ''
    };
    
    // Basic validation
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
      isValid = false;
    }
    
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
      isValid = false;
    }
    
    if (!shiftPreference) {
      errors.shiftPreference = 'Shift preference is required';
      isValid = false;
    }
    
    if (performanceScore < 1 || performanceScore > 99) {
      errors.performanceScore = 'Performance score must be between 1 and 99';
      isValid = false;
    }
    
    // Custom start/end time validation
    if ((customStartTime && !customEndTime) || (!customStartTime && customEndTime)) {
      errors.timeRange = 'Both start and end times must be set together';
      isValid = false;
    }
    
    // Max daily hours validation
    if (maxDailyHours && (maxDailyHours < 1 || maxDailyHours > 24)) {
      errors.maxDailyHours = 'Max daily hours must be between 1 and 24';
      isValid = false;
    }
    
    setFormErrors(errors);
    return isValid;
  };

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      // Update user profile info
      const updates = {
        id: user.id,
        first_name: capitalizeFirstLetter(firstName.trim()),
        last_name: capitalizeFirstLetter(lastName.trim()),
        shift_preference: shiftPreference,
        is_active: isActive,
        performance_score: parseInt(performanceScore, 10),
        updated_at: new Date().toISOString(),
        // Rota Planner fields
        custom_start_time: customStartTime || null,
        custom_end_time: customEndTime || null,
        preferred_location: preferredLocation || null,
        max_daily_hours: maxDailyHours ? parseInt(maxDailyHours, 10) : null,
        unavailable_days: unavailableDays.length > 0 ? unavailableDays : null,
        notes_for_admin: notesForAdmin || null,
        // Agency field
        agency_id: agencyId
      };
      
      console.log('Updating user with data:', updates);
      
      // Upload avatar if there's a new one
      if (avatar) {
        const fileExt = avatar.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;
        
        const { error: uploadError } = await supabase
          .storage
          .from('user-avatars')
          .upload(filePath, avatar, { upsert: true });
          
        if (uploadError) {
          throw uploadError;
        }
        
        // Get the public URL
        const { data: { publicUrl } } = supabase
          .storage
          .from('user-avatars')
          .getPublicUrl(filePath);
          
        updates.avatar_url = publicUrl;
      }
      
      // Update the profile record
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select();
        
      if (updateError) {
        throw updateError;
      }
      
      console.log('Update successful, response:', data);
      
      toast.success('Profile updated successfully!');
      
      // Call the success callback and close the form
      if (onSuccess) {
        onSuccess(updates);
      }
      onClose();
    } catch (error) {
      console.error('Error updating user profile:', error);
      toast.error('Failed to update profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Cleanup function for closing modal
  const handleClose = () => {
    document.body.style.overflow = 'auto';
    onClose();
  };
  
  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[10000]" 
      onClick={handleClose}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0,
        zIndex: 10000,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div 
        ref={modalRef}
        className="bg-white/10 backdrop-blur-md rounded-xl shadow-xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto border border-white/20" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-blue-500/30 px-6 py-4 border-b border-white/10 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-white">
                  Edit User Profile
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="text-white hover:text-white/70 transition-colors"
              aria-label="Close"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4">
            {/* Avatar Upload */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2" htmlFor="admin-edit-avatar">
                Profile Picture
              </label>
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-black/20 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-8 h-8 text-white/70" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  )}
                </div>
                <label className="flex items-center px-4 py-2 bg-white/10 hover:bg-white/20 cursor-pointer rounded-md border border-white/20 text-white transition-colors">
                  <span>Upload new</span>
                  <input
                    id="admin-edit-avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
            
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label htmlFor="admin-edit-firstName" className="block text-white font-medium mb-2">
                  First Name
                </label>
                <input
                  id="admin-edit-firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                    formErrors.firstName ? 'border-red-400/70' : 'border-white/20'
                  }`}
                  placeholder="First name"
                  disabled={loading}
                />
                {formErrors.firstName && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.firstName}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="admin-edit-lastName" className="block text-white font-medium mb-2">
                  Last Name
                </label>
                <input
                  id="admin-edit-lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                    formErrors.lastName ? 'border-red-400/70' : 'border-white/20'
                  }`}
                  placeholder="Last name"
                  disabled={loading}
                />
                {formErrors.lastName && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.lastName}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="admin-edit-shiftPreference" className="block text-white font-medium mb-2">
                  Shift Preference
                </label>
                <select
                  id="admin-edit-shiftPreference"
                  value={shiftPreference}
                  onChange={(e) => setShiftPreference(e.target.value)}
                  className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                    formErrors.shiftPreference ? 'border-red-400/70' : 'border-white/20'
                  }`}
                  disabled={loading}
                >
                  <option value="">Select shift preference</option>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="afternoon">Afternoon</option>
                </select>
                {formErrors.shiftPreference && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.shiftPreference}</p>
                )}
              </div>
              
              {/* Agency Selection */}
              <div>
                <label htmlFor="admin-edit-agency" className="block text-white font-medium mb-2">
                  Agency
                </label>
                <select
                  id="admin-edit-agency"
                  value={agencyId || ''}
                  onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                  disabled={loading}
                >
                  <option value="">None (Direct Employment)</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-white/60">
                  Select the agency through which this worker is employed
                </p>
              </div>
              
              <div>
                <label htmlFor="admin-edit-performanceScore" className="block text-white font-medium mb-2">
                  Performance Score (1-99)
                </label>
                <input
                  id="admin-edit-performanceScore"
                  type="number"
                  min="1"
                  max="99"
                  value={performanceScore}
                  onChange={(e) => setPerformanceScore(e.target.value)}
                  className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                    formErrors.performanceScore ? 'border-red-400/70' : 'border-white/20'
                  }`}
                  disabled={loading}
                />
                {formErrors.performanceScore && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.performanceScore}</p>
                )}
              </div>
              
              <div className="flex items-center">
                <input
                  id="admin-edit-isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-white/30 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0"
                  disabled={loading}
                />
                <label htmlFor="admin-edit-isActive" className="ml-2 block text-white">
                  Active Account
                </label>
              </div>
            </div>
            
            {/* Rota Planning Section */}
            <div className="mt-6 border-t border-white/10 pt-4">
              <h4 className="text-lg font-medium text-white mb-3">Rota Planning Settings</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white font-medium mb-2">
                    Custom Working Hours (Optional)
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <label htmlFor="admin-edit-startTime" className="block text-white text-sm mb-1">
                        Start Time
                      </label>
                      <input
                        id="admin-edit-startTime"
                        type="time"
                        value={customStartTime}
                        onChange={(e) => setCustomStartTime(e.target.value)}
                        className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                          formErrors.timeRange ? 'border-red-400/70' : 'border-white/20'
                        }`}
                        disabled={loading}
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="admin-edit-endTime" className="block text-white text-sm mb-1">
                        End Time
                      </label>
                      <input
                        id="admin-edit-endTime"
                        type="time"
                        value={customEndTime}
                        onChange={(e) => setCustomEndTime(e.target.value)}
                        className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                          formErrors.timeRange ? 'border-red-400/70' : 'border-white/20'
                        }`}
                        disabled={loading}
                      />
                    </div>
                  </div>
                  {formErrors.timeRange && (
                    <p className="mt-1 text-sm text-red-400">{formErrors.timeRange}</p>
                  )}
                  <p className="mt-1 text-xs text-white/60">
                    Override default working hours for this staff member
                  </p>
                </div>
                
                <div>
                  <label htmlFor="admin-edit-location" className="block text-white font-medium mb-2">
                    Preferred Location
                  </label>
                  <select
                    id="admin-edit-location"
                    value={preferredLocation || ''}
                    onChange={(e) => setPreferredLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="">No preference</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.name}>{location.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-white/60">
                    Staff will be preferentially assigned to this location when possible
                  </p>
                </div>
                
                <div>
                  <label htmlFor="admin-edit-maxHours" className="block text-white font-medium mb-2">
                    Maximum Daily Hours
                  </label>
                  <input
                    id="admin-edit-maxHours"
                    type="number"
                    min="1"
                    max="24"
                    value={maxDailyHours}
                    onChange={(e) => setMaxDailyHours(e.target.value)}
                    className={`w-full px-3 py-2 bg-white/10 border rounded-md text-white focus:outline-none focus:border-blue-500 ${
                      formErrors.maxDailyHours ? 'border-red-400/70' : 'border-white/20'
                    }`}
                    placeholder="e.g. 8"
                    disabled={loading}
                  />
                  {formErrors.maxDailyHours && (
                    <p className="mt-1 text-sm text-red-400">{formErrors.maxDailyHours}</p>
                  )}
                  <p className="mt-1 text-xs text-white/60">
                    Maximum working hours per day (leave empty for no limit)
                  </p>
                </div>
                
                <div>
                  <label className="block text-white font-medium mb-2">
                    Unavailable Days
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleUnavailableDayToggle(day)}
                        className={`py-1 px-1 text-center rounded text-xs sm:text-sm border ${
                          unavailableDays.includes(day)
                            ? 'bg-red-500/50 border-red-400/50 text-white'
                            : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                        }`}
                        disabled={loading}
                      >
                        {day.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    Mark days when the staff member is regularly unavailable
                  </p>
                </div>
                
                <div>
                  <label htmlFor="admin-edit-notes" className="block text-white font-medium mb-2">
                    Admin Notes
                  </label>
                  <textarea
                    id="admin-edit-notes"
                    value={notesForAdmin}
                    onChange={(e) => setNotesForAdmin(e.target.value)}
                    rows="3"
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                    placeholder="Private notes visible to admin only"
                    disabled={loading}
                  ></textarea>
                </div>
              </div>
            </div>
            
            {/* Form Actions */}
            <div className="mt-6 flex space-x-3 justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-md text-white transition-colors ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

UserEditForm.propTypes = {
  user: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired
}; 