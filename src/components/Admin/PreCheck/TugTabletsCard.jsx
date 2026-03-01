import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function TugTabletsCard({ showForm: showFormProp, setShowForm: setShowFormProp }) {
  const [tablets, setTablets] = useState([]);
  const [tugs, setTugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [internalShowForm, setInternalShowForm] = useState(false);
  const [editingTablet, setEditingTablet] = useState(null);
  const [formData, setFormData] = useState({ tug_id: '', serial_number: '' });
  const [saving, setSaving] = useState(false);

  const isControlled = showFormProp !== undefined && setShowFormProp !== undefined;
  const showForm = isControlled ? showFormProp : internalShowForm;
  const setShowForm = isControlled ? setShowFormProp : setInternalShowForm;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tugsRes = await supabase
        .from('tugs')
        .select('id, tug_number, display_name, status, locations(id, name)')
        .order('tug_number');
      if (tugsRes.error) throw tugsRes.error;
      setTugs(tugsRes.data || []);

      const tabletsRes = await supabase
        .from('tug_tablets')
        .select('*, tugs(id, tug_number, display_name)')
        .order('serial_number');
      if (tabletsRes.error) {
        console.error('[TugTabletsCard] Tablets fetch error:', tabletsRes.error);
      } else {
        setTablets(tabletsRes.data || []);
      }
    } catch (err) {
      console.error('[TugTabletsCard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When form opens (e.g. from parent toolbar), set formData to first unassigned tug
  useEffect(() => {
    if (showForm && !editingTablet && tugs.length > 0 && tablets.length >= 0) {
      const unassigned = tugs.filter(
        (t) => t.status === 'active' && !tablets.some((tab) => tab.tug_id === t.id)
      );
      setFormData({ tug_id: unassigned[0]?.id || '', serial_number: '' });
    }
  }, [showForm, editingTablet, tugs, tablets]);

  const handleSave = async () => {
    if (!formData.tug_id || !formData.serial_number?.trim()) {
      alert('Tug and serial number are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tug_id: formData.tug_id,
        serial_number: formData.serial_number.trim(),
      };

      if (editingTablet) {
        const { error } = await supabase
          .from('tug_tablets')
          .update(payload)
          .eq('id', editingTablet.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tug_tablets')
          .insert(payload);
        if (error) throw error;
      }

      setShowForm(false);
      setEditingTablet(null);
      setFormData({ tug_id: '', serial_number: '' });
      fetchData();
    } catch (err) {
      console.error('[TugTabletsCard] Save error:', err);
      alert(`Error saving tablet: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tablet) => {
    if (!confirm(`Delete tablet ${tablet.serial_number}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('tug_tablets')
        .delete()
        .eq('id', tablet.id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('[TugTabletsCard] Delete error:', err);
      alert(`Error deleting tablet: ${err.message}`);
    }
  };

  const handleEdit = (tablet) => {
    setEditingTablet(tablet);
    setFormData({
      tug_id: tablet.tug_id,
      serial_number: tablet.serial_number || '',
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingTablet(null);
    setFormData({ tug_id: '', serial_number: '' });
  };

  // Tugs that don't have a tablet yet (or current tug when editing)
  // Only active tugs when adding; when editing, include current tug even if inactive
  const assignedTugIds = new Set(tablets.map((t) => t.tug_id));
  const availableTugs = tugs.filter((t) => {
    const isAssigned = assignedTugIds.has(t.id);
    const isCurrentEdit = editingTablet?.tug_id === t.id;
    if (isCurrentEdit) return true;
    return t.status === 'active' && !isAssigned;
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-8 bg-slate-200 rounded-xl w-48" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-slate-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showForm && (
        <div className="bg-white rounded-xl border-2 border-charcoal p-5 shadow-sm space-y-4">
          <h4 className="text-sm font-semibold text-charcoal">
            {editingTablet ? 'Edit Tablet' : 'Add New Tablet'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tug *</label>
              <select
                value={formData.tug_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, tug_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              >
                <option value="">-- Select tug --</option>
                {availableTugs.map((tug) => (
                  <option key={tug.id} value={tug.id}>
                    {[
                      tug.display_name ? `${tug.display_name} (${tug.tug_number})` : tug.tug_number,
                      tug.locations?.name,
                    ]
                      .filter(Boolean)
                      .join(' – ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number *</label>
              <input
                type="text"
                value={formData.serial_number}
                onChange={(e) => setFormData((prev) => ({ ...prev, serial_number: e.target.value }))}
                placeholder="e.g. TAB-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : editingTablet ? 'Update' : 'Add Tablet'}
            </button>
            <button
              onClick={cancelForm}
              className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {tablets.map((tablet) => (
          <div
            key={tablet.id}
            className="rounded-xl border border-red-200 bg-red-50/50 overflow-hidden shadow-sm"
          >
            <div className="px-4 py-3 grid grid-cols-4 sm:grid-cols-4 gap-2 sm:gap-3 items-center min-h-[52px]">
              <span className="text-sm font-semibold text-charcoal truncate">
                {tablet.serial_number}
              </span>
              <span className="text-xs text-gray-600 font-mono truncate">
                {tablet.tugs?.tug_number || '—'}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {tablet.tugs?.display_name || tablet.tugs?.tug_number || 'Unknown tug'}
              </span>
              <div className="flex items-center justify-end gap-0.5 flex-shrink-0">
                <button
                  onClick={() => handleEdit(tablet)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(tablet)}
                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tablets.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No tablets assigned</p>
          <p className="text-sm mt-1">Add a tablet to assign it to a tug.</p>
          <button
            onClick={() => {
              setEditingTablet(null);
              const unassigned = tugs.filter(
                (t) => t.status === 'active' && !tablets.some((tab) => tab.tug_id === t.id)
              );
              setFormData({ tug_id: unassigned[0]?.id || '', serial_number: '' });
              setShowForm(true);
            }}
            className="mt-3 h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Tablet
          </button>
        </div>
      )}
    </div>
  );
}
