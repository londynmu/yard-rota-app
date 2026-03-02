import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/ToastContext';

export default function LocationManager() {
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [editLocationId, setEditLocationId] = useState(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ visible: false, title: '', message: '', action: null, confirmText: 'Yes', isDestructive: false });
  const newLocationInputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (newLocationInputRef.current) {
      newLocationInputRef.current.focus();
    }
  }, []);

  const showNotification = (message, type = 'success') => {
    if (type === 'success') {
      toast.success(message);
    } else if (type === 'error') {
      toast.error(message);
    } else {
      toast.showToast(message, type);
    }
  };

  const fetchLocations = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      
      setLocations(data || []);
    } catch (error) {
      showNotification('Failed to load locations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.trim()) {
      showNotification('Location name cannot be empty', 'error');
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('locations')
        .insert([{ name: newLocation.trim() }]);
        
      if (error) throw error;
      
      setNewLocation('');
      await fetchLocations();
      showNotification('Location added successfully');
    } catch (error) {
      if (error.code === '23505') {
        showNotification('This location name already exists', 'error');
      } else {
        showNotification('Failed to add location', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (location) => {
    setEditLocationId(location.id);
    setEditLocationName(location.name);
  };

  const cancelEditing = () => {
    setEditLocationId(null);
    setEditLocationName('');
  };

  const updateLocation = async (id) => {
    if (!editLocationName.trim()) {
      showNotification('Location name cannot be empty', 'error');
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('locations')
        .update({ name: editLocationName.trim() })
        .eq('id', id);
        
      if (error) throw error;
      
      setEditLocationId(null);
      setEditLocationName('');
      await fetchLocations();
      showNotification('Location updated successfully');
    } catch (error) {
      if (error.code === '23505') {
        showNotification('This location name already exists', 'error');
      } else {
        showNotification('Failed to update location', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmToggleLocationStatus = (id, name, currentStatus) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
    setConfirmDialog({
      visible: true,
      title: `${actionLabel} location`,
      message: `Are you sure you want to ${action} "${name}"?`,
      action: () => toggleLocationStatus(id, currentStatus),
      confirmText: actionLabel,
      isDestructive: false
    });
  };

  const toggleLocationStatus = async (id, currentStatus) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('locations')
        .update({ is_active: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
      
      await fetchLocations();
      showNotification(`Location ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      showNotification('Failed to update location status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteLocation = (id, name) => {
    setConfirmDialog({
      visible: true,
      title: 'Delete location',
      message: `Are you sure you want to permanently delete the location "${name}"? This action cannot be undone.`,
      action: () => deleteLocation(id),
      confirmText: 'Delete',
      isDestructive: true
    });
  };

  const deleteLocation = async (id) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      await fetchLocations();
      showNotification('Location deleted successfully');
    } catch (error) {
      showNotification('Failed to delete location', 'error');
    } finally {
      setLoading(false);
    }
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      ...confirmDialog,
      visible: false
    });
  };

  return (
    <div className="space-y-4">
      {/* Add new location */}
      <div>
        <label className="block text-xs font-semibold text-charcoal uppercase tracking-wide mb-2" htmlFor="new-location">
          Add new location
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input
            type="text"
            id="new-location"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newLocation.trim()) {
                e.preventDefault();
                handleAddLocation();
              }
            }}
            placeholder="Enter location name"
            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-charcoal placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
            disabled={loading}
            ref={newLocationInputRef}
          />
          <button
            type="button"
            onClick={handleAddLocation}
            disabled={loading || !newLocation.trim()}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors shrink-0 ${
              loading || !newLocation.trim()
                ? 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-white text-charcoal border-gray-300 hover:bg-gray-50'
            }`}
          >
            Add
          </button>
        </div>
      </div>

      {/* Locations list */}
      <div>
        <h4 className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Existing locations</h4>

        {loading && locations.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">Loading locations…</div>
        ) : locations.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">No locations found</div>
        ) : (
          <div className="space-y-2">
            {locations.map((location, index) => {
              const bgColors = [
                'bg-white border-amber-200',
                'bg-white border-blue-200',
                'bg-white border-emerald-200',
                'bg-white border-purple-200',
              ];
              const cardStyle = bgColors[index % bgColors.length];
              return (
                <div
                  key={location.id}
                  className={`flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-3 py-2.5 rounded-lg border ${cardStyle} ${
                    !location.is_active ? 'opacity-60' : ''
                  }`}
                >
                  {editLocationId === location.id ? (
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={editLocationName}
                        onChange={(e) => setEditLocationName(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                        disabled={loading}
                      />
                    </div>
                  ) : (
                    <span className={`text-sm font-semibold text-charcoal ${!location.is_active ? 'line-through text-gray-500' : ''}`}>
                      {location.name}
                    </span>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    {editLocationId === location.id ? (
                      <>
                        <button
                          onClick={() => updateLocation(location.id)}
                          disabled={loading}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors p-1.5 rounded"
                          aria-label="Save location"
                          title="Save"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={loading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded"
                          aria-label="Cancel"
                          title="Cancel"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditing(location)}
                          disabled={loading}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors p-1.5 rounded"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => confirmToggleLocationStatus(location.id, location.name, location.is_active)}
                          disabled={loading}
                          className={`${
                            location.is_active
                              ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          } transition-colors p-1.5 rounded`}
                          aria-label={location.is_active ? 'Deactivate' : 'Activate'}
                          title={location.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {location.is_active ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => confirmDeleteLocation(location.id, location.name)}
                          disabled={loading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.visible}
        onClose={closeConfirmDialog}
        onConfirm={() => {
          if (confirmDialog.action) {
            confirmDialog.action();
          }
          closeConfirmDialog();
        }}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText ?? (confirmDialog.isDestructive ? 'Delete' : 'Yes')}
        cancelText="Cancel"
        isDestructive={confirmDialog.isDestructive}
      />
    </div>
  );
} 