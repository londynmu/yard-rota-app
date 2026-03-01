import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import TugTabletsCard from './TugTabletsCard';

export default function TugManager() {
  const [activeTab, setActiveTab] = useState('tugs');
  const [tugs, setTugs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTug, setEditingTug] = useState(null);
  const [formData, setFormData] = useState({ tug_number: '', display_name: '', location_id: '', status: 'active' });
  const [saving, setSaving] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'inactive', 'maintenance'
  const [showTabletForm, setShowTabletForm] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tugsRes, locationsRes] = await Promise.all([
        supabase.from('tugs').select('*, locations(id, name)').order('tug_number'),
        supabase.from('locations').select('*').eq('is_active', true).order('name'),
      ]);

      if (tugsRes.error) throw tugsRes.error;
      if (locationsRes.error) throw locationsRes.error;

      setTugs(tugsRes.data || []);
      setLocations(locationsRes.data || []);
    } catch (err) {
      console.error('[TugManager] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!formData.tug_number.trim()) {
      alert('Tug number is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tug_number: formData.tug_number.trim(),
        display_name: formData.display_name.trim() || null,
        location_id: formData.location_id || null,
        status: formData.status,
      };

      if (editingTug) {
        const { error } = await supabase
          .from('tugs')
          .update(payload)
          .eq('id', editingTug.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tugs')
          .insert(payload);
        if (error) throw error;
      }

      setShowForm(false);
      setEditingTug(null);
      setFormData({ tug_number: '', display_name: '', location_id: '', status: 'active' });
      fetchData();
    } catch (err) {
      console.error('[TugManager] Save error:', err);
      alert(`Error saving tug: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tug) => {
    if (!confirm(`Delete tug ${tug.tug_number}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tugs').delete().eq('id', tug.id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('[TugManager] Delete error:', err);
      alert(`Error deleting tug: ${err.message}`);
    }
  };

  const handleEdit = (tug) => {
    setEditingTug(tug);
    setFormData({
      tug_number: tug.tug_number,
      display_name: tug.display_name || '',
      location_id: tug.location_id || '',
      status: tug.status,
    });
    setShowForm(true);
  };

  const handleRegenerateQR = async (tug) => {
    if (!confirm(`Regenerate QR code for ${tug.tug_number}? The old QR will stop working.`)) return;
    try {
      // Generate new token client-side
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const { error } = await supabase
        .from('tugs')
        .update({ qr_token: newToken })
        .eq('id', tug.id);
      if (error) throw error;
      fetchData();
      setShowQR(null);
    } catch (err) {
      console.error('[TugManager] Regenerate error:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const downloadQR = (tug) => {
    const svg = document.getElementById(`qr-${tug.id}`);
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 400;
      canvas.height = 480;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 50, 30, 300, 300);
      
      // Add tug number text
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(tug.tug_number, 200, 380);
      
      ctx.font = '16px Arial';
      ctx.fillStyle = '#64748b';
      ctx.fillText(tug.locations?.name || '', 200, 410);
      ctx.fillText('Scan to start PreCheck', 200, 450);
      
      const link = document.createElement('a');
      link.download = `QR-${tug.tug_number}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printAllQRCodes = () => {
    const activeTugs = tugs.filter(t => t.status === 'active');
    const printWindow = window.open('', '_blank');
    
    const qrCards = activeTugs.map(tug => {
      const url = `${window.location.origin}/precheck/tug/${tug.qr_token}`;
      return `
        <div style="display:inline-block;width:280px;padding:20px;margin:10px;border:2px solid #e2e8f0;border-radius:12px;text-align:center;page-break-inside:avoid;">
          <div style="margin-bottom:10px;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&ecc=H" width="200" height="200" />
          </div>
          <div style="font-size:24px;font-weight:bold;color:#1e293b;">${tug.tug_number}</div>
          <div style="font-size:14px;color:#64748b;margin-top:4px;">${tug.locations?.name || ''}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Scan to start PreCheck</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html><head><title>Tug QR Codes</title>
      <style>@media print { body { margin: 0; } }</style>
      </head><body style="font-family:Arial,sans-serif;padding:20px;">
        <h1 style="text-align:center;color:#1e293b;">Tug QR Codes</h1>
        <div style="text-align:center;">${qrCards}</div>
      </body></html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const filteredTugs = filter === 'all' ? tugs : tugs.filter(t => t.status === filter);
  const statusColors = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-gray-100 text-gray-700',
    maintenance: 'bg-yellow-100 text-yellow-700',
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-10 bg-slate-200 rounded-xl w-48" />
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-200 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: fixed h-8 (32px) for all elements – same as VMU search bar height */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2 md:flex-nowrap md:h-8">
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:flex-1 md:min-w-0 md:h-8">
          <div className="flex bg-gray-100 rounded-lg p-0.5 h-8 flex-shrink-0">
            {[
              { id: 'tugs', label: 'Tugs' },
              { id: 'tablets', label: 'Tablets' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`h-7 px-3 text-xs font-medium rounded-md transition-all flex items-center ${
                  activeTab === tab.id
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'text-gray-500 hover:text-charcoal'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {activeTab === 'tugs' && (
          <div className="flex gap-2 flex-shrink-0 h-8">
            <button
              onClick={printAllQRCodes}
              className="h-8 px-4 text-xs font-medium bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print All QR
            </button>
            <button
              onClick={() => { setShowForm(true); setEditingTug(null); setFormData({ tug_number: '', display_name: '', location_id: '', status: 'active' }); }}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Tug
            </button>
          </div>
        )}
        {activeTab === 'tablets' && (
          <div className="flex gap-2 flex-shrink-0 h-8">
            <button
              onClick={() => setShowTabletForm(true)}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 border border-gray-200"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Tablet
            </button>
          </div>
        )}
      </div>

      {activeTab === 'tablets' ? (
        <TugTabletsCard showForm={showTabletForm} setShowForm={setShowTabletForm} />
      ) : (
        <div className="space-y-4 -mt-px">
      {/* Add New form (only when adding, not editing) */}
      {showForm && !editingTug && (
        <div className="bg-white rounded-xl border-2 border-charcoal p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-charcoal">Add New Tug</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tug Number *</label>
              <input
                type="text"
                value={formData.tug_number}
                onChange={(e) => setFormData(prev => ({ ...prev, tug_number: e.target.value }))}
                placeholder="e.g. 06925"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="e.g. 069 or TUG-A"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              />
              <p className="text-[10px] text-gray-400 mt-1">Short label shown on cards. Leave empty to auto-generate.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <select
                value={formData.location_id}
                onChange={(e) => setFormData(prev => ({ ...prev, location_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              >
                <option value="">-- No location --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Add Tug'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingTug(null); }}
              className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tugs list */}
      <div className="space-y-3">
        {filteredTugs.map(tug => (
          <div
            key={tug.id}
            className="rounded-xl border border-red-200 bg-red-50/50 overflow-hidden shadow-sm"
          >
            <div className="px-4 py-3 grid grid-cols-4 sm:grid-cols-4 gap-2 sm:gap-3 items-center min-h-[52px]">
              <span className="text-sm font-semibold text-charcoal truncate">
                {tug.display_name || tug.tug_number}
              </span>
              <span className="text-xs text-gray-600 font-mono truncate">
                {tug.display_name ? tug.tug_number : (tug.locations?.name || '—')}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize truncate ${statusColors[tug.status]}`}>
                  {tug.status}
                </span>
                {tug.display_name && tug.locations?.name && (
                  <span className="text-xs text-gray-500 truncate">{tug.locations.name}</span>
                )}
              </span>
              <div className="flex items-center justify-end gap-0.5 flex-shrink-0">
                <button
                  onClick={() => setShowQR(showQR === tug.id ? null : tug.id)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Show QR Code"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleEdit(tug)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(tug)}
                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* QR Code panel */}
            {showQR === tug.id && (
              <div className="border-t border-gray-100 p-4 bg-gray-50 text-center">
                <QRCodeSVG
                  id={`qr-${tug.id}`}
                  value={`${window.location.origin}/precheck/tug/${tug.qr_token}`}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
                <p className="text-xs text-gray-500 mt-2 font-mono break-all">
                  {window.location.origin}/precheck/tug/{tug.qr_token}
                </p>
                <div className="flex gap-2 justify-center mt-3">
                  <button
                    onClick={() => downloadQR(tug)}
                    className="h-8 px-4 text-xs font-medium bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Download PNG
                  </button>
                  <button
                    onClick={() => handleRegenerateQR(tug)}
                    className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Regenerate QR
                  </button>
                </div>
              </div>
            )}

            {/* Inline edit form */}
            {editingTug?.id === tug.id && (
              <div className="border-t border-charcoal/20 p-4 bg-slate-50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tug Number *</label>
                    <input
                      type="text"
                      value={formData.tug_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, tug_number: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={formData.display_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                      placeholder="e.g. 069"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                    <select
                      value={formData.location_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, location_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                    >
                      <option value="">-- No location --</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 px-4 text-xs font-semibold bg-white text-charcoal rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Update'}
                  </button>
                  <button
                    onClick={() => { setEditingTug(null); setShowForm(false); }}
                    className="h-8 px-4 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredTugs.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No tugs found</p>
          <p className="text-sm mt-1">
            {filter !== 'all' ? 'Try changing the filter.' : 'Add your first tug above.'}
          </p>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
