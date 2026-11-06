import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import DeleteAccountButton from '../components/Profile/DeleteAccountButton';
import PropTypes from 'prop-types';
import { useToast } from '../components/ui/ToastContext';
import { format } from 'date-fns';
import { normalizeAvatarStorageUrl } from '../utils/avatarUrl';
import { normalizePhoneE164 } from '../utils/phoneE164';
import { formatPreferredStartTime, PREFERRED_START_SAVED_EVENT } from '../utils/preferredStartTime';

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
  // WhatsApp PreCheck reminders (messaging phone + consent)
  const [phoneE164, setPhoneE164] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  // Attendance & notes (own records only)
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [violations, setViolations] = useState([]);
  const [profileTab, setProfileTab] = useState('details');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);

  useEffect(() => {
    const handlePreferredStartSaved = (event) => {
      if (event.detail) setCustomStartTime(event.detail);
    };
    window.addEventListener(PREFERRED_START_SAVED_EVENT, handlePreferredStartSaved);
    return () => window.removeEventListener(PREFERRED_START_SAVED_EVENT, handlePreferredStartSaved);
  }, []);

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
      
      // phone_e164 / whatsapp_opt_in are not table-selectable (sensitive columns);
      // load them via own-row SECURITY DEFINER RPC only.
      const [profileResult, messagingResult] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select(
            'id, first_name, last_name, shift_preference, avatar_url, preferred_start_time, custom_start_time, preferred_location, agency_id, account_status, profile_completed, role',
          )
          .eq('id', user.id)
          .single(),
        supabaseClient.rpc('get_own_whatsapp_messaging'),
      ]);

      const { data, error } = profileResult;
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      if (messagingResult.error) {
        throw messagingResult.error;
      }
      
      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setShiftPreference(data.shift_preference || 'day');
        setAvatarUrl(normalizeAvatarStorageUrl(data.avatar_url) || '');
        // Load Rota Planner fields
        setCustomStartTime(
          formatPreferredStartTime(data.preferred_start_time) || data.custom_start_time || ''
        );
        setPreferredLocation(data.preferred_location || '');
        setAgencyId(data.agency_id || null);
      }

      const messaging = Array.isArray(messagingResult.data)
        ? messagingResult.data[0]
        : messagingResult.data;
      setPhoneE164(messaging?.phone_e164 || '');
      setWhatsappOptIn(Boolean(messaging?.whatsapp_opt_in));
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

  // Fetch own attendance (standard view only). Independent from notes so a rota
  // failure cannot hide admin-written notes on My record.
  useEffect(() => {
    if (!user?.id || !supabaseClient || simplifiedView) return;
    const fetchAttendance = async () => {
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
      } catch (err) {
        console.error('Error fetching attendance:', err);
        setAttendanceRecords([]);
      }
    };
    fetchAttendance();
  }, [user?.id, supabaseClient, simplifiedView]);

  // Admin notes (shunter_violations) — load on mount; optional refresh when opening
  // My record. Never clear existing notes on error; ignore stale responses.
  const notesFetchGenRef = React.useRef(0);
  const notesLoadedRef = React.useRef(false);

  useEffect(() => {
    if (!user?.id || !supabaseClient || simplifiedView) return;

    const fetchNotes = async () => {
      const gen = ++notesFetchGenRef.current;
      try {
        const { data: violData, error: violErr } = await supabaseClient
          .from('shunter_violations')
          .select('id, body, category, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (gen !== notesFetchGenRef.current) return;
        if (violErr) throw violErr;
        setViolations(violData || []);
        notesLoadedRef.current = true;
      } catch (err) {
        if (gen !== notesFetchGenRef.current) return;
        console.error('Error fetching notes:', err);
        // Keep previously loaded notes so My record does not flash empty
      }
    };

    // Initial load
    if (!notesLoadedRef.current) {
      fetchNotes();
      return;
    }

    // Refresh only when entering My record (not on every toggle back to details)
    if (profileTab === 'record') {
      fetchNotes();
    }
  }, [user?.id, supabaseClient, simplifiedView, profileTab]);

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
      
      let normalizedPhone = null;
      try {
        normalizedPhone = normalizePhoneE164(phoneE164);
      } catch (phoneError) {
        setFormErrors((prev) => ({
          ...prev,
          phoneE164: phoneError.message || 'Enter a valid phone number',
        }));
        toast.error(phoneError.message || 'Enter a valid phone number');
        setLoading(false);
        return;
      }

      if (whatsappOptIn && !normalizedPhone) {
        setFormErrors((prev) => ({
          ...prev,
          phoneE164: 'Add a phone number to enable WhatsApp reminders',
        }));
        toast.error('Add a phone number to enable WhatsApp reminders');
        setLoading(false);
        return;
      }

      // Create profile data object.
      // phone_e164 / whatsapp_opt_in have SELECT revoked (same pattern as email).
      // Postgres INSERT … ON CONFLICT DO UPDATE requires SELECT on every column
      // written, so upserting those fields fails with
      // "permission denied for table profiles". Upsert only selectable columns;
      // write messaging fields with a separate UPDATE (PhoneRequiredPrompt pattern).
      const messagingData = {
        phone_e164: normalizedPhone,
        whatsapp_opt_in: Boolean(whatsappOptIn && normalizedPhone),
      };
      const profileData = {
        id: user.id,
        first_name: capitalizedFirstName,
        last_name: capitalizedLastName,
        shift_preference: shiftPreference,
        avatar_url: avatar_url || null, // Explicitly set null when no avatar
        updated_at: new Date().toISOString(),
        // Add Rota Planner fields
        custom_start_time: customStartTime || null,
        preferred_start_time: customStartTime || null,
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

      const { error: messagingError } = await supabaseClient
        .from('profiles')
        .update(messagingData)
        .eq('id', user.id);
      if (messagingError) {
        throw messagingError;
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
        setAvatarPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return '';
        });
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
      setAvatarPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setFormErrors(prev => ({ ...prev, avatar: undefined }));
    }
  };

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [avatarPreview, avatarUrl]);

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
  const displayAvatar = avatarPreview || avatarUrl;
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || 'Your profile';
  const startTimeOptions = Array.from({ length: 96 }, (_, i) => {
    const hours = Math.floor(i / 4).toString().padStart(2, '0');
    const minutes = ((i % 4) * 15).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  });

  const inputClass = (hasError) =>
    `w-full px-3 py-2.5 text-sm rounded-lg border bg-white text-charcoal focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors ${
      hasError ? 'border-red-400' : 'border-gray-200'
    }`;
  const labelClass = 'block text-gray-700 font-medium mb-1 text-sm';

  const renderAvatarControl = (inputId, sizeClass = 'w-24 h-24') => (
    <>
      <input type="file" id={inputId} accept="image/*" onChange={handleAvatarChange} className="hidden" />
      <label
        htmlFor={inputId}
        className={`${sizeClass} rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center cursor-pointer shadow-sm hover:opacity-90 transition-opacity shrink-0`}
        title="Change profile photo"
      >
        {displayAvatar && !avatarImageFailed ? (
          <img
            src={displayAvatar}
            alt="Profile"
            className="w-full h-full object-cover"
            onError={() => setAvatarImageFailed(true)}
          />
        ) : (
          <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        )}
      </label>
    </>
  );

  if (loading && !isRequired && !simplifiedView) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-6 animate-pulse">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-slate-200 mx-auto md:mx-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-40 bg-slate-200 rounded mx-auto md:mx-0" />
              <div className="h-4 w-28 bg-slate-200 rounded mx-auto md:mx-0" />
            </div>
          </div>
          <div className="h-8 w-full md:w-64 bg-slate-200 rounded-lg" />
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Simplified view - full screen form focused on required fields (no My record tab)
  if (simplifiedView) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-start sm:items-center p-4 pb-24">
        <div className="w-full max-w-2xl">
          {message.text && (
            <div
              className={`mb-4 p-3 rounded-xl text-sm ${
                message.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {message.text}
              {message.type === 'error' && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 text-sm font-medium hover:underline"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                {renderAvatarControl('avatar-simplified')}
                <div className="text-center md:text-left min-w-0">
                  <h1 className="text-lg font-semibold text-charcoal">Complete your profile</h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    <span className="md:hidden">Tap photo to change</span>
                    <span className="hidden md:inline">Click photo to change</span>
                    {' · '}Optional, max 7MB
                  </p>
                  {avatar && (
                    <p className="text-xs text-charcoal mt-1 font-medium">
                      Selected: {avatar.name}. Save profile to apply.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="firstName">
                    First name {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    onChange={handleFirstNameChange}
                    className={inputClass(!!formErrors.firstName)}
                    placeholder="First name"
                  />
                  {formErrors.firstName && <p className="text-xs text-red-500 mt-0.5">{formErrors.firstName}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="lastName">
                    Last name {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    onChange={handleLastNameChange}
                    className={inputClass(!!formErrors.lastName)}
                    placeholder="Last name"
                  />
                  {formErrors.lastName && <p className="text-xs text-red-500 mt-0.5">{formErrors.lastName}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="shift-preference">
                    Shift preference {isRequired && <span className="text-red-500">*</span>}
                  </label>
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
                  {formErrors.shiftPreference && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.shiftPreference}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="customStartTime">
                    Start time {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="customStartTime"
                    value={customStartTime ? customStartTime.slice(0, 5) : ''}
                    onChange={handleCustomStartTimeChange}
                    className={inputClass(!!formErrors.customStartTime)}
                  >
                    <option value="">Select time</option>
                    {startTimeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                  {formErrors.customStartTime && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.customStartTime}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="preferredLocation">
                    Location {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="preferredLocation"
                    value={preferredLocation}
                    onChange={handlePreferredLocationChange}
                    className={inputClass(!!formErrors.preferredLocation)}
                  >
                    <option value="">Select location</option>
                    {locations?.length > 0 ? (
                      locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>
                          {loc.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Main Hub">Main Hub</option>
                        <option value="NRC">NRC</option>
                      </>
                    )}
                  </select>
                  {formErrors.preferredLocation && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.preferredLocation}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency">
                    Agency {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="agency"
                    value={agencyId || ''}
                    onChange={(e) => setAgencyId(e.target.value || null)}
                    className={inputClass(!!formErrors.agency)}
                  >
                    <option value="">Select agency</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.agency && <p className="text-xs text-red-500 mt-0.5">{formErrors.agency}</p>}
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  id="submit-profile"
                  name="submit-profile"
                  disabled={loading}
                  className={`w-full md:w-auto md:min-w-[200px] py-3 px-6 bg-black hover:bg-gray-800 text-white rounded-xl font-semibold text-sm transition-colors ${
                    loading ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving…' : 'Complete profile'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {isOffline && (
          <div className="p-2.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <svg className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z"
                clipRule="evenodd"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-800">You appear to be offline.</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-1 text-sm font-medium text-amber-700 hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {isRequired && (
          <div className="p-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm">
            <p className="font-medium text-charcoal">Welcome to Shunters.net</p>
            <p className="text-xs text-gray-600 mt-0.5">Complete your profile. Fields marked with * are required.</p>
          </div>
        )}

        {message.text && (
          <div
            className={`p-2.5 rounded-xl text-sm ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            {message.text}
            {message.type === 'error' && (
              <button
                type="button"
                onClick={handleRetry}
                className="mt-1 text-sm font-medium hover:underline"
                id="retry-button"
                name="retry-button"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Hero */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 text-center md:text-left">
          {renderAvatarControl('avatar-profile')}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-charcoal truncate">{displayName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="md:hidden">Tap photo to change</span>
              <span className="hidden md:inline">Click photo to change</span>
            </p>
            {avatar && (
              <p className="text-xs text-charcoal mt-1 font-medium">
                Selected: {avatar.name}. Save profile to apply.
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-seg-track w-full grid grid-cols-2 !h-auto p-0.5 md:w-auto md:inline-grid md:!h-8">
          <button
            type="button"
            onClick={() => setProfileTab('details')}
            className={`admin-seg-item w-full !h-9 md:!h-7 ${
              profileTab === 'details' ? 'admin-seg-item-active' : ''
            }`}
          >
            My details
          </button>
          <button
            type="button"
            onClick={() => setProfileTab('record')}
            className={`admin-seg-item w-full !h-9 md:!h-7 ${
              profileTab === 'record' ? 'admin-seg-item-active' : ''
            }`}
          >
            My record
          </button>
        </div>

        {profileTab === 'details' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="firstName">
                    First name {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={handleFirstNameChange}
                    placeholder="First name"
                    className={inputClass(!!formErrors.firstName)}
                  />
                  {formErrors.firstName && <p className="text-xs text-red-500 mt-0.5">{formErrors.firstName}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="lastName">
                    Last name {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={handleLastNameChange}
                    placeholder="Last name"
                    className={inputClass(!!formErrors.lastName)}
                  />
                  {formErrors.lastName && <p className="text-xs text-red-500 mt-0.5">{formErrors.lastName}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="shift-preference">
                    Shift preference {isRequired && <span className="text-red-500">*</span>}
                  </label>
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
                  {formErrors.shiftPreference && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.shiftPreference}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="customStartTime">
                    Start time {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="customStartTime"
                    value={customStartTime ? customStartTime.slice(0, 5) : ''}
                    onChange={handleCustomStartTimeChange}
                    className={inputClass(!!formErrors.customStartTime)}
                  >
                    <option value="">Select time</option>
                    {startTimeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                  {formErrors.customStartTime && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.customStartTime}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="preferredLocation">
                    Location {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="preferredLocation"
                    value={preferredLocation}
                    onChange={handlePreferredLocationChange}
                    className={inputClass(!!formErrors.preferredLocation)}
                  >
                    <option value="">Select location</option>
                    {locations?.length > 0 ? (
                      locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>
                          {loc.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Main Hub">Main Hub</option>
                        <option value="NRC">NRC</option>
                      </>
                    )}
                  </select>
                  {formErrors.preferredLocation && (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.preferredLocation}</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor="agency">
                    Agency {isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="agency"
                    value={agencyId || ''}
                    onChange={(e) => setAgencyId(e.target.value || null)}
                    className={inputClass(!!formErrors.agency)}
                  >
                    <option value="">Select agency</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {formErrors.agency && <p className="text-xs text-red-500 mt-0.5">{formErrors.agency}</p>}
                </div>
                <div>
                  <label className={labelClass} htmlFor="phoneE164">
                    Phone (WhatsApp)
                  </label>
                  <input
                    id="phoneE164"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneE164}
                    onChange={(e) => {
                      setPhoneE164(e.target.value);
                      setFormErrors((prev) => ({ ...prev, phoneE164: '' }));
                    }}
                    placeholder="+447…"
                    className={inputClass(!!formErrors.phoneE164)}
                  />
                  {formErrors.phoneE164 ? (
                    <p className="text-xs text-red-500 mt-0.5">{formErrors.phoneE164}</p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Phone is required so we can confirm your shifts and send operational reminders
                      about PreCheck and breaks. UK numbers OK as 07… or +44….
                    </p>
                  )}
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-charcoal">WhatsApp reminders</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Operational reminders only (PreCheck and similar) — not marketing. You can
                        turn this off anytime.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={whatsappOptIn}
                      id="whatsappOptIn"
                      onClick={() => setWhatsappOptIn((v) => !v)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        whatsappOptIn ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                          whatsappOptIn ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col md:flex-row md:items-center md:justify-end gap-3">
                <button
                  type="submit"
                  id="submit-profile"
                  name="submit-profile"
                  disabled={loading}
                  className={`w-full md:w-auto md:min-w-[160px] h-11 md:h-10 px-5 text-sm font-semibold text-white bg-black hover:bg-gray-800 rounded-xl transition-colors ${
                    loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.99]'
                  }`}
                >
                  {loading ? 'Saving…' : isRequired ? 'Complete profile' : 'Save profile'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 space-y-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Attendance</h2>
              {attendanceRecords.length === 0 ? (
                <p className="text-sm text-gray-500">No attendance records.</p>
              ) : (
                <ul className="text-sm text-gray-700 space-y-1.5">
                  {attendanceRecords.map((r, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="text-gray-500">
                        {r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}
                      </span>
                      <span className="font-medium capitalize">{(r.status || '').replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Notes from management
              </h2>
              {violations.length === 0 ? (
                <p className="text-sm text-gray-500">No notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {violations.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-charcoal"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mb-1">
                        <span>
                          {v.created_at ? format(new Date(v.created_at), 'd MMM yyyy') : '—'}
                        </span>
                        {v.category && (
                          <span>
                            ·{' '}
                            {v.category === 'trailer_check'
                              ? 'Trailer not checked'
                              : v.category === 'radio'
                                ? 'Not listening to radio'
                                : v.category === 'other'
                                  ? 'Other'
                                  : v.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-charcoal whitespace-pre-wrap break-words">{v.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Outside the profile form so modal submit does not bubble into Save */}
        {profileTab === 'details' && (
          <div className="pt-1 text-center md:text-left">
            <DeleteAccountButton variant="link" />
          </div>
        )}
      </div>
    </div>
  );
}

ProfilePage.propTypes = {
  isRequired: PropTypes.bool,
  supabaseClient: PropTypes.object.isRequired,
  simplifiedView: PropTypes.bool
};
