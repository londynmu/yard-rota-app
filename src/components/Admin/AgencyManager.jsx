import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function AgencyManager() {
  const [agencies, setAgencies] = useState([]);
  const [newAgency, setNewAgency] = useState({
    name: '',
    email: '',
    contact_person: '',
    phone_number: '',
    notes: ''
  });
  const [editAgencyId, setEditAgencyId] = useState(null);
  const [editAgencyData, setEditAgencyData] = useState({
    name: '',
    email: '',
    contact_person: '',
    phone_number: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const newAgencyInputRef = React.useRef(null);

  useEffect(() => {
    fetchAgencies();
  }, []);

  useEffect(() => {
    if (newAgencyInputRef.current && showAddForm) {
      newAgencyInputRef.current.focus();
    }
  }, [showAddForm]);

  const fetchAgencies = async () => {
    try {
      setLoading(true);
      console.log("Fetching agencies...");
      
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .order('name', { ascending: true });
        
      if (error) {
        console.error("Error fetching agencies:", error);
        throw error;
      }
      
      console.log("Agencies loaded:", data);
      setAgencies(data || []);
    } catch (error) {
      console.error('Error fetching agencies:', error);
      setMessage({ 
        text: 'Failed to load agencies: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewAgency({ ...newAgency, [name]: value });
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditAgencyData({ ...editAgencyData, [name]: value });
  };

  const handleAddAgency = async () => {
    if (!newAgency.name.trim()) {
      setMessage({ text: 'Agency name cannot be empty', type: 'error' });
      return;
    }

    try {
      console.log("Adding new agency:", newAgency);
      setLoading(true);
      
      const { error } = await supabase
        .from('agencies')
        .insert([{ 
          name: newAgency.name.trim(),
          email: newAgency.email.trim(),
          contact_person: newAgency.contact_person.trim(),
          phone_number: newAgency.phone_number.trim(),
          notes: newAgency.notes.trim()
        }]);
        
      if (error) {
        console.error("Error inserting agency:", error);
        throw error;
      }
      
      console.log("Agency added successfully");
      setNewAgency({ 
        name: '',
        email: '',
        contact_person: '',
        phone_number: '',
        notes: ''
      });
      setShowAddForm(false);
      await fetchAgencies();
      
      setMessage({ text: 'Agency added successfully', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Error adding agency:', error);
      
      if (error.code === '23505') {
        setMessage({ text: 'This agency name already exists', type: 'error' });
      } else {
        setMessage({ 
          text: 'Failed to add agency: ' + (error.message || 'Unknown error'), 
          type: 'error' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (agency) => {
    setEditAgencyId(agency.id);
    setEditAgencyData({
      name: agency.name,
      email: agency.email || '',
      contact_person: agency.contact_person || '',
      phone_number: agency.phone_number || '',
      notes: agency.notes || ''
    });
  };

  const cancelEditing = () => {
    setEditAgencyId(null);
    setEditAgencyData({
      name: '',
      email: '',
      contact_person: '',
      phone_number: '',
      notes: ''
    });
  };

  const updateAgency = async (id) => {
    if (!editAgencyData.name.trim()) {
      setMessage({ text: 'Agency name cannot be empty', type: 'error' });
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('agencies')
        .update({ 
          name: editAgencyData.name.trim(),
          email: editAgencyData.email.trim(),
          contact_person: editAgencyData.contact_person.trim(),
          phone_number: editAgencyData.phone_number.trim(),
          notes: editAgencyData.notes.trim()
        })
        .eq('id', id);
        
      if (error) throw error;
      
      setEditAgencyId(null);
      setEditAgencyData({
        name: '',
        email: '',
        contact_person: '',
        phone_number: '',
        notes: ''
      });
      await fetchAgencies();
      
      setMessage({ text: 'Agency updated successfully', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Error updating agency:', error);
      
      if (error.code === '23505') {
        setMessage({ text: 'This agency name already exists', type: 'error' });
      } else {
        setMessage({ 
          text: 'Failed to update agency: ' + (error.message || 'Unknown error'), 
          type: 'error' 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleAgencyStatus = async (id, currentStatus) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('agencies')
        .update({ is_active: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
      
      await fetchAgencies();
      
      setMessage({ 
        text: `Agency ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 
        type: 'success' 
      });
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Error toggling agency status:', error);
      setMessage({ 
        text: 'Failed to update agency status: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteAgency = async (id, name) => {
    if (!confirm(`Are you sure you want to permanently delete the agency "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('agencies')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      await fetchAgencies();
      
      setMessage({ 
        text: 'Agency deleted successfully', 
        type: 'success' 
      });
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      console.error('Error deleting agency:', error);
      setMessage({ 
        text: 'Failed to delete agency: ' + (error.message || 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">Agency Management</h3>
      
      {/* Add new agency button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mb-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors"
        >
          Add New Agency
        </button>
      )}
      
      {/* Add new agency form */}
      {showAddForm && (
        <div className="mb-6 p-4 border border-white/20 rounded-lg bg-white/5">
          <h4 className="text-md font-medium text-white mb-3">Add New Agency</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-white text-sm font-medium mb-1" htmlFor="new-agency-name">
                Agency Name*
              </label>
              <input
                type="text"
                id="new-agency-name"
                name="name"
                value={newAgency.name}
                onChange={handleInputChange}
                placeholder="Enter agency name"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                disabled={loading}
                ref={newAgencyInputRef}
                required
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1" htmlFor="new-agency-email">
                Email
              </label>
              <input
                type="email"
                id="new-agency-email"
                name="email"
                value={newAgency.email}
                onChange={handleInputChange}
                placeholder="Enter agency email"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1" htmlFor="new-agency-contact">
                Contact Person
              </label>
              <input
                type="text"
                id="new-agency-contact"
                name="contact_person"
                value={newAgency.contact_person}
                onChange={handleInputChange}
                placeholder="Enter contact person name"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1" htmlFor="new-agency-phone">
                Phone Number
              </label>
              <input
                type="text"
                id="new-agency-phone"
                name="phone_number"
                value={newAgency.phone_number}
                onChange={handleInputChange}
                placeholder="Enter phone number"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-white text-sm font-medium mb-1" htmlFor="new-agency-notes">
                Notes
              </label>
              <textarea
                id="new-agency-notes"
                name="notes"
                value={newAgency.notes}
                onChange={handleInputChange}
                placeholder="Enter additional notes"
                rows="3"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                disabled={loading}
              ></textarea>
            </div>
            
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={handleAddAgency}
                disabled={loading || !newAgency.name.trim()}
                className={`px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-white transition-colors ${
                  loading || !newAgency.name.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Adding...' : 'Add Agency'}
              </button>
              
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Agencies list */}
      <div className="mb-4">
        <h4 className="text-md font-medium text-white mb-2">Existing Agencies</h4>
        
        {loading && agencies.length === 0 ? (
          <div className="text-white text-center py-4">Loading agencies...</div>
        ) : agencies.length === 0 ? (
          <div className="text-white/70 text-center py-4">No agencies found</div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {agencies.map(agency => (
              <div 
                key={agency.id} 
                className={`p-3 rounded-md border ${
                  agency.is_active 
                    ? 'bg-white/10 border-white/20' 
                    : 'bg-white/5 border-white/10 text-white/60'
                }`}
              >
                {editAgencyId === agency.id ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-white text-sm font-medium mb-1">
                        Agency Name*
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={editAgencyData.name}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white text-sm font-medium mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={editAgencyData.email}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white text-sm font-medium mb-1">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        name="contact_person"
                        value={editAgencyData.contact_person}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white text-sm font-medium mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        name="phone_number"
                        value={editAgencyData.phone_number}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-white text-sm font-medium mb-1">
                        Notes
                      </label>
                      <textarea
                        name="notes"
                        value={editAgencyData.notes}
                        onChange={handleEditInputChange}
                        rows="3"
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      ></textarea>
                    </div>
                    
                    <div className="flex space-x-2 pt-2">
                      <button
                        onClick={() => updateAgency(agency.id)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-500/40 hover:bg-green-600/40 border border-green-400/30 rounded text-white transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={loading}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between">
                      <h5 className={`text-lg font-medium ${!agency.is_active ? 'line-through' : ''}`}>
                        {agency.name}
                      </h5>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditing(agency)}
                          disabled={loading}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          aria-label="Edit agency"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleAgencyStatus(agency.id, agency.is_active)}
                          disabled={loading}
                          className={`${
                            agency.is_active 
                              ? 'text-red-400 hover:text-red-300' 
                              : 'text-green-400 hover:text-green-300'
                          } transition-colors`}
                          aria-label={agency.is_active ? 'Deactivate agency' : 'Activate agency'}
                        >
                          {agency.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => deleteAgency(agency.id, agency.name)}
                          disabled={loading}
                          className="text-red-500 hover:text-red-400 transition-colors"
                          aria-label="Delete agency"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    
                    {agency.email && (
                      <div className="mt-1 text-sm">
                        <span className="text-white/70">Email:</span> {agency.email}
                      </div>
                    )}
                    
                    {agency.contact_person && (
                      <div className="mt-1 text-sm">
                        <span className="text-white/70">Contact:</span> {agency.contact_person}
                      </div>
                    )}
                    
                    {agency.phone_number && (
                      <div className="mt-1 text-sm">
                        <span className="text-white/70">Phone:</span> {agency.phone_number}
                      </div>
                    )}
                    
                    {agency.notes && (
                      <div className="mt-2 text-sm text-white/80 border-t border-white/10 pt-2">
                        {agency.notes}
                      </div>
                    )}
                  </div>
                )}
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