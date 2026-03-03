import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/ToastContext';

export default function LocationManager({ showAddForm = false, setShowAddForm }) {
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
    if (showAddForm && newLocationInputRef.current) {
      newLocationInputRef.current.focus();
    }
  }, [showAddForm]);

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
      if (setShowAddForm) setShowAddForm(false);
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
      {/* Add new location – only when opened from toolbar "+ Add" (same style as Tug Management) */}
      {showAddForm && (
        <div className="bg-white rounded-xl border-2 border-charcoal p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-charcoal">Add new location</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-location">
                Location name *
              </label>
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                disabled={loading}
                ref={newLocationInputRef}
              />
            </div>
            <button
              type="button"
              onClick={handleAddLocation}
              disabled={loading || !newLocation.trim()}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm && setShowAddForm(false)}
              className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Locations list – floating cards, same style as Tug Management */}
      <div className="space-y-3">
        {loading && locations.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">Loading locations…</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="font-medium">No locations found</p>
            <p className="text-sm mt-1">Add your first location above.</p>
          </div>
        ) : (
          locations.map((location) => (
            <div
              key={location.id}
              className={`rounded-xl border border-red-200 bg-red-50/50 overflow-hidden shadow-sm ${
                !location.is_active ? 'opacity-60' : ''
              }`}
            >
            <div className="px-4 py-3 flex flex-nowrap items-center gap-2 min-h-[52px]">
                {editLocationId === location.id ? (
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={editLocationName}
                      onChange={(e) => setEditLocationName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <span className={`flex-1 min-w-0 text-sm font-semibold text-charcoal truncate ${!location.is_active ? 'line-through text-gray-500' : ''}`}>
                    {location.name}
                  </span>
                )}

                <div className="flex items-center justify-end gap-0.5 flex-shrink-0">
                  {editLocationId === location.id ? (
                    <>
                      <button
                        onClick={() => updateLocation(location.id)}
                        disabled={loading}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Save location"
                        title="Save"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Cancel"
                        title="Cancel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(location)}
                        disabled={loading}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="Edit"
                        title="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => confirmToggleLocationStatus(location.id, location.name, location.is_active)}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label={location.is_active ? 'Deactivate' : 'Activate'}
                        title={location.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {location.is_active ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => confirmDeleteLocation(location.id, location.name)}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
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