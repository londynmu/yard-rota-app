import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../components/ui/ToastContext';
import { normalizeAvatarStorageUrl } from '../../utils/avatarUrl';
import { formatPreferredStartTime, QUARTER_HOUR_TIMES } from '../../utils/preferredStartTime';

const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
};

const inputClass = (hasError) =>
  `admin-input ${hasError ? '!border-red-400' : ''}`;

const ToggleSwitch = ({ id, checked, onChange, disabled, label }) => (
  <div className="flex items-center gap-2">
    <label htmlFor={id} className="text-xs text-gray-600 whitespace-nowrap">
      {label}
    </label>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-charcoal' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

ToggleSwitch.propTypes = {
  id: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  label: PropTypes.string.isRequired,
};

function snapshotFromUser(user) {
  return {
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    yardSystemId: user?.yard_system_id || '',
    shiftPreference: user?.shift_preference || '',
    isActive: user?.is_active !== false,
    showOnReports: user?.show_on_reports !== false,
    performanceScore: String(user?.performance_score || 50),
    preferredStartTime: formatPreferredStartTime(user?.preferred_start_time),
    preferredLocation: user?.preferred_location || '',
    additionalLocations: Array.isArray(user?.additional_locations)
      ? [...user.additional_locations].sort()
      : [],
    agencyId: user?.agency_id || null,
  };
}

function currentSnapshot({
  firstName,
  lastName,
  yardSystemId,
  shiftPreference,
  isActive,
  showOnReports,
  performanceScore,
  preferredStartTime,
  preferredLocation,
  additionalLocations,
  agencyId,
}) {
  return {
    firstName,
    lastName,
    yardSystemId,
    shiftPreference,
    isActive,
    showOnReports,
    performanceScore: String(performanceScore),
    preferredStartTime,
    preferredLocation,
    additionalLocations: [...additionalLocations].sort(),
    agencyId,
  };
}

export default function UserEditForm({ user, onClose, onSuccess, inline, onDirtyChange }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [yardSystemId, setYardSystemId] = useState('');
  const [shiftPreference, setShiftPreference] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showOnReports, setShowOnReports] = useState(true);
  const [performanceScore, setPerformanceScore] = useState(50);
  const [avatar, setAvatar] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const [preferredStartTime, setPreferredStartTime] = useState('');
  const [preferredLocation, setPreferredLocation] = useState('');
  const [additionalLocations, setAdditionalLocations] = useState([]);
  const [locations, setLocations] = useState([]);

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
  const baselineRef = useRef(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

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

  useEffect(() => {
    if (user) {
      const snap = snapshotFromUser(user);
      setFirstName(snap.firstName);
      setLastName(snap.lastName);
      setYardSystemId(snap.yardSystemId);
      setShiftPreference(snap.shiftPreference);
      setIsActive(snap.isActive);
      setShowOnReports(snap.showOnReports);
      setPerformanceScore(user.performance_score || 50);
      setAvatarUrl(normalizeAvatarStorageUrl(user.avatar_url) || null);
      setAvatar(null);
      setPreferredStartTime(snap.preferredStartTime);
      setPreferredLocation(snap.preferredLocation);
      setAdditionalLocations(
        Array.isArray(user.additional_locations) ? user.additional_locations : []
      );
      setAgencyId(snap.agencyId);
      baselineRef.current = snap;
      onDirtyChangeRef.current?.(false);
    }
  }, [user]);

  const reportDirty = useCallback(() => {
    if (!baselineRef.current) return;
    const current = currentSnapshot({
      firstName,
      lastName,
      yardSystemId,
      shiftPreference,
      isActive,
      showOnReports,
      performanceScore,
      preferredStartTime,
      preferredLocation,
      additionalLocations,
      agencyId,
    });
    const dirty =
      Boolean(avatar) ||
      JSON.stringify(current) !== JSON.stringify(baselineRef.current);
    onDirtyChangeRef.current?.(dirty);
  }, [
    firstName,
    lastName,
    yardSystemId,
    shiftPreference,
    isActive,
    showOnReports,
    performanceScore,
    preferredStartTime,
    preferredLocation,
    additionalLocations,
    agencyId,
    avatar,
  ]);

  useEffect(() => {
    reportDirty();
  }, [reportDirty]);

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

    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
      isValid = false;
    }

    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
      isValid = false;
    }

    if (yardSystemId.trim()) {
      const trimmedId = yardSystemId.trim().toUpperCase();

      if (trimmedId !== (user.yard_system_id || '').toUpperCase()) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isFormValid = await validateForm();
    if (!isFormValid) {
      return;
    }

    setLoading(true);

    try {
      const startValue = preferredStartTime || null;
      const updates = {
        id: user.id,
        first_name: capitalizeFirstLetter(firstName.trim()),
        last_name: capitalizeFirstLetter(lastName.trim()),
        yard_system_id: yardSystemId.trim().toUpperCase() || null,
        shift_preference: shiftPreference,
        is_active: isActive,
        show_on_reports: showOnReports,
        performance_score: parseInt(performanceScore, 10),
        updated_at: new Date().toISOString(),
        // Preferred start drives both columns so AssignModal / prompts stay in sync
        custom_start_time: startValue,
        preferred_start_time: startValue,
        preferred_location: preferredLocation || null,
        additional_locations: additionalLocations.filter(
          (name) => name && name !== preferredLocation
        ),
        agency_id: agencyId
      };

      if (avatar) {
        const fileExt = avatar.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabase
          .storage
          .from('user-avatars')
          .upload(filePath, avatar, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase
          .storage
          .from('user-avatars')
          .getPublicUrl(filePath);

        updates.avatar_url = publicUrl;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      toast.success('Profile updated successfully!');

      baselineRef.current = currentSnapshot({
        firstName: updates.first_name,
        lastName: updates.last_name,
        yardSystemId: updates.yard_system_id || '',
        shiftPreference: updates.shift_preference,
        isActive: updates.is_active,
        showOnReports: updates.show_on_reports,
        performanceScore: updates.performance_score,
        preferredStartTime: preferredStartTime || '',
        preferredLocation: updates.preferred_location || '',
        additionalLocations: updates.additional_locations || [],
        agencyId: updates.agency_id,
      });
      setAvatar(null);
      onDirtyChangeRef.current?.(false);

      if (onSuccess) {
        onSuccess(updates);
      }
      onClose();
    } catch (error) {
      console.error('Error updating user profile:', error);
      const message = String(error?.message || '');
      if (message.includes('Cannot change yard_system_id')) {
        toast.error(
          'Cannot change Yard System ID. Only an active admin can update this field. If you are an admin, check that your account is Active.'
        );
      } else if (message.includes('Cannot change show_on_reports')) {
        toast.error(
          'Cannot change Show on reports. Only an active admin can update this field.'
        );
      } else {
        toast.error('Failed to update profile: ' + message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!inline) document.body.style.overflow = 'auto';
    onClose();
  };

  const formContent = (
    <form id={inline ? 'user-edit-inline-form' : undefined} onSubmit={handleSubmit}>
      <div className={inline ? 'p-4 max-w-3xl space-y-2' : 'px-5 py-4 space-y-3'}>
        {!inline && (
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
              <label className="admin-btn cursor-pointer">
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
            <div className="flex items-center gap-4 flex-wrap">
              <ToggleSwitch
                id="admin-edit-isActive"
                label="Active"
                checked={isActive}
                onChange={setIsActive}
                disabled={loading}
              />
              <div className="flex flex-col items-end gap-1">
                <ToggleSwitch
                  id="admin-edit-showOnReports"
                  label="Show on reports"
                  checked={showOnReports}
                  onChange={setShowOnReports}
                  disabled={loading}
                />
                <p className="text-[11px] text-gray-500 max-w-[11rem] text-right leading-snug">
                  When off, moves are still imported but hidden from leaderboards and charts.
                </p>
              </div>
            </div>
          </div>
        )}

        {inline && (
          <div className="flex items-center gap-4 flex-wrap pb-1">
            <ToggleSwitch
              id="admin-edit-isActive-inline"
              label="Active"
              checked={isActive}
              onChange={setIsActive}
              disabled={loading}
            />
            <ToggleSwitch
              id="admin-edit-showOnReports-inline"
              label="Show on reports"
              checked={showOnReports}
              onChange={setShowOnReports}
              disabled={loading}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="admin-edit-firstName" className="block text-charcoal font-medium mb-1 text-sm">
                First Name
              </label>
              <input
                id="admin-edit-firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass(Boolean(formErrors.firstName))}
                placeholder="First name"
                disabled={loading}
              />
              {formErrors.firstName && (
                <p className="mt-1 text-sm text-red-500">{formErrors.firstName}</p>
              )}
            </div>

            <div>
              <label htmlFor="admin-edit-lastName" className="block text-charcoal font-medium mb-1 text-sm">
                Last Name
              </label>
              <input
                id="admin-edit-lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass(Boolean(formErrors.lastName))}
                placeholder="Last name"
                disabled={loading}
              />
              {formErrors.lastName && (
                <p className="mt-1 text-sm text-red-500">{formErrors.lastName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label htmlFor="admin-edit-yardSystemId" className="block text-charcoal font-medium mb-1 text-sm">
                Yard System ID
              </label>
              <input
                id="admin-edit-yardSystemId"
                type="text"
                value={yardSystemId}
                onChange={(e) => setYardSystemId(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase' }}
                className={inputClass(Boolean(formErrors.yardSystemId))}
                placeholder="E.G., AG10"
                disabled={loading}
              />
              {formErrors.yardSystemId && (
                <p className="mt-1 text-sm text-red-500">{formErrors.yardSystemId}</p>
              )}
            </div>

            <div>
              <label htmlFor="admin-edit-shiftPreference" className="block text-charcoal font-medium mb-1 text-sm">
                Shift
              </label>
              <select
                id="admin-edit-shiftPreference"
                value={shiftPreference}
                onChange={(e) => setShiftPreference(e.target.value)}
                className={inputClass(Boolean(formErrors.shiftPreference))}
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
              <label htmlFor="admin-edit-agency" className="block text-charcoal font-medium mb-1 text-sm">
                Agency
              </label>
              <select
                id="admin-edit-agency"
                value={agencyId || ''}
                onChange={(e) => setAgencyId(e.target.value ? e.target.value : null)}
                className="admin-input"
                disabled={loading}
              >
                <option value="">None</option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.id}>{agency.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label htmlFor="admin-edit-performanceScore" className="block text-charcoal font-medium mb-1 text-sm">
                Score (1-99)
              </label>
              <input
                id="admin-edit-performanceScore"
                type="number"
                min="1"
                max="99"
                value={performanceScore}
                onChange={(e) => setPerformanceScore(e.target.value)}
                className={inputClass(Boolean(formErrors.performanceScore))}
                disabled={loading}
              />
              {formErrors.performanceScore && (
                <p className="mt-1 text-sm text-red-500">{formErrors.performanceScore}</p>
              )}
            </div>

            <div>
              <label htmlFor="admin-edit-preferredStart" className="block text-charcoal font-medium mb-1 text-sm">
                Preferred start
              </label>
              <select
                id="admin-edit-preferredStart"
                value={preferredStartTime}
                onChange={(e) => setPreferredStartTime(e.target.value)}
                className="admin-input"
                disabled={loading}
              >
                <option value="">Not answered</option>
                {QUARTER_HOUR_TIMES.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="admin-edit-location" className="block text-charcoal font-medium mb-1 text-sm">
                Location
              </label>
              <select
                id="admin-edit-location"
                value={preferredLocation || ''}
                onChange={(e) => {
                  const next = e.target.value;
                  setPreferredLocation(next);
                  setAdditionalLocations((current) => current.filter((name) => name !== next));
                }}
                className="admin-input"
                disabled={loading}
              >
                <option value="">No preference</option>
                {locations.map(location => (
                  <option key={location.id} value={location.name}>{location.name}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <p className="block text-charcoal font-medium mb-1 text-sm">Also works at</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {locations
                  .filter((location) => location.name !== preferredLocation)
                  .map((location) => {
                    const checked = additionalLocations.includes(location.name);
                    return (
                      <label key={location.id} className="inline-flex items-center gap-2 text-sm text-charcoal">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={loading}
                          onChange={() => {
                            setAdditionalLocations((current) => (
                              checked
                                ? current.filter((name) => name !== location.name)
                                : [...current, location.name]
                            ));
                          }}
                        />
                        {location.name}
                      </label>
                    );
                  })}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Shows this person as available when planning those yards too.
              </p>
            </div>
          </div>
        </div>

        {!inline && (
          <div className="mt-4 flex gap-2 justify-end border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="admin-btn disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="admin-btn disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </form>
  );

  if (inline) {
    return (
      <div className="bg-white" ref={modalRef}>
        {formContent}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] px-3"
      onClick={handleClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 10000,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        ref={modalRef}
        className="admin-modal-panel !max-w-md md:!max-w-2xl mx-auto max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="admin-modal-header sticky top-0 z-10 flex items-center justify-between">
          <h3 className="admin-section-title">Edit user profile</h3>
          <button
            type="button"
            onClick={handleClose}
            className="admin-icon-btn"
            aria-label="Close"
          >
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}

UserEditForm.propTypes = {
  user: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
  inline: PropTypes.bool,
  onDirtyChange: PropTypes.func,
};
