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
  const [yardSystemId, setYardSystemId] = useState('');
  const [shiftPreference, setShiftPreference] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [performanceScore, setPerformanceScore] = useState(50);
  const [avatar, setAvatar] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  
  // Rota Planner fields
  const [customStartTime, setCustomStartTime] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [locations, setLocations] = useState([]);
  
  // Agency field
  const [agencies, setAgencies] = useState([]);
  const [agencyId, setAgencyId] = useState(null);
  
  const [formErrors, setFormErrors] = useState({
    firstName: '',
    lastName: '',
    yardSystemId: '',
    shiftPreference: '',
    performanceScore: '',
    timeRange: ''
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
      setYardSystemId(user.yard_system_id || '');
      setShiftPreference(user.shift_preference || '');
      setIsActive(user.is_active !== false); // Default to true if not set
      setPerformanceScore(user.performance_score || 50);
      setAvatarUrl(user.avatar_url || null);
      setCustomStartTime(user.custom_start_time || '');
      setPreferredLocation(user.preferred_location || '');
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

  // Form validation
  const validateForm = async () => {
    let isValid = true;
    const errors = {
      firstName: '',
      lastName: '',
      yardSystemId: '',
      shiftPreference: '',
      performanceScore: '',
      timeRange: ''
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
    
    // Validate Yard System ID if provided
    if (yardSystemId.trim()) {
      const trimmedId = yardSystemId.trim().toUpperCase();
      
      // Check if it's changed from original
      if (trimmedId !== (user.yard_system_id || '').toUpperCase()) {
        // Check for uniqueness
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('yard_system_id', trimmedId)
          .neq('id', user.id);
        
        if (error) {
          console.error('Error checking yard_system_id uniqueness:', error);
          errors.yardSystemId = 'Error validating Yard System ID';
          isValid = false;
        } else if (data && data.length > 0) {
          errors.yardSystemId = 'This Yard System ID is already in use';
          isValid = false;
        }
      }
    }
    
    if (!shiftPreference) {
      errors.shiftPreference = 'Shift preference is required';
      isValid = false;
    }
    
    if (performanceScore < 1 || performanceScore > 99) {
      errors.performanceScore = 'Performance score must be between 1 and 99';
      isValid = false;
    }
    
    setFormErrors(errors);
    return isValid;
  };

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const isFormValid = await validateForm();
    if (!isFormValid) {
      return;
    }
    
    setLoading(true);
    
    try {
      // Update user profile info
      const updates = {
        id: user.id,
        first_name: capitalizeFirstLetter(firstName.trim()),
        last_name: capitalizeFirstLetter(lastName.trim()),
        yard_system_id: yardSystemId.trim().toUpperCase() || null,
        shift_preference: shiftPreference,
        is_active: isActive,
        performance_score: parseInt(performanceScore, 10),
        updated_at: new Date().toISOString(),
        // Rota Planner fields
        custom_start_time: customStartTime || null,
        preferred_location: preferredLocation || null,
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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] px-3" 
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
        className="bg-white rounded-3xl md:rounded-xl shadow-2xl w-full max-w-md md:max-w-2xl mx-auto max-h-[90vh] overflow-y-auto border-2 border-gray-400" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-black px-5 py-4 border-b border-gray-900 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className="text-lg font-bold text-white">
                Edit User Profile
              </h3>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4">
            {/* Avatar Upload & Active Status */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-7 h-7 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
                    </svg>
                  )}
                </div>
                <label className="flex items-center px-3 py-1.5 text-sm bg-white cursor-pointer rounded-lg border-2 border-gray-300 text-charcoal font-medium hover:bg-gray-50 transition-colors">
                  <span>Upload</span>
                  <input
                    id="admin-edit-avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="sr-only"
                  />
                </label>
              </div>
              
              {/* Active Account Toggle */}
              <div className="flex items-center gap-2">
                <label htmlFor="admin-edit-isActive" className="text-sm text-gray-600">
                  Active
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => !loading && setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isActive ? 'bg-green-500' : 'bg-gray-300'
                  } ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                      isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            
            {/* Basic Info */}
            <div className="space-y-3">
              {/* First Name & Last Name - side by side on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-edit-firstName" className="block text-charcoal font-medium mb-1.5 text-sm">
                  First Name
                </label>
                <input
                  id="admin-edit-firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:border-blue-500 ${
                    formErrors.firstName ? 'border-red-400/70' : 'border-gray-300'
                  }`}
                  placeholder="First name"
                  disabled={loading}
                />
                {formErrors.firstName && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.firstName}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="admin-edit-lastName" className="block text-charcoal font-medium mb-1.5 text-sm">
                  Last Name
                </label>
                <input
                  id="admin-edit-lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:border-blue-500 ${
                    formErrors.lastName ? 'border-red-400/70' : 'border-gray-300'
                  }`}
                  placeholder="Last name"
                  disabled={loading}
                />
                {formErrors.lastName && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.lastName}</p>
                )}
                </div>
              </div>
              
              {/* Yard System ID, Shift Preference, Agency - side by side on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="admin-edit-yardSystemId" className="block text-charcoal font-medium mb-1.5 text-sm">
                  Yard System ID
                </label>
                <input
                  id="admin-edit-yardSystemId"
                  type="text"
                  value={yardSystemId}
                  onChange={(e) => setYardSystemId(e.target.value.toUpperCase())}
                  style={{ textTransform: 'uppercase' }}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:border-blue-500 ${
                    formErrors.yardSystemId ? 'border-red-400/70' : 'border-gray-300'
                  }`}
                    placeholder="E.G., AG10"
                  disabled={loading}
                />
                {formErrors.yardSystemId && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.yardSystemId}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="admin-edit-shiftPreference" className="block text-charcoal font-medium mb-1.5 text-sm">
                    Shift
                </label>
                <select
                  id="admin-edit-shiftPreference"
                  value={shiftPreference}
                  onChange={(e) => setShiftPreference(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:border-blue-500 ${
                    formErrors.shiftPreference ? 'border-red-400/70' : 'border-gray-300'
                  }`}
                  disabled={loading}
                >
                    <option value="">Select</option>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="afternoon">Afternoon</option>
                </select>
                {formErrors.shiftPreference && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.shiftPreference}</p>
                )}
              </div>
              
              <div>
                <label htmlFor="admin-edit-agency" className="block text-charcoal font-medium mb-1.5 text-sm">
                  Agency
                </label>
                <select
                  id="admin-edit-agency"
                  value={agencyId || ''}
                  onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-charcoal focus:outline-none focus:border-blue-500"
                  disabled={loading}
                >
                    <option value="">None</option>
                  {agencies.map(agency => (
                    <option key={agency.id} value={agency.id}>{agency.name}</option>
                  ))}
                </select>
                </div>
              </div>
              
              {/* Performance Score, Start Time, Location - side by side on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="admin-edit-performanceScore" className="block text-charcoal font-medium mb-1.5 text-sm">
                    Score (1-99)
                </label>
                <input
                  id="admin-edit-performanceScore"
                  type="number"
                  min="1"
                  max="99"
                  value={performanceScore}
                  onChange={(e) => setPerformanceScore(e.target.value)}
                  className={`w-full px-3 py-2 text-sm bg-white border rounded-lg text-charcoal focus:outline-none focus:border-blue-500 ${
                    formErrors.performanceScore ? 'border-red-400/70' : 'border-gray-300'
                  }`}
                  disabled={loading}
                />
                {formErrors.performanceScore && (
                  <p className="mt-1 text-sm text-red-500">{formErrors.performanceScore}</p>
                )}
              </div>
              
                <div>
                  <label htmlFor="admin-edit-startTime" className="block text-charcoal font-medium mb-1.5 text-sm">
                    Start Time
                  </label>
                  <select
                    id="admin-edit-startTime"
                    value={customStartTime ? customStartTime.slice(0, 5) : ''}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-charcoal focus:outline-none focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="">No preference</option>
                    {Array.from({ length: 96 }, (_, i) => {
                      const hours = Math.floor(i / 4).toString().padStart(2, '0');
                      const minutes = ((i % 4) * 15).toString().padStart(2, '0');
                      return `${hours}:${minutes}`;
                    }).map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="admin-edit-location" className="block text-charcoal font-medium mb-1.5 text-sm">
                    Location
                  </label>
                  <select
                    id="admin-edit-location"
                    value={preferredLocation || ''}
                    onChange={(e) => setPreferredLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-charcoal focus:outline-none focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="">No preference</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.name}>{location.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
            </div>
            
            {/* Form Actions */}
            <div className="mt-4 flex gap-2 justify-end border-t border-gray-200 pt-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-charcoal font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-4 py-2 text-sm bg-black hover:bg-gray-900 rounded-lg text-white font-semibold transition-colors shadow-md ${
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