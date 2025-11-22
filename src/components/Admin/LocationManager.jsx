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
  const [confirmDialog, setConfirmDialog] = useState({ visible: false, title: '', message: '', action: null });
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
    setConfirmDialog({
      visible: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} Location`,
      message: `Are you sure you want to ${action} "${name}"?`,
      locationId: id,
      locationName: name,
      action: () => toggleLocationStatus(id, currentStatus),
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
      title: "Delete Location",
      message: `Are you sure you want to permanently delete the location "${name}"? This action cannot be undone.`,
      locationId: id,
      locationName: name,
      action: () => deleteLocation(id),
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
    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Location Management</h3>
      
      {/* Add new location */}
      <div className="mb-5 flex items-end gap-2">
        <div className="flex-grow">
          <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="new-location">
            Add New Location
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
            className="w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
            disabled={loading}
            ref={newLocationInputRef}
          />
        </div>
        <button
          type="button"
          onClick={handleAddLocation}
          disabled={loading || !newLocation.trim()}
          className={`px-4 py-2 bg-charcoal hover:bg-charcoal/90 rounded-lg text-white transition-colors ${
            loading || !newLocation.trim() ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Add
        </button>
      </div>
      
      {/* Locations list */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Existing Locations</h4>
        
        {loading && locations.length === 0 ? (
          <div className="text-gray-600 text-center py-4 text-sm">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="text-gray-500 text-center py-4 text-sm">No locations found</div>
        ) : (
          <div className="space-y-2">
            {locations.map(location => (
              <div 
                key={location.id} 
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  location.is_active 
                    ? 'bg-white border-gray-200' 
                    : 'bg-white border-gray-200 opacity-60'
                }`}
              >
                {editLocationId === location.id ? (
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={editLocationName}
                      onChange={(e) => setEditLocationName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border-2 border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-charcoal/20 focus:border-charcoal"
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <span className={`flex-grow text-gray-900 ${!location.is_active ? 'line-through text-gray-500' : ''}`}>
                    {location.name}
                  </span>
                )}
                
                <div className="flex items-center gap-1">
                  {editLocationId === location.id ? (
                    <>
                      <button
                        onClick={() => updateLocation(location.id)}
                        disabled={loading}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors p-1.5 rounded"
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
                            : 'text-green-600 hover:text-green-700 hover:bg-green-50'
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
            ))}
          </div>
        )}
      </div>
      
      {/* Confirmation Dialog */}
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
        confirmText={confirmDialog.isDestructive ? "Delete" : "Yes"}
        cancelText="Cancel"
        isDestructive={confirmDialog.isDestructive}
      />
    </div>
  );
} 