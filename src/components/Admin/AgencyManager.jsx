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
      {/* Add new agency – card same style as Tug Management "Add New Tug" */}
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add new agency
        </button>
      ) : (
        <div className="bg-white rounded-xl border-2 border-charcoal p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-charcoal">Add new agency</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-agency-name">Agency name *</label>
              <input
                type="text"
                id="new-agency-name"
                name="name"
                value={newAgency.name}
                onChange={handleInputChange}
                placeholder="Enter agency name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                disabled={loading}
                ref={newAgencyInputRef}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-agency-email">Email</label>
              <input
                type="email"
                id="new-agency-email"
                name="email"
                value={newAgency.email}
                onChange={handleInputChange}
                placeholder="Enter agency email"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-agency-contact">Contact person</label>
              <input
                type="text"
                id="new-agency-contact"
                name="contact_person"
                value={newAgency.contact_person}
                onChange={handleInputChange}
                placeholder="Enter contact person name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-agency-phone">Phone number</label>
              <input
                type="text"
                id="new-agency-phone"
                name="phone_number"
                value={newAgency.phone_number}
                onChange={handleInputChange}
                placeholder="Enter phone number"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                disabled={loading}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="new-agency-notes">Notes</label>
            <textarea
              id="new-agency-notes"
              name="notes"
              value={newAgency.notes}
              onChange={handleInputChange}
              placeholder="Enter additional notes"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-charcoal placeholder:text-gray-400 focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              disabled={loading}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddAgency}
              disabled={loading || !newAgency.name.trim()}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding…' : 'Add agency'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              disabled={loading}
              className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Agencies list – floating cards, same style as Tug Management */}
      <div className="space-y-3">
        {loading && agencies.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">Loading agencies…</div>
        ) : agencies.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="font-medium">No agencies found</p>
            <p className="text-sm mt-1">Add your first agency above.</p>
          </div>
        ) : (
          agencies.map((agency) => (
            <div
              key={agency.id}
              className={`rounded-xl border border-red-200 bg-red-50/50 overflow-hidden shadow-sm ${!agency.is_active ? 'opacity-60' : ''}`}
            >
              {editAgencyId === agency.id ? (
                <div className="p-4 bg-slate-50 space-y-3 border-t border-charcoal/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Agency name *</label>
                      <input
                        type="text"
                        name="name"
                        value={editAgencyData.name}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={editAgencyData.email}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Contact person</label>
                      <input
                        type="text"
                        name="contact_person"
                        value={editAgencyData.contact_person}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Phone number</label>
                      <input
                        type="text"
                        name="phone_number"
                        value={editAgencyData.phone_number}
                        onChange={handleEditInputChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={editAgencyData.notes}
                      onChange={handleEditInputChange}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                      disabled={loading}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateAgency(agency.id)}
                      disabled={loading}
                      className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={loading}
                      className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 flex flex-nowrap items-center gap-2 sm:grid sm:grid-cols-4 sm:gap-3 min-h-[52px]">
                    <span className="text-sm font-semibold text-charcoal truncate col-span-1">
                      {agency.name}
                    </span>
                    <span className="text-xs text-gray-600 truncate hidden sm:inline">
                      {agency.email || '—'}
                    </span>
                    <span className="text-xs text-gray-500 truncate hidden sm:inline">
                      {agency.contact_person || '—'}
                    </span>
                    <div className="flex items-center justify-end gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditing(agency)}
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
                        type="button"
                        onClick={() => confirmToggleAgencyStatus(agency.id, agency.name, agency.is_active)}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label={agency.is_active ? 'Deactivate' : 'Activate'}
                        title={agency.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {agency.is_active ? (
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
                        type="button"
                        onClick={() => confirmDeleteAgency(agency.id, agency.name)}
                        disabled={loading}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Delete"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {(agency.email || agency.contact_person || agency.phone_number || agency.notes) && (
                    <div className="px-4 pb-3 pt-0 border-t border-red-100/50 space-y-1">
                      {agency.email && (
                        <div className="text-xs text-gray-600"><span className="font-medium">Email:</span> {agency.email}</div>
                      )}
                      {agency.contact_person && (
                        <div className="text-xs text-gray-600"><span className="font-medium">Contact:</span> {agency.contact_person}</div>
                      )}
                      {agency.phone_number && (
                        <div className="text-xs text-gray-600"><span className="font-medium">Phone:</span> {agency.phone_number}</div>
                      )}
                      {agency.notes && (
                        <div className="text-xs text-gray-600 pt-1 border-t border-gray-200/50"><span className="font-medium">Notes:</span> {agency.notes}</div>
                      )}
                    </div>
                  )}
                </>
              )}
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