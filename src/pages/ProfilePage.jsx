import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import Tooltip from '../components/ui/Tooltip';
import PropTypes from 'prop-types';
import { useToast } from '../components/ui/ToastContext';

// Helper function to capitalize first letter
const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export default function ProfilePage({ isRequired = false, supabaseClient, simplifiedView = false }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [shiftPreference, setShiftPreference] = useState('day');
  const [avatar, setAvatar] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [formErrors, setFormErrors] = useState({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  // Rota Planner additional fields
  const [customStartTime, setCustomStartTime] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  // Toast message for form validation
  const toast = useToast();
  // Available locations
  const [locations, setLocations] = useState([]);
  // Page visit timestamp to force location refresh
  const [pageVisit] = useState(Date.now());
  // Add agency state
  const [agencies, setAgencies] = useState([]);
  const [agencyId, setAgencyId] = useState(null);

  // Check for network connectivity
  useEffect(() => {
    // Update network status
    const handleOnlineStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    // Set up event listeners
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Set initial status
    setIsOffline(!navigator.onLine);

    // Clean up
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  // Define fetchProfile with useCallback before using it in useEffect
  const fetchProfile = useCallback(async () => {
    if (!user || !supabaseClient) return;
    
    try {
      setLoading(true);
      
      // Check if we're offline
      if (!navigator.onLine) {
        setIsOffline(true);
        throw new Error('You appear to be offline. Please check your internet connection.');
      }
      
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setShiftPreference(data.shift_preference || 'day');
        setAvatarUrl(data.avatar_url || '');
        // Load Rota Planner fields
        setCustomStartTime(data.custom_start_time || '');
        setPreferredLocation(data.preferred_location || '');
        setAgencyId(data.agency_id || null);
      }
      setProfileLoaded(true);
    } catch (error) {
      console.error('Error fetching profile:', error);
      
      // Handle connection errors
      if (!navigator.onLine || 
          error.message?.includes('Failed to fetch') || 
          error.message?.includes('ERR_CONNECTION_CLOSED') ||
          error.message?.includes('NetworkError')) {
        setIsOffline(true);
        setMessage({ 
          text: 'Unable to connect to server. Please check your internet connection and try again.', 
          type: 'error' 
        });
        toast.error('Unable to connect to server. Please check your internet connection and try again.');
      } else {
        setMessage({ 
          text: 'Failed to load profile data: ' + (error.message || 'Unknown error'), 
          type: 'error' 
        });
        toast.error('Failed to load profile data: ' + (error.message || 'Unknown error'));
      }
      setProfileLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [user, supabaseClient]);

  // Load user profile data
  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [fetchProfile, user]);
  
  // Auto-retry if offline and becomes online again
  useEffect(() => {
    if (!isOffline && retryCount > 0 && user) {
      fetchProfile();
    }
  }, [isOffline, fetchProfile, retryCount, user]);

  // Fetch available locations
  useEffect(() => {
    const fetchLocations = async () => {
      if (!supabaseClient) return;
      
      try {
        // Log the fetch attempt
        console.log('Fetching locations from database...');
        
        const { data, error } = await supabaseClient
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
          
        if (error) throw error;
        
        console.log('Locations data received:', data);
        
        if (data && data.length > 0) {
          setLocations(data);
        } else {
          // Fallback to default locations if none found
          console.log('No locations found, using fallback values');
          setLocations([
            { id: '1', name: 'Main Hub' },
            { id: '2', name: 'NRC' }
          ]);
        }
      } catch (error) {
        console.error('Error fetching locations:', error);
        // Fallback to default locations on error
        setLocations([
          { id: '1', name: 'Main Hub' },
          { id: '2', name: 'NRC' }
        ]);
      }
    };
    
    fetchLocations();
  }, [supabaseClient, pageVisit]);

  // Fetch agencies
  useEffect(() => {
    const fetchAgencies = async () => {
      try {
        const { data, error } = await supabaseClient
          .from('agencies')
          .select('*')
          .eq('is_active', true)
          .order('name');
          
        if (error) throw error;
        setAgencies(data || []);
      } catch (error) {
        console.error('Error fetching agencies:', error);
      }
    };
    
    fetchAgencies();
  }, [supabaseClient]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setMessage({ text: '', type: '' });
    fetchProfile();
  };

  const validateForm = () => {
    const errors = {};
    
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!shiftPreference) {
      errors.shiftPreference = 'Please select your preferred shift';
    }
    
    // Make preferred location required
    if (!preferredLocation) {
      errors.preferredLocation = 'Preferred location is required';
    }
    
    // Make custom start time required
    if (!customStartTime) {
      errors.customStartTime = 'Preferred start time is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!supabaseClient) {
      console.error("Supabase client is not available in ProfilePage handleSubmit");
      setMessage({ text: 'An internal error occurred (client unavailable). Cannot save profile.', type: 'error' });
      toast.error('An internal error occurred (client unavailable). Cannot save profile.');
      return;
    }
    
    // Check for internet connection
    if (isOffline) {
      setMessage({ 
        text: 'You appear to be offline. Please check your internet connection before saving.', 
        type: 'error' 
      });
      toast.error('You appear to be offline. Please check your internet connection before saving.');
      return;
    }
    
    if (isRequired && !validateForm()) {
      setMessage({ 
        text: 'Please complete all required fields', 
        type: 'error' 
      });
      toast.error('Please complete all required fields');
      return;
    }
    
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      
      // First handle avatar upload if there's a new file
      let avatar_url = avatarUrl;
      
      if (avatar) {
        // Add a check for supabaseClient.storage
        if (!supabaseClient.storage) {
          console.error("Supabase client storage is not available.");
          setMessage({ text: 'Error: Storage service is not configured correctly.', type: 'error' });
          toast.error('Error: Storage service is not configured correctly.');
          setLoading(false); // Stop loading state
          return; // Prevent further execution in this block
        }
        
        const fileExt = avatar.name.split('.').pop();
        const fileName = `${user.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `avatars/${fileName}`;
        
        const { error: uploadError } = await supabaseClient.storage
          .from('avatars')
          .upload(filePath, avatar);
          
        if (uploadError) throw uploadError;
        
        // Get public URL for the avatar
        const { data } = supabaseClient.storage
          .from('avatars')
          .getPublicUrl(filePath);
          
        avatar_url = data.publicUrl;
      }
      
      // Capitalize first letter of names before saving
      const capitalizedFirstName = capitalizeFirstLetter(firstName);
      const capitalizedLastName = capitalizeFirstLetter(lastName);
      
      // Create profile data object
      const profileData = {
        id: user.id,
        first_name: capitalizedFirstName,
        last_name: capitalizedLastName,
        shift_preference: shiftPreference,
        avatar_url: avatar_url || null, // Explicitly set null when no avatar
        updated_at: new Date().toISOString(),
        // Add Rota Planner fields
        custom_start_time: customStartTime || null,
        preferred_location: preferredLocation || null,
        agency_id: agencyId,
      };
      
      // Only set account_status to pending_approval for first-time profile creation
      if (isRequired || simplifiedView) {
        profileData.account_status = 'pending_approval';
      }
      
      // Try to include profile_completed field, but if it fails, we'll try without it
      let finalError = null;
      try {
        // First attempt with profile_completed field
        const { error } = await supabaseClient
          .from('profiles')
          .upsert({
            ...profileData,
            profile_completed: true
          });
        
        if (error) {
          // If error indicates the column might not exist, mark it for fallback
          if (error.message && (error.message.includes('profile_completed') || error.code === '42703')) { // 42703 is PostgreSQL code for undefined column
            throw new Error('column_potentially_missing');
          } else {
            finalError = error; // Store the original error
          }
        }
      } catch (error) {
        // If the specific error suggests the column might be missing, try without that field
        if (error.message === 'column_potentially_missing') {
          try {
            const { error: fallbackError } = await supabaseClient
              .from('profiles')
              .upsert(profileData);
            
            if (fallbackError) {
              finalError = fallbackError; // Store the fallback error
            }
          } catch (fallbackCatchError) {
            finalError = fallbackCatchError; // Store any unexpected error during fallback
          }
        } else {
          finalError = error; // Store other errors from the first attempt
        }
      }
      
      // If there was an error after attempting both ways
      if (finalError) {
        throw finalError; // Throw the determined error
      }
      
      // Redirect to waiting for approval page instead of calendar when creating profile
      if (simplifiedView || isRequired) {
        window.location.href = '/waiting-for-approval';
        return;
      }
      
      setMessage({ 
        text: 'Profile updated successfully!', 
        type: 'success' 
      });
      toast.success('Profile updated successfully!');
      
      // Update state with capitalized values
      setFirstName(capitalizedFirstName);
      setLastName(capitalizedLastName);
      
      // Update avatar URL if we uploaded a new one
      if (avatar) {
        setAvatarUrl(avatar_url);
        setAvatar(null);
      }
      
    } catch (error) {
      console.error('Error updating profile:', error);
      
      // Handle connection errors separately
      if (!navigator.onLine || 
          error.message?.includes('Failed to fetch') || 
          error.message?.includes('ERR_CONNECTION_CLOSED') ||
          error.message?.includes('NetworkError')) {
        setMessage({ 
          text: 'Unable to connect to server. Please check your internet connection and try again.', 
          type: 'error' 
        });
        toast.error('Unable to connect to server. Please check your internet connection and try again.');
      } else {
        const errorMessage = 'Failed to update profile: ' + (error.message || 'Unknown error');
        setMessage({ 
          text: errorMessage, 
          type: 'error' 
        });
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 7 * 1024 * 1024) {
        setMessage({ 
          text: 'Image size should be less than 7MB', 
          type: 'error' 
        });
        toast.error('Image size should be less than 7MB');
        return;
      }
      setAvatar(file);
      setFormErrors(prev => ({ ...prev, avatar: undefined }));
    }
  };

  // Handle name input with automatic capitalization
  const handleFirstNameChange = (e) => {
    const value = e.target.value;
    setFirstName(value);
    if (value.trim()) {
      setFormErrors(prev => ({ ...prev, firstName: undefined }));
    }
  };

  const handleLastNameChange = (e) => {
    const value = e.target.value;
    setLastName(value);
    if (value.trim()) {
      setFormErrors(prev => ({ ...prev, lastName: undefined }));
    }
  };

  const handlePreferredLocationChange = (e) => {
    setPreferredLocation(e.target.value);
  };

  // Handle time input with 15-minute intervals
  const handleCustomStartTimeChange = (e) => {
    const value = e.target.value;
    if (value) {
      const [hours, minutes] = value.split(':');
      // Round minutes to nearest 15-minute interval (00, 15, 30, 45)
      let roundedMinutes;
      const min = parseInt(minutes);
      if (min < 8) roundedMinutes = '00';
      else if (min < 23) roundedMinutes = '15';
      else if (min < 38) roundedMinutes = '30';
      else if (min < 53) roundedMinutes = '45';
      else roundedMinutes = '00';
      
      // Handle hour rollover if minutes were 53-59
      let adjustedHours = parseInt(hours);
      if (min >= 53) {
        adjustedHours = (adjustedHours + 1) % 24;
      }
      
      const formattedHours = adjustedHours.toString().padStart(2, '0');
      const roundedTime = `${formattedHours}:${roundedMinutes}`;
      setCustomStartTime(roundedTime);
    } else {
      setCustomStartTime('');
    }
  };


  // Handle loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  // If the profile hasn't loaded yet and this is required, show loading state
  if (isRequired && !profileLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 flex justify-center items-center">
        <div className="rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  // Simplified view - full screen form focused on required fields
  if (simplifiedView) {
    return (
      <div className="min-h-screen bg-black flex justify-center items-center">
        <div className="w-full max-w-full p-4">
          {message.text && (
            <div className={`mb-4 p-3 rounded-md ${
              message.type === 'error' 
                ? 'bg-red-500/20 text-red-100 border border-red-400/30' 
                : 'bg-green-500/20 text-green-100 border border-green-400/30'
            }`}>
              {message.text}
              {message.type === 'error' && (
                <button 
                  onClick={handleRetry}
                  className="mt-2 px-3 py-1 bg-red-400/30 rounded-md text-sm border border-red-400/30 text-white"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6 backdrop-blur-xl bg-black/60 p-6 rounded-lg border-2 border-white/30">
            {/* First Name */}
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="firstName">
                First Name {isRequired && <span className="text-red-300">*</span>}
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={handleFirstNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.firstName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="Your first name"
              />
              {formErrors.firstName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.firstName}</p>
              )}
            </div>
            
            {/* Last Name */}
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="lastName">
                Last Name {isRequired && <span className="text-red-300">*</span>}
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={handleLastNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.lastName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="Your last name"
              />
              {formErrors.lastName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.lastName}</p>
              )}
            </div>
            
            {/* Shift Preference */}
            <div>
              <label className="block text-white font-medium mb-2" id="shift-preference-label">
                Shift Preference {isRequired && <span className="text-red-300">*</span>}
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="shift-preference-label">
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'day' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-day">
                  <input
                    type="radio"
                    id="shift-day"
                    name="shiftPreference"
                    value="day"
                    checked={shiftPreference === 'day'}
                    onChange={() => setShiftPreference('day')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Day</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'afternoon' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-afternoon">
                  <input
                    type="radio"
                    id="shift-afternoon"
                    name="shiftPreference"
                    value="afternoon"
                    checked={shiftPreference === 'afternoon'}
                    onChange={() => setShiftPreference('afternoon')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Afternoon</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'night' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-night">
                  <input
                    type="radio"
                    id="shift-night"
                    name="shiftPreference"
                    value="night"
                    checked={shiftPreference === 'night'}
                    onChange={() => setShiftPreference('night')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Night</span>
                </label>
              </div>
              {formErrors.shiftPreference && (
                <p className="text-sm text-red-300 mt-1">{formErrors.shiftPreference}</p>
              )}
            </div>
            
            {/* Rota Planner Section */}
            <div className="mt-8 border-t border-white/20 pt-6">
              <h3 className="text-lg font-medium text-white mb-4">Rota Planner Preferences</h3>
              
              {/* Custom Start Time */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="customStartTime">
                  Preferred Start Time {isRequired && <span className="text-red-300">*</span>}
                  <Tooltip message="Time from which you can start working. Helps to better match you to slots in the schedule." />
                </label>
                <input
                  type="time"
                  id="customStartTime"
                  value={customStartTime}
                  onChange={handleCustomStartTimeChange}
                  className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                    formErrors.customStartTime ? 'border-red-400/70' : 'border-white/20'
                  }`}
                />
                {formErrors.customStartTime && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.customStartTime}</p>
                )}
              </div>
              
              {/* Preferred Location */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="preferredLocation">
                  Preferred Location {isRequired && <span className="text-red-300">*</span>}
                  <Tooltip message="Select your preferred working location. This helps with shift planning." />
                </label>
                <select
                  id="preferredLocation"
                  value={preferredLocation}
                  onChange={handlePreferredLocationChange}
                  className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                    formErrors.preferredLocation ? 'border-red-400/70' : 'border-white/20'
                  }`}
                >
                  <option value="" disabled className="text-gray-800">Select location...</option>
                  {locations && locations.length > 0 ? (
                    locations.map(location => (
                      <option key={location.id} value={location.name} className="text-gray-800">
                        {location.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Main Hub" className="text-gray-800">Main Hub</option>
                      <option value="NRC" className="text-gray-800">NRC</option>
                    </>
                  )}
                </select>
                {formErrors.preferredLocation && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.preferredLocation}</p>
                )}
              </div>
            </div>
            
            {/* Agency Selection */}
            <div className="mb-4">
              <label htmlFor="agency" className="block text-white font-medium mb-2">
                Agency <span className="text-xs text-white/70">(Optional)</span>
              </label>
              <select
                id="agency"
                value={agencyId || ''}
                onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
              >
                <option value="">None (Direct Employment)</option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.id}>{agency.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-white/60">
                If you work through a recruitment agency, please select it here
              </p>
            </div>
            
            {/* Submit Button */}
            <div>
              <button
                type="submit"
                id="submit-profile"
                name="submit-profile"
                disabled={loading}
                className={`w-full py-2 px-4 bg-blue-500/30 backdrop-blur-sm border border-blue-400/30 text-white rounded-md ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Saving...' : 'Complete Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Standard view with more details and styling
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-blue-900 to-green-500 py-8 px-8 sm:px-12 overflow-hidden relative text-white flex justify-center">
      <div className="w-full max-w-6xl relative">
        <div className="backdrop-blur-xl bg-black/60 rounded-xl shadow-2xl overflow-hidden border-2 border-white/30 p-6">
          {isOffline && (
            <div className="mb-6 p-4 bg-yellow-500/20 backdrop-blur-md border-l-4 border-yellow-400/70 text-yellow-100 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-300" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">You appear to be offline. Some features may not work properly.</p>
                  <button 
                    onClick={handleRetry}
                    className="mt-2 px-3 py-1 bg-yellow-400/30 rounded-md text-sm border border-yellow-400/30 text-white"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {isRequired && (
            <div className="mb-6 p-4 bg-blue-500/20 backdrop-blur-md text-blue-100 rounded-md border border-blue-400/30">
              <p className="font-medium">Welcome to Shunters.net!</p>
              <p className="mt-2">Please complete your profile information before continuing. Fields marked with * are required.</p>
            </div>
          )}
          
          {message.text && (
            <div className={`mb-4 p-3 rounded-md ${
              message.type === 'error' 
                ? 'bg-red-500/20 text-red-100 border border-red-400/30' 
                : 'bg-green-500/20 text-green-100 border border-green-400/30'
            }`}>
              {message.text}
              {message.type === 'error' && (
                <button 
                  onClick={handleRetry}
                  className="mt-2 px-3 py-1 bg-red-400/30 rounded-md text-sm border border-red-400/30 text-white"
                  id="retry-button"
                  name="retry-button"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Avatar Upload */}
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="avatar">
                Profile Picture <span className="text-xs text-white/70">(Optional)</span>
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
                    id="avatar"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <label 
                    htmlFor="avatar"
                    className="px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white rounded-md cursor-pointer border border-white/20"
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
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="firstName">
                First Name {isRequired && <span className="text-red-300">*</span>}
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={handleFirstNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.firstName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="Your first name"
              />
              {formErrors.firstName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.firstName}</p>
              )}
            </div>
            
            {/* Last Name */}
            <div>
              <label className="block text-white font-medium mb-2" htmlFor="lastName">
                Last Name {isRequired && <span className="text-red-300">*</span>}
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={handleLastNameChange}
                className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                  formErrors.lastName ? 'border-red-400/70' : 'border-white/20'
                }`}
                placeholder="Your last name"
              />
              {formErrors.lastName && (
                <p className="text-sm text-red-300 mt-1">{formErrors.lastName}</p>
              )}
            </div>
            
            {/* Shift Preference */}
            <div>
              <label className="block text-white font-medium mb-2" id="shift-preference-label">
                Shift Preference {isRequired && <span className="text-red-300">*</span>}
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="shift-preference-label">
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'day' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-day">
                  <input
                    type="radio"
                    id="shift-day"
                    name="shiftPreference"
                    value="day"
                    checked={shiftPreference === 'day'}
                    onChange={() => setShiftPreference('day')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Day</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'afternoon' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-afternoon">
                  <input
                    type="radio"
                    id="shift-afternoon"
                    name="shiftPreference"
                    value="afternoon"
                    checked={shiftPreference === 'afternoon'}
                    onChange={() => setShiftPreference('afternoon')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Afternoon</span>
                </label>
                
                <label className={`flex items-center justify-center p-2 border rounded-md cursor-pointer ${
                  shiftPreference === 'night' 
                    ? 'bg-blue-500/30 border-blue-400/70 text-white' 
                    : 'border-white/20 text-white'
                }`} htmlFor="shift-night">
                  <input
                    type="radio"
                    id="shift-night"
                    name="shiftPreference"
                    value="night"
                    checked={shiftPreference === 'night'}
                    onChange={() => setShiftPreference('night')}
                    className="sr-only"
                    aria-labelledby="shift-preference-label"
                  />
                  <span>Night</span>
                </label>
              </div>
              {formErrors.shiftPreference && (
                <p className="text-sm text-red-300 mt-1">{formErrors.shiftPreference}</p>
              )}
            </div>

            {/* Rota Planner Section */}
            <div className="mt-8 border-t border-white/20 pt-6">
              <h3 className="text-lg font-medium text-white mb-4">Rota Planner Preferences</h3>
              
              {/* Custom Start Time */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="customStartTime">
                  Preferred Start Time {isRequired && <span className="text-red-300">*</span>}
                  <Tooltip message="Time from which you can start working. Helps to better match you to slots in the schedule." />
                </label>
                <input
                  type="time"
                  id="customStartTime"
                  value={customStartTime}
                  onChange={handleCustomStartTimeChange}
                  className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                    formErrors.customStartTime ? 'border-red-400/70' : 'border-white/20'
                  }`}
                />
                {formErrors.customStartTime && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.customStartTime}</p>
                )}
              </div>
              
              {/* Preferred Location */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2" htmlFor="preferredLocation">
                  Preferred Location {isRequired && <span className="text-red-300">*</span>}
                  <Tooltip message="Select your preferred working location. This helps with shift planning." />
                </label>
                <select
                  id="preferredLocation"
                  value={preferredLocation}
                  onChange={handlePreferredLocationChange}
                  className={`w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border focus:border-white/50 text-white ${
                    formErrors.preferredLocation ? 'border-red-400/70' : 'border-white/20'
                  }`}
                >
                  <option value="" disabled className="text-gray-800">Select location...</option>
                  {locations && locations.length > 0 ? (
                    locations.map(location => (
                      <option key={location.id} value={location.name} className="text-gray-800">
                        {location.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Main Hub" className="text-gray-800">Main Hub</option>
                      <option value="NRC" className="text-gray-800">NRC</option>
                    </>
                  )}
                </select>
                {formErrors.preferredLocation && (
                  <p className="text-sm text-red-300 mt-1">{formErrors.preferredLocation}</p>
                )}
              </div>
            </div>
            
            {/* Agency Selection */}
            <div className="mb-4">
              <label htmlFor="agency" className="block text-white font-medium mb-2">
                Agency <span className="text-xs text-white/70">(Optional)</span>
              </label>
              <select
                id="agency"
                value={agencyId || ''}
                onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                className="w-full px-3 py-2 bg-white/10 backdrop-blur-sm rounded-md focus:outline-none border border-white/20 focus:border-white/50 text-white"
              >
                <option value="">None (Direct Employment)</option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.id}>{agency.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-white/60">
                If you work through a recruitment agency, please select it here
              </p>
            </div>
            
            {/* Submit Button */}
            <div>
              <button
                type="submit"
                id="submit-profile"
                name="submit-profile"
                disabled={loading}
                className={`w-full py-2 px-4 bg-blue-500/30 backdrop-blur-sm border border-blue-400/30 text-white rounded-md ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Saving...' : isRequired ? 'Complete Profile' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

ProfilePage.propTypes = {
  isRequired: PropTypes.bool,
  supabaseClient: PropTypes.object.isRequired,
  simplifiedView: PropTypes.bool
}; 