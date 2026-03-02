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
    confirmText: 'Yes',
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
      
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .order('name', { ascending: true });
        
      if (error) {
        console.error("Error fetching agencies:", error);
        throw error;
      }
      
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
    const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
    setConfirmDialog({
      visible: true,
      title: `${actionLabel} agency`,
      message: `Are you sure you want to ${action} "${name}"?`,
      agencyId: id,
      agencyName: name,
      action: () => toggleAgencyStatus(id, currentStatus),
      confirmText: actionLabel,
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
      title: 'Delete agency',
      message: `Are you sure you want to permanently delete the agency "${name}"? This action cannot be undone.`,
      agencyId: id,
      agencyName: name,
      action: () => deleteAgency(id),
      confirmText: 'Delete',
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
    <div className="space-y-4">
      {/* Add new agency */}
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-charcoal border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Add new agency
        </button>
      ) : (
        <div className="p-4 rounded-lg border-2 border-amber-200 bg-white">
          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-3">Add new agency</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="new-agency-name">Agency name *</label>
              <input
                type="text"
                id="new-agency-name"
                name="name"
                value={newAgency.name}
                onChange={handleInputChange}
                placeholder="Enter agency name"
                className="w-full px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                disabled={loading}
                ref={newAgencyInputRef}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="new-agency-email">Email</label>
              <input
                type="email"
                id="new-agency-email"
                name="email"
                value={newAgency.email}
                onChange={handleInputChange}
                placeholder="Enter agency email"
                className="w-full px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="new-agency-contact">Contact person</label>
              <input
                type="text"
                id="new-agency-contact"
                name="contact_person"
                value={newAgency.contact_person}
                onChange={handleInputChange}
                placeholder="Enter contact person name"
                className="w-full px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="new-agency-phone">Phone number</label>
              <input
                type="text"
                id="new-agency-phone"
                name="phone_number"
                value={newAgency.phone_number}
                onChange={handleInputChange}
                placeholder="Enter phone number"
                className="w-full px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1" htmlFor="new-agency-notes">Notes</label>
              <textarea
                id="new-agency-notes"
                name="notes"
                value={newAgency.notes}
                onChange={handleInputChange}
                placeholder="Enter additional notes"
                rows={3}
                className="w-full px-3 py-2 text-sm text-charcoal bg-white border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleAddAgency}
                disabled={loading || !newAgency.name.trim()}
                className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                  loading || !newAgency.name.trim() ? 'bg-white text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-charcoal border-gray-300 hover:bg-gray-50'
                }`}
              >
                {loading ? 'Adding…' : 'Add agency'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-charcoal border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agencies list */}
      <div>
        <h4 className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Existing agencies</h4>
        {loading && agencies.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">Loading agencies…</div>
        ) : agencies.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">No agencies found</div>
        ) : (
          <div className="space-y-2">
            {agencies.map((agency, index) => {
              const bgColors = [
                'bg-white border-amber-200',
                'bg-white border-blue-200',
                'bg-white border-emerald-200',
                'bg-white border-purple-200',
              ];
              const cardStyle = bgColors[index % bgColors.length];
              return (
                <div
                  key={agency.id}
                  className={`p-3 rounded-lg border ${cardStyle} ${!agency.is_active ? 'opacity-60' : ''}`}
                >
                  {editAgencyId === agency.id ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-semibold text-charcoal mb-1">Agency name *</label>
                        <input
                          type="text"
                          name="name"
                          value={editAgencyData.name}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-charcoal mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={editAgencyData.email}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-charcoal mb-1">Contact person</label>
                        <input
                          type="text"
                          name="contact_person"
                          value={editAgencyData.contact_person}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-charcoal mb-1">Phone number</label>
                        <input
                          type="text"
                          name="phone_number"
                          value={editAgencyData.phone_number}
                          onChange={handleEditInputChange}
                          className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                          disabled={loading}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-charcoal mb-1">Notes</label>
                        <textarea
                          name="notes"
                          value={editAgencyData.notes}
                          onChange={handleEditInputChange}
                          rows={3}
                          className="w-full px-3 py-1.5 text-sm text-charcoal bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-charcoal focus:border-charcoal"
                          disabled={loading}
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => updateAgency(agency.id)}
                          disabled={loading}
                          className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-white text-charcoal border border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={loading}
                          className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-white text-charcoal border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <h5 className={`text-sm font-semibold text-charcoal ${!agency.is_active ? 'line-through text-gray-500' : ''}`}>
                          {agency.name}
                        </h5>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditing(agency)}
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
                            type="button"
                            onClick={() => confirmToggleAgencyStatus(agency.id, agency.name, agency.is_active)}
                            disabled={loading}
                            className={`${
                              agency.is_active ? 'text-red-600 hover:text-red-700 hover:bg-red-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                            } transition-colors p-1.5 rounded`}
                            aria-label={agency.is_active ? 'Deactivate' : 'Activate'}
                            title={agency.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {agency.is_active ? (
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
                            type="button"
                            onClick={() => confirmDeleteAgency(agency.id, agency.name)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors p-1.5 rounded"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {agency.email && (
                        <div className="mt-1 text-sm text-charcoal">
                          <span className="font-medium">Email:</span> {agency.email}
                        </div>
                      )}
                      {agency.contact_person && (
                        <div className="mt-1 text-sm text-charcoal">
                          <span className="font-medium">Contact:</span> {agency.contact_person}
                        </div>
                      )}
                      {agency.phone_number && (
                        <div className="mt-1 text-sm text-charcoal">
                          <span className="font-medium">Phone:</span> {agency.phone_number}
                        </div>
                      )}
                      {agency.notes && (
                        <div className="mt-2 text-sm text-charcoal border-t border-gray-200 pt-2">
                          {agency.notes}
                        </div>
                      )}
                    </div>
                  )}
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