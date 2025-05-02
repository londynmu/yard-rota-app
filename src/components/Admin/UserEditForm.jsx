import { useState, useEffect, useRef } from 'react';
import React from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';

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
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // Rota Planner fields
  const [customStartTime, setCustomStartTime] = useState('');
  const [customEndTime, setCustomEndTime] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [maxDailyHours, setMaxDailyHours] = useState('');
  const [unavailableDays, setUnavailableDays] = useState([]);
  const [notesForAdmin, setNotesForAdmin] = useState('');
  const [locations, setLocations] = useState([]);
  
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
          .eq('is_active', true)
          .order('name');
          
        if (error) throw error;
        setLocations(data || []);
      } catch (error) {
        console.error('Error fetching locations:', error);
      }
    };
    
    fetchLocations();
  }, []);

  // Set up body scroll lock when modal is opened
  useEffect(() => {
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    
    // Focus on the first input field for accessibility
    if (modalRef.current) {
      const firstInput = modalRef.current.querySelector('input');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }
    }
    
    // Clean up function
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  // Load user data
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setShiftPreference(user.shift_preference || 'day');
      setAvatarUrl(user.avatar_url || null);
      setIsActive(user.is_active !== false); // default to true if not set
      setPerformanceScore(user.performance_score || 50); // default to 50 if not set
      
      // Load Rota Planner fields
      setCustomStartTime(user.custom_start_time || '');
      setCustomEndTime(user.custom_end_time || '');
      setPreferredLocation(user.preferred_location || '');
      setMaxDailyHours(user.max_daily_hours || '');
      setUnavailableDays(user.unavailable_days || []);
      setNotesForAdmin(user.notes_for_admin || '');
    }
  }, [user]);

  const validateForm = () => {
    const errors = {};
    
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!shiftPreference) {
      errors.shiftPreference = 'Shift preference is required';
    }
    
    if (performanceScore < 1 || performanceScore > 99) {
      errors.performanceScore = 'Performance score must be between 1 and 99';
    }

    // Validate time range
    if (customStartTime && customEndTime) {
      if (customStartTime === customEndTime) {
        errors.timeRange = 'Start and end times cannot be the same';
      }
    }
    
    // Validate max daily hours
    if (maxDailyHours) {
      const hours = parseInt(maxDailyHours, 10);
      if (isNaN(hours) || hours < 1 || hours > 24) {
        errors.maxDailyHours = 'Maximum daily hours must be between 1 and 24';
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const checkTimeRange = () => {
    if (customStartTime && customEndTime) {
      const start = new Date(`2000-01-01T${customStartTime}`);
      const end = new Date(`2000-01-01T${customEndTime}`);
      return start > end;
    }
    return false;
  };

  const handleCustomStartTimeChange = (e) => {
    setCustomStartTime(e.target.value);
    if (formErrors.timeRange && e.target.value !== customEndTime) {
      setFormErrors({ ...formErrors, timeRange: '' });
    }
  };

  const handleCustomEndTimeChange = (e) => {
    setCustomEndTime(e.target.value);
    if (formErrors.timeRange && e.target.value !== customStartTime) {
      setFormErrors({ ...formErrors, timeRange: '' });
    }
  };

  const handleAvatarChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) {
      setAvatar(null);
      return;
    }
    
    const file = e.target.files[0];
    
    // Check file size (limit to 7MB)
    if (file.size > 7 * 1024 * 1024) {
      setMessage({ text: 'File size exceeds 7MB limit', type: 'error' });
      return;
    }
    
    setAvatar(file);
  };

  const handleFirstNameChange = (e) => {
    setFirstName(e.target.value);
    if (formErrors.firstName && e.target.value.trim()) {
      setFormErrors({ ...formErrors, firstName: '' });
    }
  };

  const handleLastNameChange = (e) => {
    setLastName(e.target.value);
    if (formErrors.lastName && e.target.value.trim()) {
      setFormErrors({ ...formErrors, lastName: '' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    setMessage({ text: '', type: '' });
    
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
        notes_for_admin: notesForAdmin || null
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
      
      setMessage({ 
        text: 'Profile updated successfully!', 
        type: 'success' 
      });
      
      // Notify parent component of success
      if (onSuccess) {
        setTimeout(() => {
          onSuccess(updates);
        }, 500);
      }
      
    } catch (error) {
      console.error('Error updating user profile:', error);
      setMessage({ 
        text: 'Failed to update profile: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
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
            {message.text && (
              <div className={`p-3 rounded-md mb-4 backdrop-blur-sm ${
                message.type === 'error' 
                ? 'bg-red-500/20 text-red-100 border border-red-400/30' 
                : 'bg-green-500/20 text-green-100 border border-green-400/30'
              }`}>
                {message.text}
              </div>
            )}
            
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
                <div>
                  <input
                    type="file"
                    id="admin-edit-avatar"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <label 
                    htmlFor="admin-edit-avatar"
                    className="px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-md cursor-pointer hover:bg-white/30 transition-colors border border-white/20"
                  >
                    Choose Image
                  </label>
                  <p className="text-xs text-white/70 mt-1">Maximum file size: 7MB</p>
                  {avatar && (
                    <p className="text-sm text-white/80 mt-1">Selected: {avatar.name}</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* First Name */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2" htmlFor="admin-edit-firstName">
                First Name <span className="text-red-300">*</span>
              </label>
              <input
                type="text"
                id="admin-edit-firstName"
                value={firstName}
                onChange={handleFirstNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.firstName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="First name"
              />
              {formErrors.firstName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.firstName}</p>
              )}
            </div>
            
            {/* Last Name */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2" htmlFor="admin-edit-lastName">
                Last Name <span className="text-red-300">*</span>
              </label>
              <input
                type="text"
                id="admin-edit-lastName"
                value={lastName}
                onChange={handleLastNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.lastName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="Last name"
              />
              {formErrors.lastName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.lastName}</p>
              )}
            </div>
            
            {/* User Status */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Status
              </label>
              <div className="flex space-x-4">
                <label className={`flex items-center p-2 border rounded-md cursor-pointer transition-colors ${
                  isActive 
                  ? 'bg-green-500/30 border-green-400/50 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white/80'
                }`}>
                  <input
                    type="radio"
                    name="userStatus"
                    checked={isActive}
                    onChange={() => setIsActive(true)}
                    className="sr-only"
                  />
                  <span className="ml-2">Active</span>
                </label>
                <label className={`flex items-center p-2 border rounded-md cursor-pointer transition-colors ${
                  !isActive 
                  ? 'bg-red-500/30 border-red-400/50 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white/80'
                }`}>
                  <input
                    type="radio"
                    name="userStatus"
                    checked={!isActive}
                    onChange={() => setIsActive(false)}
                    className="sr-only"
                  />
                  <span className="ml-2">Inactive</span>
                </label>
              </div>
            </div>
            
            {/* Performance Score */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2" htmlFor="performance-score">
                Performance Score (1-99)
              </label>
              <div className="space-y-1">
                <input
                  type="range"
                  id="performance-score"
                  min="1"
                  max="99"
                  value={performanceScore}
                  onChange={(e) => setPerformanceScore(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.4) 0%, rgba(59, 130, 246, 0.4) 50%, rgba(16, 185, 129, 0.4) 100%)'
                  }}
                />
                <div className="flex justify-between text-xs text-white/70">
                  <span>Poor (1)</span>
                  <span>{performanceScore}</span>
                  <span>Excellent (99)</span>
                </div>
              </div>
              {formErrors.performanceScore && (
                <p className="text-sm text-red-300 mt-1">{formErrors.performanceScore}</p>
              )}
            </div>
            
            {/* Shift Preference */}
            <div className="mb-4">
              <label className="block text-white font-medium mb-2" id="admin-edit-shift-preference-label">
                Shift Preference <span className="text-red-300">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="admin-edit-shift-preference-label">
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
                  shiftPreference === 'day' 
                  ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white'
                }`} htmlFor="admin-edit-shift-day">
                  <input
                    type="radio"
                    id="admin-edit-shift-day"
                    name="adminEditShiftPreference"
                    value="day"
                    checked={shiftPreference === 'day'}
                    onChange={() => setShiftPreference('day')}
                    className="sr-only"
                  />
                  <span>Day</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
                  shiftPreference === 'afternoon' 
                  ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white'
                }`} htmlFor="admin-edit-shift-afternoon">
                  <input
                    type="radio"
                    id="admin-edit-shift-afternoon"
                    name="adminEditShiftPreference"
                    value="afternoon"
                    checked={shiftPreference === 'afternoon'}
                    onChange={() => setShiftPreference('afternoon')}
                    className="sr-only"
                  />
                  <span>Afternoon</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-colors ${
                  shiftPreference === 'night' 
                  ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                  : 'border-white/20 hover:bg-white/5 text-white'
                }`} htmlFor="admin-edit-shift-night">
                  <input
                    type="radio"
                    id="admin-edit-shift-night"
                    name="adminEditShiftPreference"
                    value="night"
                    checked={shiftPreference === 'night'}
                    onChange={() => setShiftPreference('night')}
                    className="sr-only"
                  />
                  <span>Night</span>
                </label>
              </div>
            </div>

            {/* Rota Planner Preferences Section */}
            <div className="mt-6 border-t border-white/20 pt-4">
              <h3 className="text-lg font-medium text-white mb-4">Rota Planner Preferences</h3>
              
              {/* Custom Start Time */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="custom-start-time">
                  Preferred Start Time <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <input
                  type="time"
                  id="custom-start-time"
                  value={customStartTime}
                  onChange={handleCustomStartTimeChange}
                  className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
                />
                {checkTimeRange() && (
                  <p className="text-sm text-blue-300 italic mt-1">
                    This time range extends to the next day
                  </p>
                )}
              </div>
              
              {/* Custom End Time */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="custom-end-time">
                  Preferred End Time <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <input
                  type="time"
                  id="custom-end-time"
                  value={customEndTime}
                  onChange={handleCustomEndTimeChange}
                  className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
                />
                {formErrors.timeRange && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.timeRange}</p>
                )}
              </div>
              
              {/* Preferred Location */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="preferred-location">
                  Preferred Location <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <select
                  id="preferred-location"
                  value={preferredLocation}
                  onChange={(e) => setPreferredLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
                >
                  <option value="" className="bg-gray-900 text-white">Select location...</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.name} className="bg-gray-900 text-white">{location.name}</option>
                  ))}
                  <option value="Both" className="bg-gray-900 text-white">Both</option>
                </select>
              </div>
              
              {/* Max Daily Hours */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="max-daily-hours">
                  Maximum Daily Hours <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <input
                  type="number"
                  id="max-daily-hours"
                  min="1"
                  max="24"
                  value={maxDailyHours}
                  onChange={(e) => setMaxDailyHours(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
                />
                {formErrors.maxDailyHours && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.maxDailyHours}</p>
                )}
              </div>
              
              {/* Unavailable Days */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2">
                  Unavailable Days <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                    <label key={day} className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                      unavailableDays.includes(day) 
                        ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                        : 'border-white/20 text-white'
                    }`}>
                      <input
                        type="checkbox"
                        value={day}
                        checked={unavailableDays.includes(day)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUnavailableDays([...unavailableDays, day]);
                          } else {
                            setUnavailableDays(unavailableDays.filter(d => d !== day));
                          }
                        }}
                        className="sr-only"
                      />
                      <span className="text-xs sm:text-sm">{day.substring(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              {/* Notes For Admin */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="notes-for-admin">
                  Notes for Admin <span className="text-xs text-white/70">(Optional)</span>
                </label>
                <textarea
                  id="notes-for-admin"
                  value={notesForAdmin}
                  onChange={(e) => setNotesForAdmin(e.target.value)}
                  rows="3"
                  className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
                  placeholder="Any special requirements or notes..."
                ></textarea>
              </div>
            </div>
          </div>
          
          <div className="bg-black/20 px-6 py-4 flex justify-between border-t border-white/10">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }}
              className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-md font-medium text-white hover:bg-white/20 focus:outline-none transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={(e) => {
                if (loading) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-500/30 backdrop-blur-sm border border-blue-400/30 rounded-md font-medium text-white hover:bg-blue-500/50 focus:outline-none transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
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