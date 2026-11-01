import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function CheckItemManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('form-options'); // 'form-options' | 'checks'
  const [preShiftRemarksEnabled, setPreShiftRemarksEnabled] = useState(true);
  const [duringShiftDamageEnabled, setDuringShiftDamageEnabled] = useState(true);
  const [defectResolveConfirmationsRequired, setDefectResolveConfirmationsRequired] = useState(1);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ label: '', tooltip: '', category: 'outside' });
  const [adding, setAdding] = useState(null); // 'outside' | 'inside' | null
  const [addForm, setAddForm] = useState({ item_key: '', label: '', tooltip: '', category: 'outside' });
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('precheck_check_items')
        .select('*')
        .order('category')
        .order('sort_order');
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('[CheckItemManager] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    const fetchSettings = async () => {
      setSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['pre_shift_remarks_enabled', 'during_shift_damage_report_enabled', 'defect_resolve_confirmations_required']);
        if (error) throw error;

        const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
        setPreShiftRemarksEnabled(map.pre_shift_remarks_enabled !== 'false');
        setDuringShiftDamageEnabled(map.during_shift_damage_report_enabled !== 'false');
        const n = parseInt(map.defect_resolve_confirmations_required, 10);
        setDefectResolveConfirmationsRequired(Number.isFinite(n) && n >= 1 ? n : 1);
      } catch (err) {
        console.error('[CheckItemManager] Settings fetch error:', err);
        setPreShiftRemarksEnabled(true);
        setDuringShiftDamageEnabled(true);
        setDefectResolveConfirmationsRequired(1);
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const outsideItems = items
    .filter(i => i.category === 'outside')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const insideItems = items
    .filter(i => i.category === 'inside')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const saveSetting = async (key, enabled, rollback) => {
    setSettingsSaving(true);
    try {
      const descriptions = {
        pre_shift_remarks_enabled: 'Show remarks block in pre-shift precheck form',
        during_shift_damage_report_enabled: 'Enable during-shift damage reporting flow',
      };
      const { error } = await supabase
        .from('settings')
        .upsert({
          key,
          value: enabled ? 'true' : 'false',
          description: descriptions[key],
        }, { onConflict: 'key' });
      if (error) throw error;
    } catch (err) {
      console.error('[CheckItemManager] Toggle setting error:', err);
      rollback();
      alert('Error saving form option.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const togglePreShiftRemarks = async () => {
    if (settingsLoading || settingsSaving) return;
    const nextValue = !preShiftRemarksEnabled;
    setPreShiftRemarksEnabled(nextValue);
    await saveSetting('pre_shift_remarks_enabled', nextValue, () => setPreShiftRemarksEnabled(!nextValue));
  };

  const toggleDuringShiftDamage = async () => {
    if (settingsLoading || settingsSaving) return;
    const nextValue = !duringShiftDamageEnabled;
    setDuringShiftDamageEnabled(nextValue);
    await saveSetting('during_shift_damage_report_enabled', nextValue, () => setDuringShiftDamageEnabled(!nextValue));
  };

  const saveDefectResolveConfirmations = async (value) => {
    const num = Math.max(1, Math.min(99, Math.floor(Number(value)) || 1));
    if (settingsLoading || settingsSaving) return;
    setSettingsSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'defect_resolve_confirmations_required',
          value: String(num),
          description: 'Number of shunter "Fixed?" confirmations (on submit) required before a defect is marked resolved. VMU/admin resolve immediately.',
        }, { onConflict: 'key' });
      if (error) throw error;
      setDefectResolveConfirmationsRequired(num);
    } catch (err) {
      console.error('[CheckItemManager] Save defect resolve confirmations error:', err);
      alert('Error saving setting.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ─── Edit ───
  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ label: item.label, tooltip: item.tooltip || '', category: item.category });
    setAdding(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ label: '', tooltip: '', category: 'outside' });
  };

  const saveEdit = async () => {
    if (!editForm.label.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('precheck_check_items')
        .update({ label: editForm.label.trim(), tooltip: editForm.tooltip.trim() || null })
        .eq('id', editingId);
      if (error) throw error;
      cancelEdit();
      fetchItems();
    } catch (err) {
      console.error('[CheckItemManager] Save error:', err);
      alert('Error saving item.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Add ───
  const startAdd = (category) => {
    setAdding(category);
    setAddForm({ item_key: '', label: '', tooltip: '', category });
    setEditingId(null);
  };

  const cancelAdd = () => {
    setAdding(null);
    setAddForm({ item_key: '', label: '', tooltip: '', category: 'outside' });
  };

  const saveAdd = async () => {
    if (!addForm.item_key.trim() || !addForm.label.trim()) {
      alert('Key and Label are required.');
      return;
    }
    setSaving(true);
    try {
      const categoryItems = items.filter(i => i.category === addForm.category);
      const maxOrder = categoryItems.length > 0
        ? Math.max(...categoryItems.map(i => i.sort_order))
        : 0;

      const { error } = await supabase
        .from('precheck_check_items')
        .insert({
          item_key: addForm.item_key.trim().toLowerCase().replace(/\s+/g, '_'),
          label: addForm.label.trim(),
          tooltip: addForm.tooltip.trim() || null,
          category: addForm.category,
          sort_order: maxOrder + 1,
        });
      if (error) throw error;
      cancelAdd();
      fetchItems();
    } catch (err) {
      console.error('[CheckItemManager] Add error:', err);
      if (err.message?.includes('duplicate')) {
        alert('An item with this key already exists.');
      } else {
        alert('Error adding item.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle active (optimistic local update) ───
  const toggleActive = async (item) => {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
    try {
      const { error } = await supabase
        .from('precheck_check_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
    } catch (err) {
      console.error('[CheckItemManager] Toggle error:', err);
      // Revert on error
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: item.is_active } : i));
    }
  };

  // ─── Reorder (optimistic local update) ───
  const moveItem = async (item, direction) => {
    const categoryItems = items
      .filter(i => i.category === item.category)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = categoryItems.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categoryItems.length) return;

    const current = categoryItems[idx];
    const swap = categoryItems[swapIdx];

    // Optimistic update
    setItems(prev => prev.map(i => {
      if (i.id === current.id) return { ...i, sort_order: swap.sort_order };
      if (i.id === swap.id) return { ...i, sort_order: current.sort_order };
      return i;
    }));

    try {
      await Promise.all([
        supabase.from('precheck_check_items').update({ sort_order: swap.sort_order }).eq('id', current.id),
        supabase.from('precheck_check_items').update({ sort_order: current.sort_order }).eq('id', swap.id),
      ]);
    } catch (err) {
      console.error('[CheckItemManager] Reorder error:', err);
      fetchItems(); // Revert by refetching on error
    }
  };

  // ─── Delete ───
  const deleteItem = async (item) => {
    if (!confirm(`Delete "${item.label}"? This cannot be undone. Existing reports using this item will keep their data.`)) return;
    try {
      const { error } = await supabase
        .from('precheck_check_items')
        .delete()
        .eq('id', item.id);
      if (error) throw error;
      fetchItems();
    } catch (err) {
      console.error('[CheckItemManager] Delete error:', err);
      alert('Error deleting item.');
    }
  };

  // ─── Render item row (as card, same style as PreChecks/Tugs) ───
  const renderItemRow = (item, idx, listLength) => {
    const isEditing = editingId === item.id;

    if (isEditing) {
      return (
        <div
          key={item.id}
          className="admin-section-card"
        >
          <div className="admin-section-body space-y-3">
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Label</label>
                <textarea
                  rows={1}
                  value={editForm.label}
                  onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
                  onInput={(e) => {
                    const t = e.target;
                    t.style.height = 'auto';
                    t.style.height = t.scrollHeight + 'px';
                  }}
                  ref={(el) => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                  }}
                  className="admin-input resize-none overflow-hidden min-h-[2.25rem]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tooltip</label>
                <textarea
                  rows={1}
                  value={editForm.tooltip}
                  onChange={(e) => setEditForm(prev => ({ ...prev, tooltip: e.target.value }))}
                  onInput={(e) => {
                    const t = e.target;
                    t.style.height = 'auto';
                    t.style.height = t.scrollHeight + 'px';
                  }}
                  ref={(el) => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                  }}
                  placeholder="Description shown to user..."
                  className="admin-input resize-none overflow-hidden min-h-[2.25rem]"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => deleteItem(item)}
                className="admin-btn-danger"
              >
                Delete
              </button>
              <button type="button" onClick={cancelEdit} className="admin-btn-muted">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="admin-btn"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={`admin-section-card transition-all min-h-[52px] ${
          item.is_active ? '' : 'opacity-60'
        }`}
      >
        <div className="px-4 py-3 flex items-center gap-2">
          {/* Left: reorder arrows */}
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => moveItem(item, 'up')}
              disabled={idx === 0}
              className="text-gray-400 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => moveItem(item, 'down')}
              disabled={idx === listLength - 1}
              className="text-gray-400 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Name only (closed card) */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-charcoal truncate block">{item.label}</span>
          </div>

          {/* Active toggle */}
          <button
            type="button"
            onClick={() => toggleActive(item)}
            className={`w-8 h-5 rounded-full relative transition-colors flex-shrink-0 ${
              item.is_active ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={item.is_active ? 'Active - click to deactivate' : 'Inactive - click to activate'}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
              item.is_active ? 'left-3.5' : 'left-0.5'
            }`} />
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => startEdit(item)}
            className="admin-icon-btn"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // ─── Render add form (card style) ───
  const renderAddForm = (category) => {
    if (adding !== category) {
      return (
        <button
          type="button"
          onClick={() => startAdd(category)}
          className="w-full min-h-[52px] py-3 text-xs text-gray-400 hover:text-charcoal border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors flex items-center justify-center"
        >
          + Add item
        </button>
      );
    }

    return (
      <div className="admin-section-card">
        <div className="admin-section-body space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Key (unique)</label>
              <input
                type="text"
                value={addForm.item_key}
                onChange={(e) => setAddForm(prev => ({ ...prev, item_key: e.target.value }))}
                placeholder="e.g. horn"
                className="admin-input font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Label</label>
              <input
                type="text"
                value={addForm.label}
                onChange={(e) => setAddForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g. Horn"
                className="admin-input"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tooltip</label>
              <input
                type="text"
                value={addForm.tooltip}
                onChange={(e) => setAddForm(prev => ({ ...prev, tooltip: e.target.value }))}
                placeholder="Check horn works..."
                className="admin-input"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelAdd} className="admin-btn-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAdd}
              disabled={saving}
              className="admin-btn"
            >
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Render section (no container – floating cards) ───
  const renderSection = (title, categoryItems, category) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
        <span className="text-xs text-gray-500">
          {categoryItems.filter(i => i.is_active).length} active / {categoryItems.length} total
        </span>
      </div>
      <div className="space-y-2">
        {categoryItems.map((item, idx) => renderItemRow(item, idx, categoryItems.length))}
        {renderAddForm(category)}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded-xl w-48" />
        <div className="h-64 bg-slate-200 rounded-xl" />
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar – same as Tug Management / Settings */}
      <div className="flex flex-row flex-nowrap items-center justify-between gap-1 md:gap-2 md:h-8 overflow-x-auto min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0 md:flex-1 md:min-w-0 md:h-8">
          <div className="admin-seg-track flex-shrink-0">
            {[
              { id: 'form-options', label: 'Form options' },
              { id: 'checks', label: 'Checks' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`admin-seg-item ${
                  activeTab === tab.id ? 'admin-seg-item-active' : ''
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content – floating cards, no wrapper */}
      <div className="space-y-4 -mt-px">
        {activeTab === 'form-options' && (
          <div className="space-y-3">
            <div className="admin-section-card flex items-center justify-between min-h-[52px] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-charcoal">Pre-Shift remarks block</p>
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">Shows/hides the Remarks section in Pre-Shift form.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold hidden sm:inline ${preShiftRemarksEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {preShiftRemarksEnabled ? 'ON' : 'OFF'}
                </span>
                <button
                  type="button"
                  onClick={togglePreShiftRemarks}
                  disabled={settingsLoading || settingsSaving}
                  className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                    preShiftRemarksEnabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${(settingsLoading || settingsSaving) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  title={preShiftRemarksEnabled ? 'Pre-Shift remarks enabled - click to disable' : 'Pre-Shift remarks disabled - click to enable'}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    preShiftRemarksEnabled ? 'left-4.5' : 'left-0.5'
                  }`} />
                </button>
              </div>
            </div>
            <div className="admin-section-card flex items-center justify-between min-h-[52px] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-charcoal">During Shift damage report</p>
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">Shows/hides Report Damage flow in During Shift.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-semibold hidden sm:inline ${duringShiftDamageEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {duringShiftDamageEnabled ? 'ON' : 'OFF'}
                </span>
                <button
                  type="button"
                  onClick={toggleDuringShiftDamage}
                  disabled={settingsLoading || settingsSaving}
                  className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
                    duringShiftDamageEnabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${(settingsLoading || settingsSaving) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  title={duringShiftDamageEnabled ? 'During Shift reporting enabled - click to disable' : 'During Shift reporting disabled - click to enable'}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    duringShiftDamageEnabled ? 'left-4.5' : 'left-0.5'
                  }`} />
                </button>
              </div>
            </div>
            <div className="admin-section-card flex items-center justify-between min-h-[52px] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-charcoal">Defect resolve confirmations</p>
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">Shunter must mark defect as &quot;Fixed?&quot; this many times (on submit) before it is marked resolved. VMU/admin resolve immediately.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={defectResolveConfirmationsRequired}
                  onChange={(e) => setDefectResolveConfirmationsRequired(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                  onBlur={(e) => {
                    const v = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1));
                    setDefectResolveConfirmationsRequired(v);
                    saveDefectResolveConfirmations(v);
                  }}
                  disabled={settingsLoading || settingsSaving}
                  className="admin-input w-14 text-center"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'checks' && (
          <div className="space-y-6">
            {renderSection('Outside Check', outsideItems, 'outside')}
            {renderSection('Inside Check', insideItems, 'inside')}
          </div>
        )}
      </div>
    </div>
  );
}
