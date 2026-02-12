import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function CheckItemManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const outsideItems = items
    .filter(i => i.category === 'outside')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const insideItems = items
    .filter(i => i.category === 'inside')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

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

  // ─── Toggle allow_na (optimistic local update) ───
  const toggleAllowNa = async (item) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, allow_na: !i.allow_na } : i));
    try {
      const { error } = await supabase
        .from('precheck_check_items')
        .update({ allow_na: !item.allow_na })
        .eq('id', item.id);
      if (error) throw error;
    } catch (err) {
      console.error('[CheckItemManager] Toggle N/A error:', err);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, allow_na: item.allow_na } : i));
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

  // ─── Render item row ───
  const renderItemRow = (item, idx, listLength) => {
    const isEditing = editingId === item.id;

    if (isEditing) {
      return (
        <div key={item.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Label</label>
              <input
                type="text"
                value={editForm.label}
                onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tooltip</label>
              <input
                type="text"
                value={editForm.tooltip}
                onChange={(e) => setEditForm(prev => ({ ...prev, tooltip: e.target.value }))}
                placeholder="Description shown to user..."
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelEdit} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={saving}
              className="px-3 py-1 text-xs font-medium bg-charcoal text-white rounded-lg hover:bg-black disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
          item.is_active
            ? 'bg-white border-gray-200'
            : 'bg-gray-50 border-gray-100 opacity-60'
        }`}
      >
        {/* Reorder arrows */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => moveItem(item, 'up')}
            disabled={idx === 0}
            className="text-gray-400 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => moveItem(item, 'down')}
            disabled={idx === listLength - 1}
            className="text-gray-400 hover:text-charcoal disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-charcoal">{item.label}</span>
            <span className="text-[10px] text-gray-400 font-mono">{item.item_key}</span>
          </div>
          {item.tooltip && (
            <p className="text-[11px] text-gray-400 truncate">{item.tooltip}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* N/A toggle */}
          <button
            type="button"
            onClick={() => toggleAllowNa(item)}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              item.allow_na ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
            title={item.allow_na ? 'N/A allowed - click to disallow' : 'N/A not allowed - click to allow'}
          >
            N/A
          </button>

          {/* Active toggle */}
          <button
            type="button"
            onClick={() => toggleActive(item)}
            className={`w-8 h-5 rounded-full relative transition-colors ${
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
            className="p-1 text-gray-400 hover:text-charcoal"
            title="Edit"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => deleteItem(item)}
            className="p-1 text-gray-400 hover:text-red-600"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  // ─── Render add form ───
  const renderAddForm = (category) => {
    if (adding !== category) {
      return (
        <button
          type="button"
          onClick={() => startAdd(category)}
          className="w-full py-2 text-xs text-gray-400 hover:text-charcoal border border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
        >
          + Add item
        </button>
      );
    }

    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Key (unique)</label>
            <input
              type="text"
              value={addForm.item_key}
              onChange={(e) => setAddForm(prev => ({ ...prev, item_key: e.target.value }))}
              placeholder="e.g. horn"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Label</label>
            <input
              type="text"
              value={addForm.label}
              onChange={(e) => setAddForm(prev => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. Horn"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Tooltip</label>
            <input
              type="text"
              value={addForm.tooltip}
              onChange={(e) => setAddForm(prev => ({ ...prev, tooltip: e.target.value }))}
              placeholder="Check horn works..."
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={cancelAdd} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={saveAdd}
            disabled={saving}
            className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </div>
    );
  };

  // ─── Render section ───
  const renderSection = (title, categoryItems, category) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
          <span className="text-xs text-gray-400">
            {categoryItems.filter(i => i.is_active).length} active / {categoryItems.length} total
          </span>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        {categoryItems.map((item, idx) => renderItemRow(item, idx, categoryItems.length))}
        {renderAddForm(category)}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-64 bg-slate-200 rounded-xl" />
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Manage the checklist items shown during Pre-Shift checks. Edit labels, add tooltips, reorder, or deactivate items.
      </p>
      {renderSection('Outside Check', outsideItems, 'outside')}
      {renderSection('Inside Check', insideItems, 'inside')}
    </div>
  );
}
