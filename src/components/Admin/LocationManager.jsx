import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function LocationManager() {
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [editLocationId, setEditLocationId] = useState(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const newLocationInputRef = React.useRef(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (newLocationInputRef.current) {
      newLocationInputRef.current.focus();
    }
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      console.log("Fetching locations...");
      
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: true });
        
      if (error) {
        console.error("Error fetching locations:", error);
        throw error;
      }
      
      console.log("Locations loaded:", data);
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      setMessage({ 
        text: 'Failed to load locations: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.trim()) {
      setMessage({ text: 'Location name cannot be empty', type: 'error' });
      return;
    }

    try {
      console.log("Adding new location:", newLocation);
      setLoading(true);
      
      const { error } = await supabase
        .from('locations')
        .insert([{ name: newLocation.trim() }]);
        
      if (error) {
        console.error("Error inserting location:", error);
        throw error;
      }
      
      console.log("Location added successfully");
      setNewLocation('');
      await fetchLocations();
      
      setMessage({ text: 'Location added successfully', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 1000);
    } catch (error) {
      console.error('Error adding location:', error);
      
      if (error.code === '23505') {
        setMessage({ text: 'This location name already exists', type: 'error' });
      } else {
        setMessage({ 
          text: 'Failed to add location: ' + (error.message || 'Unknown error'), 
          type: 'error' 
        });
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
      setMessage({ text: 'Location name cannot be empty', type: 'error' });
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
      
      setMessage({ text: 'Location updated successfully', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 1000);
    } catch (error) {
      console.error('Error updating location:', error);
      
      if (error.code === '23505') {
        setMessage({ text: 'This location name already exists', type: 'error' });
      } else {
        setMessage({ 
          text: 'Failed to update location: ' + (error.message || 'Unknown error'), 
          type: 'error' 
        });
      }
    } finally {
      setLoading(false);
    }
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
      
      setMessage({ 
        text: `Location ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 
        type: 'success' 
      });
      
      setTimeout(() => setMessage({ text: '', type: '' }), 1000);
    } catch (error) {
      console.error('Error toggling location status:', error);
      setMessage({ 
        text: 'Failed to update location status: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">Location Management</h3>
      
      {/* Add new location */}
      <div className="mb-6 flex items-end space-x-2">
        <div className="flex-grow">
          <label className="block text-white text-sm font-medium mb-2" htmlFor="new-location">
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
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
            disabled={loading}
            ref={newLocationInputRef}
          />
        </div>
        <button
          type="button"
          onClick={handleAddLocation}
          disabled={loading || !newLocation.trim()}
          className={`px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
            loading || !newLocation.trim() ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          Add
        </button>
      </div>
      
      {/* Locations list */}
      <div className="mb-4">
        <h4 className="text-md font-medium text-white mb-2">Existing Locations</h4>
        
        {loading && locations.length === 0 ? (
          <div className="text-white text-center py-4">Loading locations...</div>
        ) : locations.length === 0 ? (
          <div className="text-white/70 text-center py-4">No locations found</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
            {locations.map(location => (
              <div 
                key={location.id} 
                className={`flex items-center justify-between p-3 rounded-md border ${
                  location.is_active 
                    ? 'bg-white/10 border-white/20' 
                    : 'bg-white/5 border-white/10 text-white/60'
                }`}
              >
                {editLocationId === location.id ? (
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={editLocationName}
                      onChange={(e) => setEditLocationName(e.target.value)}
                      className="w-full px-2 py-1 bg-white/20 border border-white/30 rounded text-white focus:outline-none focus:border-blue-500"
                      disabled={loading}
                    />
                  </div>
                ) : (
                  <span className={`flex-grow ${!location.is_active ? 'line-through' : ''}`}>
                    {location.name}
                  </span>
                )}
                
                <div className="flex items-center space-x-2">
                  {editLocationId === location.id ? (
                    <>
                      <button
                        onClick={() => updateLocation(location.id)}
                        disabled={loading}
                        className="text-green-400 hover:text-green-300 transition-colors"
                        aria-label="Save location"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={loading}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        aria-label="Cancel editing"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(location)}
                        disabled={loading}
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                        aria-label="Edit location"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleLocationStatus(location.id, location.is_active)}
                        disabled={loading}
                        className={`${
                          location.is_active 
                            ? 'text-red-400 hover:text-red-300' 
                            : 'text-green-400 hover:text-green-300'
                        } transition-colors`}
                        aria-label={location.is_active ? 'Deactivate location' : 'Activate location'}
                      >
                        {location.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Message display */}
      {message.text && (
        <div className={`mt-4 p-3 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-500/20 text-green-100 border border-green-400/30' 
            : 'bg-red-500/20 text-red-100 border border-red-400/30'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
} 