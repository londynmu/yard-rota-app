import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import Tooltip from '../components/ui/Tooltip';
import PropTypes from 'prop-types';
import { useToast } from '../components/ui/ToastContext';
import { format } from 'date-fns';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';

// Helper function to capitalize first letter
const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export default function ProfilePage({ isRequired = false, supabaseClient, simplifiedView = false }) {
  const { user, refreshSessionProfile, setSessionProfile, sessionProfile } = useAuth();
  const navigate = useNavigate();
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
  // Attendance & disciplinary (own records only)
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [violations, setViolations] = useState([]);

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
        setAvatarUrl(normalizeAvatarStorageUrl(data.avatar_url) || '');
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
  }, [user, supabaseClient, toast]);

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
        const { data, error } = await supabaseClient
          .from('locations')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          setLocations(data);
        } else {
          // Fallback to default locations if none found
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

  // Fetch own attendance and disciplinary notes (standard view only)
  useEffect(() => {
    if (!user?.id || !supabaseClient || simplifiedView) return;
    const fetchAttendanceAndViolations = async () => {
      try {
        const { data: rotaData, error: rotaErr } = await supabaseClient
          .from('scheduled_rota')
          .select('id, date')
          .eq('user_id', user.id);
        if (rotaErr) throw rotaErr;
        const rotaIds = (rotaData || []).map((r) => r.id);
        const rotaDateMap = (rotaData || []).reduce((acc, r) => {
          acc[r.id] = r.date;
          return acc;
        }, {});
        let attList = [];
        if (rotaIds.length > 0) {
          const { data: attData, error: attErr } = await supabaseClient
            .from('attendance')
            .select('scheduled_rota_id, status, recorded_at')
            .in('scheduled_rota_id', rotaIds)
            .order('recorded_at', { ascending: false });
          if (attErr) throw attErr;
          attList = (attData || []).map((a) => ({
            date: rotaDateMap[a.scheduled_rota_id],
            status: a.status,
          }));
        }
        setAttendanceRecords(attList);

        const { data: violData, error: violErr } = await supabaseClient
          .from('shunter_violations')
          .select('id, body, category, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (violErr) throw violErr;
        setViolations(violData || []);
      } catch (err) {
        console.error('Error fetching attendance/violations:', err);
        setAttendanceRecords([]);
        setViolations([]);
      }
    };
    fetchAttendanceAndViolations();
  }, [user?.id, supabaseClient, simplifiedView]);

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
    
    // Make agency required
    if (!agencyId) {
      errors.agency = 'Please select your agency';
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
      
      // Optional avatar upload — must not block profile save on failure
      let avatar_url = avatarUrl;
      let avatarUploadFailed = false;
      
      if (avatar) {
        if (!supabaseClient.storage) {
          console.error('Supabase client storage is not available.');
          avatarUploadFailed = true;
        } else {
          const fileExt = avatar.name.split('.').pop();
          // Prefer nested key (same as Flutter); Storage RLS now allows any key in avatars bucket
          const filePath = `avatars/${user.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;

          const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(filePath, avatar);

          if (uploadError) {
            console.error('Avatar upload failed:', uploadError);
            avatarUploadFailed = true;
          } else {
            const { data } = supabaseClient.storage
              .from('avatars')
              .getPublicUrl(filePath);
            avatar_url = normalizeAvatarStorageUrl(data.publicUrl) ?? data.publicUrl;
          }
        }
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
      
      // Refresh gate profile then navigate to waiting (avoid hard reload race on Capacitor)
      if (simplifiedView || isRequired) {
        if (avatarUploadFailed) {
          toast.error('Profile saved, but photo upload failed. You can add a photo later.');
        }
        await refreshSessionProfile();
        // Guarantee App gate leaves the required-profile screen even if refresh races
        setSessionProfile((prev) => ({
          ...(prev || sessionProfile || {}),
          first_name: capitalizedFirstName,
          last_name: capitalizedLastName,
          shift_preference: shiftPreference,
          avatar_url: avatar_url || prev?.avatar_url || sessionProfile?.avatar_url || null,
          profile_completed: true,
          account_status: 'pending_approval',
        }));
        navigate('/waiting-for-approval', { replace: true });
        return;
      }
      
      if (avatarUploadFailed) {
        setMessage({
          text: 'Profile saved, but photo upload failed. You can try again later.',
          type: 'error',
        });
        toast.error('Profile saved, but photo upload failed. You can try again later.');
      } else {
        setMessage({ 
          text: 'Profile updated successfully!', 
          type: 'success' 
        });
        toast.success('Profile updated successfully!');
      }
      
      // Update state with capitalized values
      setFirstName(capitalizedFirstName);
      setLastName(capitalizedLastName);
      
      // Clear pending file; keep prior URL if upload failed
      if (avatar) {
        if (!avatarUploadFailed) {
          setAvatarUrl(avatar_url);
        }
        setAvatar(null);
      }

      await refreshSessionProfile();
      
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


  // Handle loading state - but NOT for required/simplified view
  // For required profile, show form immediately to avoid flashing skeleton
  if (loading && !isRequired && !simplifiedView) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 animate-pulse">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="h-[52px] bg-gray-50 border-b border-gray-200" />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 bg-slate-200 rounded-lg" />
                <div className="h-10 bg-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="h-[52px] bg-gray-50 border-b border-gray-200" />
            <div className="p-4 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-200 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // For required profile that hasn't loaded yet, skip skeleton and show form directly
  // This prevents flashing skeleton during initial profile check

  // Simplified view - full screen form focused on required fields
  if (simplifiedView) {
    return (
      <div className="min-h-screen bg-offwhite flex justify-center items-center p-4">
        <div className="w-full max-w-md">
          {message.text && (
            <div className={`mb-4 p-3 rounded-lg ${
              message.type === 'error' 
                ? 'bg-red-50 text-red-600 border border-red-200' 
                : 'bg-green-50 text-green-600 border border-green-200'
            }`}>
              {message.text}
              {message.type === 'error' && (
                <button 
                  onClick={handleRetry}
                  className="mt-2 px-3 py-1 bg-red-500 hover:bg-red-600 rounded-lg text-sm text-white"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Avatar Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <label className="block text-charcoal font-medium mb-3 text-sm">
                Profile Picture <span className="text-xs text-gray-600">(Optional)</span>
              </label>
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    id="avatar"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <label 
                    htmlFor="avatar"
                    className="inline-block px-4 py-2 bg-white hover:bg-gray-50 text-charcoal rounded-lg cursor-pointer border border-gray-300 text-sm font-medium transition-colors"
                  >
                    Choose Image
                  </label>
                  <p className="text-xs text-gray-600 mt-2">Maximum file size: 7MB</p>
                  {avatar && (
                    <p className="text-xs text-charcoal mt-1 font-medium">✓ {avatar.name}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Personal Info Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-charcoal font-semibold text-base mb-4">Personal Information</h3>
              
              <div>
                <label className="block text-charcoal font-medium mb-2 text-sm" htmlFor="firstName">
                  First Name {isRequired && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  id="firstName"
                  value={firstName}
                  onChange={handleFirstNameChange}
                  className={`w-full px-4 py-3 bg-white rounded-xl focus:outline-none border text-charcoal focus:border-black focus:ring-2 focus:ring-black/10 ${
                    formErrors.firstName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Your first name"
                />
                {formErrors.firstName && (
                  <p className="text-sm text-red-500 mt-1">{formErrors.firstName}</p>
                )}
              </div>
              
              <div>
                <label className="block text-charcoal font-medium mb-2 text-sm" htmlFor="lastName">
                  Last Name {isRequired && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  id="lastName"
                  value={lastName}
                  onChange={handleLastNameChange}
                  className={`w-full px-4 py-3 bg-white rounded-xl focus:outline-none border text-charcoal focus:border-black focus:ring-2 focus:ring-black/10 ${
                    formErrors.lastName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Your last name"
                />
                {formErrors.lastName && (
                  <p className="text-sm text-red-500 mt-1">{formErrors.lastName}</p>
                )}
              </div>
            </div>

            {/* Shift Preference Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <label className="block text-charcoal font-semibold mb-3 text-base" id="shift-preference-label">
                Shift Preference {isRequired && <span className="text-red-500">*</span>}
              </label>
              <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-labelledby="shift-preference-label">
                <label className={`flex items-center justify-center py-3 px-2 border-2 rounded-xl cursor-pointer font-medium transition-all ${
                  shiftPreference === 'day' 
                    ? 'bg-black text-white border-black' 
                    : 'border-gray-300 text-charcoal hover:bg-gray-50 hover:border-gray-400'
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
                
                <label className={`flex items-center justify-center py-3 px-2 border-2 rounded-xl cursor-pointer font-medium transition-all ${
                  shiftPreference === 'afternoon' 
                    ? 'bg-black text-white border-black' 
                    : 'border-gray-300 text-charcoal hover:bg-gray-50 hover:border-gray-400'
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
                
                <label className={`flex items-center justify-center py-3 px-2 border-2 rounded-xl cursor-pointer font-medium transition-all ${
                  shiftPreference === 'night' 
                    ? 'bg-black text-white border-black' 
                    : 'border-gray-300 text-charcoal hover:bg-gray-50 hover:border-gray-400'
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
                <p className="text-sm text-red-500 mt-2">{formErrors.shiftPreference}</p>
              )}
            </div>
            
            {/* Rota Planner Preferences Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
              <h3 className="text-charcoal font-semibold text-base mb-4">Rota Planner Preferences</h3>
              
              <div>
                <label className="flex items-center text-charcoal font-medium mb-2 text-sm" htmlFor="customStartTime">
                  Preferred Start Time {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                  id="customStartTime"
                  value={customStartTime ? customStartTime.slice(0, 5) : ''}
                  onChange={handleCustomStartTimeChange}
                  className={`w-full px-4 py-3 bg-white rounded-xl focus:outline-none border text-charcoal focus:border-black focus:ring-2 focus:ring-black/10 ${
                    formErrors.customStartTime ? 'border-red-500' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select time</option>
                  {Array.from({ length: 96 }, (_, i) => {
                    const hours = Math.floor(i / 4).toString().padStart(2, '0');
                    const minutes = ((i % 4) * 15).toString().padStart(2, '0');
                    return `${hours}:${minutes}`;
                  }).map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
                {formErrors.customStartTime && (
                  <p className="text-sm text-red-500 mt-1">{formErrors.customStartTime}</p>
                )}
              </div>
              
              <div>
                <label className="flex items-center text-charcoal font-medium mb-2 text-sm" htmlFor="preferredLocation">
                  Preferred Location {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <select
                  id="preferredLocation"
                  value={preferredLocation}
                  onChange={handlePreferredLocationChange}
                  className={`w-full px-4 py-3 bg-white rounded-xl focus:outline-none border text-charcoal focus:border-black focus:ring-2 focus:ring-black/10 ${
                    formErrors.preferredLocation ? 'border-red-500' : 'border-gray-300'
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
                  <p className="text-sm text-red-500 mt-1">{formErrors.preferredLocation}</p>
                )}
              </div>
            </div>
            
            {/* Agency Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
              <label htmlFor="agency" className="block text-charcoal font-medium mb-2 text-sm">
                Agency {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>
              <select
                id="agency"
                value={agencyId || ''}
                onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                className={`w-full px-4 py-3 bg-white rounded-xl focus:outline-none border text-charcoal focus:border-black focus:ring-2 focus:ring-black/10 ${
                  formErrors.agency ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select agency</option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.id}>{agency.name}</option>
                ))}
              </select>
              {formErrors.agency && (
                <p className="text-sm text-red-500 mt-1">{formErrors.agency}</p>
              )}
            </div>
            
            {/* Submit Button - Floating at bottom */}
            <div className="sticky bottom-4 pt-2">
              <button
                type="submit"
                id="submit-profile"
                name="submit-profile"
                disabled={loading}
                className={`w-full py-4 px-4 bg-black hover:bg-gray-800 text-white rounded-2xl font-semibold text-base shadow-lg transition-all ${
                  loading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl'
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

  // Standard view – compact, modern card layout
  const inputClass = (hasError) =>
    `w-full px-3 py-2 text-sm rounded-lg border bg-white text-charcoal focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors ${
      hasError ? 'border-red-400' : 'border-gray-200'
    }`;
  const labelClass = 'block text-gray-700 font-medium mb-1 text-sm';

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Alerts – compact */}
        {isOffline && (
          <div className="p-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <svg className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-800">You appear to be offline.</p>
              <button type="button" onClick={handleRetry} className="mt-1 text-sm font-medium text-amber-700 hover:underline">
                Try again
              </button>
            </div>
          </div>
        )}

        {isRequired && (
          <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sm">
            <p className="font-medium text-sky-800">Welcome to Shunters.net!</p>
            <p className="text-xs text-sky-700 mt-0.5">Complete your profile. Fields marked with * are required.</p>
          </div>
        )}

        {message.text && (
          <div className={`p-2.5 rounded-xl text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {message.text}
            {message.type === 'error' && (
              <button type="button" onClick={handleRetry} className="mt-1 text-sm font-medium hover:underline" id="retry-button" name="retry-button">
                Retry
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile – personal details + shift & preferences in one container */}
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
            <div className={`px-3 py-2 min-h-[44px] flex items-center md:bg-red-50 md:border-red-200 border-b bg-green-50 border-green-200`}>
              <h3 className="hidden md:block text-sm font-semibold text-red-800">Profile</h3>
            </div>
            <div className="p-3 bg-yellow-50/50 space-y-3">
              {/* Row 1: First name, Last name */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[100px] flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-[100px]">
                    <label className={labelClass} htmlFor="firstName">First name {isRequired && <span className="text-red-500">*</span>}</label>
                    <input id="firstName" type="text" value={firstName} onChange={handleFirstNameChange} placeholder="First name" className={inputClass(!!formErrors.firstName)} />
                    {formErrors.firstName && <p className="text-xs text-red-500 mt-0.5">{formErrors.firstName}</p>}
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <label className={labelClass} htmlFor="lastName">Last name {isRequired && <span className="text-red-500">*</span>}</label>
                    <input id="lastName" type="text" value={lastName} onChange={handleLastNameChange} placeholder="Last name" className={inputClass(!!formErrors.lastName)} />
                    {formErrors.lastName && <p className="text-xs text-red-500 mt-0.5">{formErrors.lastName}</p>}
                  </div>
                </div>
              </div>
              {avatar && <p className="text-xs text-emerald-600 font-medium">✓ {avatar.name}</p>}

              {/* Row 2: Shift & preferences – 4 dropdowns */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <label className={labelClass} htmlFor="shift-preference">Shift preference {isRequired && <span className="text-red-500">*</span>}</label>
                  <select
                    id="shift-preference"
                    value={shiftPreference}
                    onChange={(e) => setShiftPreference(e.target.value)}
                    className={inputClass(!!formErrors.shiftPreference)}
                  >
                    <option value="day">Day</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="night">Night</option>
                  </select>
                  {formErrors.shiftPreference && <p className="text-xs text-red-500 mt-0.5">{formErrors.shiftPreference}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="customStartTime">Start time {isRequired && <span className="text-red-500">*</span>}</label>
                  <select id="customStartTime" value={customStartTime ? customStartTime.slice(0, 5) : ''} onChange={handleCustomStartTimeChange} className={inputClass(!!formErrors.customStartTime)}>
                    <option value="">Select time</option>
                    {Array.from({ length: 96 }, (_, i) => {
                      const h = Math.floor(i / 4).toString().padStart(2, '0');
                      const m = ((i % 4) * 15).toString().padStart(2, '0');
                      return `${h}:${m}`;
                    }).map((time) => <option key={time} value={time}>{time}</option>)}
                  </select>
                  {formErrors.customStartTime && <p className="text-xs text-red-500 mt-0.5">{formErrors.customStartTime}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="preferredLocation">Location {isRequired && <span className="text-red-500">*</span>}</label>
                  <select id="preferredLocation" value={preferredLocation} onChange={handlePreferredLocationChange} className={inputClass(!!formErrors.preferredLocation)}>
                    <option value="">Select location</option>
                    {locations?.length > 0 ? locations.map((loc) => <option key={loc.id} value={loc.name}>{loc.name}</option>) : (
                      <><option value="Main Hub">Main Hub</option><option value="NRC">NRC</option></>
                    )}
                  </select>
                  {formErrors.preferredLocation && <p className="text-xs text-red-500 mt-0.5">{formErrors.preferredLocation}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency">Agency {isRequired && <span className="text-red-500">*</span>}</label>
                  <select id="agency" value={agencyId || ''} onChange={(e) => setAgencyId(e.target.value || null)} className={inputClass(!!formErrors.agency)}>
                    <option value="">Select agency</option>
                    {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {formErrors.agency && <p className="text-xs text-red-500 mt-0.5">{formErrors.agency}</p>}
                </div>
              </div>
            </div>
            {/* Footer: Change profile photo + Save profile */}
            <div className="px-3 py-2 min-h-[44px] border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2 flex-wrap">
              <input type="file" id="avatar" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              <label
                htmlFor="avatar"
                className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Change profile photo
              </label>
              <button
                type="submit"
                id="submit-profile"
                name="submit-profile"
                disabled={loading}
                className={`h-8 px-4 text-xs font-semibold text-charcoal bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors ${
                  loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.99]'
                }`}
              >
                {loading ? 'Saving…' : isRequired ? 'Complete profile' : 'Save profile'}
              </button>
            </div>
          </div>

          {/* Attendance & disciplinary */}
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
            <div className="px-3 py-2 min-h-[44px] bg-red-50 border-b border-red-200 flex items-center">
              <h3 className="text-sm font-semibold text-red-800">Attendance & disciplinary</h3>
            </div>
            <div className="p-3 bg-yellow-50/50">
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Attendance</h4>
                  {attendanceRecords.length === 0 ? (
                    <p className="text-sm text-gray-500">No attendance records.</p>
                  ) : (
                    <ul className="text-sm text-gray-600 space-y-1">
                      {attendanceRecords.map((r, i) => (
                        <li key={i}>
                          {r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'} —{' '}
                          <span className="font-medium capitalize">{(r.status || '').replace('_', ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Disciplinary notes</h4>
                  {violations.length === 0 ? (
                    <p className="text-sm text-gray-500">You have no disciplinary notes.</p>
                  ) : (
                    <ul className="text-sm text-gray-600 space-y-1">
                      {violations.map((v) => (
                        <li key={v.id}>
                          {v.created_at ? format(new Date(v.created_at), 'd MMM yyyy') : '—'} — {v.body}
                          {v.category && (
                            <span className="text-gray-500 ml-1">
                              ({v.category === 'trailer_check' ? 'Trailer not checked' : v.category === 'radio' ? 'Not listening to radio' : v.category})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

ProfilePage.propTypes = {
  isRequired: PropTypes.bool,
  supabaseClient: PropTypes.object.isRequired,
  simplifiedView: PropTypes.bool
};
