import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/ToastContext';

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
  const [showAddForm, setShowAddForm] = useState(false);
  const newAgencyInputRef = React.useRef(null);
  const toast = useToast();
  const [confirmDialog, setConfirmDialog] = useState({ 
    visible: false, 
    title: '',
    message: '',
    agencyId: null,
    agencyName: '',
    action: null,
    isDestructive: false
  });

  useEffect(() => {
    fetchAgencies();
  }, []);

  useEffect(() => {
    if (newAgencyInputRef.current && showAddForm) {
      newAgencyInputRef.current.focus();
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
      showNotification('Failed to load agencies: ' + (error.message || 'Unknown error'), 'error');
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
      showNotification('Agency name cannot be empty', 'error');
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
      
      showNotification('Agency added successfully');
    } catch (error) {
      console.error('Error adding agency:', error);
      
      if (error.code === '23505') {
        showNotification('This agency name already exists', 'error');
      } else {
        showNotification('Failed to add agency: ' + (error.message || 'Unknown error'), 'error');
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
      showNotification('Agency name cannot be empty', 'error');
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
      
      showNotification('Agency updated successfully');
    } catch (error) {
      console.error('Error updating agency:', error);
      
      if (error.code === '23505') {
        showNotification('This agency name already exists', 'error');
      } else {
        showNotification('Failed to update agency: ' + (error.message || 'Unknown error'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmToggleAgencyStatus = (id, name, currentStatus) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    setConfirmDialog({
      visible: true,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} Agency`,
      message: `Are you sure you want to ${action} "${name}"?`,
      agencyId: id,
      agencyName: name,
      action: () => toggleAgencyStatus(id, currentStatus),
      isDestructive: false
    });
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
      
      showNotification(`Agency ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
    } catch (error) {
      console.error('Error toggling agency status:', error);
      showNotification('Failed to update agency status: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAgency = (id, name) => {
    setConfirmDialog({
      visible: true,
      title: "Delete Agency",
      message: `Are you sure you want to permanently delete the agency "${name}"? This action cannot be undone.`,
      agencyId: id,
      agencyName: name,
      action: () => deleteAgency(id),
      isDestructive: true
    });
  };

  const deleteAgency = async (id) => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('agencies')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      await fetchAgencies();
      
      showNotification('Agency deleted successfully');
    } catch (error) {
      console.error('Error deleting agency:', error);
      showNotification('Failed to delete agency: ' + (error.message || 'Unknown error'), 'error');
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
    <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
      <h3 className="text-lg font-semibold text-charcoal mb-4">Agency Management</h3>
      
      {/* Add new agency button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="mb-4 px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-charcoal transition-colors"
        >
          Add New Agency
        </button>
      )}
      
      {/* Add new agency form */}
      {showAddForm && (
        <div className="mb-6 p-4 border border-white/20 rounded-lg bg-white/5">
          <h4 className="text-md font-medium text-charcoal mb-3">Add New Agency</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-charcoal text-sm font-medium mb-1" htmlFor="new-agency-name">
                Agency Name*
              </label>
              <input
                type="text"
                id="new-agency-name"
                name="name"
                value={newAgency.name}
                onChange={handleInputChange}
                placeholder="Enter agency name"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                disabled={loading}
                ref={newAgencyInputRef}
                required
              />
            </div>
            
            <div>
              <label className="block text-charcoal text-sm font-medium mb-1" htmlFor="new-agency-email">
                Email
              </label>
              <input
                type="email"
                id="new-agency-email"
                name="email"
                value={newAgency.email}
                onChange={handleInputChange}
                placeholder="Enter agency email"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-charcoal text-sm font-medium mb-1" htmlFor="new-agency-contact">
                Contact Person
              </label>
              <input
                type="text"
                id="new-agency-contact"
                name="contact_person"
                value={newAgency.contact_person}
                onChange={handleInputChange}
                placeholder="Enter contact person name"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-charcoal text-sm font-medium mb-1" htmlFor="new-agency-phone">
                Phone Number
              </label>
              <input
                type="text"
                id="new-agency-phone"
                name="phone_number"
                value={newAgency.phone_number}
                onChange={handleInputChange}
                placeholder="Enter phone number"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>
            
            <div>
              <label className="block text-charcoal text-sm font-medium mb-1" htmlFor="new-agency-notes">
                Notes
              </label>
              <textarea
                id="new-agency-notes"
                name="notes"
                value={newAgency.notes}
                onChange={handleInputChange}
                placeholder="Enter additional notes"
                rows="3"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                disabled={loading}
              ></textarea>
            </div>
            
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={handleAddAgency}
                disabled={loading || !newAgency.name.trim()}
                className={`px-4 py-2 bg-blue-500/60 hover:bg-blue-600/60 border border-blue-400/30 rounded-lg text-charcoal transition-colors ${
                  loading || !newAgency.name.trim() ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Adding...' : 'Add Agency'}
              </button>
              
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={loading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-charcoal transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Agencies list */}
      <div className="mb-4">
        <h4 className="text-md font-medium text-charcoal mb-2">Existing Agencies</h4>
        
        {loading && agencies.length === 0 ? (
          <div className="text-charcoal text-center py-4">Loading agencies...</div>
        ) : agencies.length === 0 ? (
          <div className="text-charcoal/70 text-center py-4">No agencies found</div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {agencies.map(agency => (
              <div 
                key={agency.id} 
                className={`p-3 rounded-md border ${
                  agency.is_active 
                    ? 'bg-white border-gray-200' 
                    : 'bg-white/5 border-white/10 text-charcoal/60'
                }`}
              >
                {editAgencyId === agency.id ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-charcoal text-sm font-medium mb-1">
                        Agency Name*
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={editAgencyData.name}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-charcoal text-sm font-medium mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={editAgencyData.email}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-charcoal text-sm font-medium mb-1">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        name="contact_person"
                        value={editAgencyData.contact_person}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-charcoal text-sm font-medium mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        name="phone_number"
                        value={editAgencyData.phone_number}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-charcoal text-sm font-medium mb-1">
                        Notes
                      </label>
                      <textarea
                        name="notes"
                        value={editAgencyData.notes}
                        onChange={handleEditInputChange}
                        rows="3"
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-charcoal focus:outline-none focus:border-blue-500"
                        disabled={loading}
                      ></textarea>
                    </div>
                    
                    <div className="flex space-x-2 pt-2">
                      <button
                        onClick={() => updateAgency(agency.id)}
                        disabled={loading}
                        className="px-3 py-1 bg-green-500/40 hover:bg-green-600/40 border border-green-400/30 rounded text-charcoal transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={loading}
                        className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-charcoal transition-colors"
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
                          className="text-blue-400 hover:text-blue-300 transition-colors p-2"
                          aria-label="Edit agency"
                          title="Edit agency"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span className="sr-only">Edit</span>
                        </button>
                        <button
                          onClick={() => confirmToggleAgencyStatus(agency.id, agency.name, agency.is_active)}
                          disabled={loading}
                          className={`${
                            agency.is_active 
                              ? 'text-red-400 hover:text-red-300' 
                              : 'text-green-400 hover:text-green-300'
                          } transition-colors p-2`}
                          aria-label={agency.is_active ? 'Deactivate agency' : 'Activate agency'}
                          title={agency.is_active ? 'Deactivate agency' : 'Activate agency'}
                        >
                          {agency.is_active ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <span className="sr-only">{agency.is_active ? 'Deactivate' : 'Activate'}</span>
                        </button>
                        <button
                          onClick={() => confirmDeleteAgency(agency.id, agency.name)}
                          disabled={loading}
                          className="text-red-500 hover:text-red-400 transition-colors p-2"
                          aria-label="Delete agency"
                          title="Delete agency"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span className="sr-only">Delete</span>
                        </button>
                      </div>
                    </div>
                    
                    {agency.email && (
                      <div className="mt-1 text-sm">
                        <span className="text-charcoal/70">Email:</span> {agency.email}
                      </div>
                    )}
                    
                    {agency.contact_person && (
                      <div className="mt-1 text-sm">
                        <span className="text-charcoal/70">Contact:</span> {agency.contact_person}
                      </div>
                    )}
                    
                    {agency.phone_number && (
                      <div className="mt-1 text-sm">
                        <span className="text-charcoal/70">Phone:</span> {agency.phone_number}
                      </div>
                    )}
                    
                    {agency.notes && (
                      <div className="mt-2 text-sm text-charcoal/80 border-t border-white/10 pt-2">
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