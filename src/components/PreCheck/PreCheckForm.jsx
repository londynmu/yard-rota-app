import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import CheckItemRow from './CheckItemRow';
import ImageUpload from './ImageUpload';
import { FORM_STATE_KEY } from '../../pages/PreCheckPage';
import useNetworkStatus from '../../lib/useNetworkStatus';
import {
  mapImagesToQueueEntries,
  queuePrecheckSubmission,
  submitPrecheckPayload,
} from '../../lib/precheckQueue';
import { isLikelyNetworkError } from '../../lib/uploadRetry';

// #region agent log scroll2
const _dbgScroll2 = (loc, msg, data) => {
  fetch('http://127.0.0.1:7242/ingest/3b8e496a-f18c-4030-a7e4-db065781ad49', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: loc,
      message: msg,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  try {
    const prev = JSON.parse(localStorage.getItem('_dbg_log_scroll2') || '[]');
    prev.push(`${new Date().toLocaleTimeString()} [${loc}] ${msg} ${JSON.stringify(data)}`);
    if (prev.length > 40) prev.shift();
    localStorage.setItem('_dbg_log_scroll2', JSON.stringify(prev));
  } catch { /* ignore */ }
};
// #endregion

// ─── Hardcoded fallback (used if DB fetch fails) ───
const FALLBACK_OUTSIDE = [
  { key: 'tyres', label: 'Tyres', tooltip: null },
  { key: 'mud_flaps', label: 'Mud Flaps', tooltip: null },
  { key: 'head_lights', label: 'Head Lights', tooltip: null },
  { key: 'signal_lights', label: 'Signal Lights', tooltip: null },
  { key: 'brake_lights', label: 'Brake Lights', tooltip: null },
  { key: 'strobe_lights', label: 'Beacon Lights', tooltip: null },
  { key: 'mirrors', label: 'Mirrors', tooltip: null },
  { key: 'doors', label: 'Doors', tooltip: null },
  { key: 'windows', label: 'Windows', tooltip: null },
  { key: 'step_handles_platforms', label: 'Steps/Platforms', tooltip: null },
  { key: 'fifth_wheel_operation', label: '5th Wheel Operation', tooltip: null },
  { key: 'trailer_air_lines', label: 'Electric / Air Lines', tooltip: null },
  { key: 'fluid_leaks', label: 'Fluid Leaks', tooltip: null },
  { key: 'air_leaks', label: 'Air Leaks', tooltip: null },
  { key: 'wipers', label: 'Wipers', tooltip: null },
];

const FALLBACK_INSIDE = [
  { key: 'seat', label: 'Seat', tooltip: null },
  { key: 'seat_belt', label: 'Seat Belt', tooltip: null },
  { key: 'heater', label: 'Heater', tooltip: null },
  { key: 'steering', label: 'Steering', tooltip: null },
  { key: 'throttle', label: 'Throttle', tooltip: null },
  { key: 'starter', label: 'Starter', tooltip: null },
  { key: 'service_brakes', label: 'Service Brakes', tooltip: null },
  { key: 'park_brake', label: 'Park Brake', tooltip: null },
  { key: 'cab_lights', label: 'Cab Lights', tooltip: null },
  { key: 'stickers', label: 'Stickers', tooltip: null },
  { key: 'king_pin_warning', label: 'King Pin Light', tooltip: null },
];

// ─── Form persistence helpers ───
const FORM_SESSION_ID_KEY = 'precheck_form_session_id';

const getFormSessionId = () => {
  let id = sessionStorage.getItem(FORM_SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(FORM_SESSION_ID_KEY, id);
  }
  return id;
};

const loadSavedForm = () => {
  try {
    const s = sessionStorage.getItem(FORM_STATE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
};

export default function PreCheckForm({ selectedTug, onSubmitSuccess, checkType = 'pre_shift' }) {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();

  // ─── Dynamic items from DB ───
  const [outsideItems, setOutsideItems] = useState(null);
  const [insideItems, setInsideItems] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    const fetchCheckItems = async () => {
      try {
        const { data, error } = await supabase
          .from('precheck_check_items')
          .select('item_key, label, tooltip, category')
          .eq('is_active', true)
          .order('sort_order');

        if (error) throw error;

        const outside = (data || [])
          .filter(i => i.category === 'outside')
          .map(i => ({ key: i.item_key, label: i.label, tooltip: i.tooltip }));
        const inside = (data || [])
          .filter(i => i.category === 'inside')
          .map(i => ({ key: i.item_key, label: i.label, tooltip: i.tooltip }));

        setOutsideItems(outside.length > 0 ? outside : FALLBACK_OUTSIDE);
        setInsideItems(inside.length > 0 ? inside : FALLBACK_INSIDE);
      } catch (err) {
        console.error('[PreCheckForm] Failed to fetch check items, using fallback:', err);
        setOutsideItems(FALLBACK_OUTSIDE);
        setInsideItems(FALLBACK_INSIDE);
      } finally {
        setItemsLoading(false);
      }
    };
    fetchCheckItems();
  }, []);

  // Derived: all items combined (only available after fetch)
  const allItems = outsideItems && insideItems ? [...outsideItems, ...insideItems] : [];

  // ─── Form state (initialized after items load) ───
  const [checkItems, setCheckItems] = useState({});
  const [formInitialized, setFormInitialized] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [remarksImages, setRemarksImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showWarning, setShowWarning] = useState(false);
  const formSessionId = useRef(getFormSessionId()).current;

  // ─── Upload image to temp storage immediately ───
  const uploadTempImage = useCallback(async (file, imageId) => {
    try {
      const ext = file.name?.split('.').pop() || 'jpg';
      const filePath = `temp/${formSessionId}/${imageId}.${ext}`;
      const { error } = await supabase.storage
        .from('precheck-images')
        .upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('precheck-images')
        .getPublicUrl(filePath);
      return publicUrl;
    } catch (err) {
      console.error('[PreCheckForm] Temp upload failed:', err);
      return null;
    }
  }, [formSessionId]);

  // Initialize form state once items are loaded
  useEffect(() => {
    if (itemsLoading || formInitialized || allItems.length === 0) return;

    const savedForm = loadSavedForm();
    const fresh = Object.fromEntries(
      allItems.map(item => [item.key, { status: '', notes: '', images: [] }])
    );

    if (savedForm?.checkItems) {
      for (const key of Object.keys(fresh)) {
        if (savedForm.checkItems[key]) {
          fresh[key].status = savedForm.checkItems[key].status || '';
          fresh[key].notes = savedForm.checkItems[key].notes || '';
          // Restore saved image URLs
          fresh[key].images = (savedForm.checkItems[key].imageUrls || []).map(img => ({
            id: img.id,
            url: img.url,
            preview: img.url,
          }));
        }
      }
    }

    setCheckItems(fresh);
    setRemarks(savedForm?.remarks || '');

    // Restore remarks images
    if (savedForm?.remarksImageUrls?.length > 0) {
      setRemarksImages(savedForm.remarksImageUrls.map(img => ({
        id: img.id,
        url: img.url,
        preview: img.url,
      })));
    }

    setFormInitialized(true);
  }, [itemsLoading, formInitialized, allItems]);

  // ─── Debounced save to sessionStorage (including image URLs) ───
  const saveTimerRef = useRef(null);
  const saveToStorage = useCallback(() => {
    if (!formInitialized) return;
    const stripped = {};
    for (const key of Object.keys(checkItems)) {
      stripped[key] = {
        status: checkItems[key].status,
        notes: checkItems[key].notes,
        imageUrls: (checkItems[key].images || [])
          .filter(img => img.url)
          .map(img => ({ id: img.id, url: img.url })),
      };
    }
    const remarksImageUrls = remarksImages
      .filter(img => img.url)
      .map(img => ({ id: img.id, url: img.url }));
    try {
      sessionStorage.setItem(FORM_STATE_KEY, JSON.stringify({
        checkItems: stripped,
        remarks,
        remarksImageUrls,
      }));
    } catch { /* ignore */ }
  }, [checkItems, remarks, remarksImages, formInitialized]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToStorage, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [saveToStorage]);

  // Debug scroll logs to catch jumps
  useEffect(() => {
    _dbgScroll2('PreCheckForm:render', 'layout', {
      y: window.scrollY,
      h: document.documentElement.scrollHeight,
      vh: window.innerHeight,
      items: allItems.length,
    });
    const t = setTimeout(() => {
      _dbgScroll2('PreCheckForm:render:timeout', 'layout post', {
        y: window.scrollY,
        h: document.documentElement.scrollHeight,
        vh: window.innerHeight,
      });
    }, 80);
    return () => clearTimeout(t);
  });

  const validate = () => {
    // 1. Check all items are marked
    const allChecked = allItems.every(item => checkItems[item.key]?.status);
    if (!allChecked) {
      setShowWarning(true);
      setTimeout(() => {
        document.getElementById('precheck-warning')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return false;
    }

    // 2. Check all repair_needed items have a description
    const missingNotes = allItems.filter(item => 
      checkItems[item.key]?.status === 'repair_needed' && !checkItems[item.key]?.notes?.trim()
    );
    if (missingNotes.length > 0) {
      setShowWarning(true);
      // Scroll to the first item missing notes
      const firstKey = missingNotes[0].key;
      setTimeout(() => {
        document.getElementById(`check-item-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return false;
    }

    setShowWarning(false);
    return true;
  };

  const buildPayload = () => ({
    userId: user.id,
    tugId: selectedTug.id,
    checkType,
    remarks: remarks?.trim() || '',
    remarksImages: mapImagesToQueueEntries(remarksImages),
    items: allItems.map(item => ({
      key: item.key,
      label: item.label,
      status: checkItems[item.key]?.status || '',
      notes: checkItems[item.key]?.notes || '',
      images: mapImagesToQueueEntries(checkItems[item.key]?.images || []),
    })),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (!selectedTug) {
      alert('Please select a tug first.');
      return;
    }

    setSubmitting(true);
    const payload = buildPayload();

    const queueSubmission = async () => {
      await queuePrecheckSubmission(payload);
      try { sessionStorage.removeItem(FORM_STATE_KEY); sessionStorage.removeItem(FORM_SESSION_ID_KEY); } catch { /* */ }
      onSubmitSuccess?.(null, { queued: true });
    };

    try {
      if (!isOnline) {
        await queueSubmission();
        return;
      }

      const submission = await submitPrecheckPayload(payload, supabase);
      try { sessionStorage.removeItem(FORM_STATE_KEY); sessionStorage.removeItem(FORM_SESSION_ID_KEY); } catch { /* */ }
      onSubmitSuccess?.(submission, { queued: false });
    } catch (err) {
      console.error('[PreCheckForm] Submit error:', err);
      if (!isOnline || isLikelyNetworkError(err)) {
        await queueSubmission();
      } else {
        alert('Error submitting PreCheck. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-upload images to temp storage when added
  const handleItemImagesChange = useCallback(async (itemKey, newImagesOrFn) => {
    setCheckItems(prev => {
      const current = prev[itemKey]?.images || [];
      const nextImages = typeof newImagesOrFn === 'function' ? newImagesOrFn(current) : newImagesOrFn;
      return {
        ...prev,
        [itemKey]: { ...prev[itemKey], images: nextImages },
      };
    });

    const resolved = typeof newImagesOrFn === 'function'
      ? newImagesOrFn([])
      : newImagesOrFn;
    const toUpload = (resolved || []).filter(img => img.file && !img.url);
    if (toUpload.length === 0) return;

    for (const img of toUpload) {
      const url = await uploadTempImage(img.file, img.id);
      if (url) {
        setCheckItems(prev => {
          const currentImages = prev[itemKey]?.images || [];
          return {
            ...prev,
            [itemKey]: {
              ...prev[itemKey],
              images: currentImages.map(i => i.id === img.id ? { ...i, url } : i),
            },
          };
        });
      }
    }
  }, [uploadTempImage]);

  const handleRemarksImagesChange = useCallback(async (newImagesOrFn) => {
    setRemarksImages(prev => {
      const next = typeof newImagesOrFn === 'function' ? newImagesOrFn(prev) : newImagesOrFn;
      return next;
    });

    const resolved = typeof newImagesOrFn === 'function'
      ? newImagesOrFn([])
      : newImagesOrFn;
    const toUpload = (resolved || []).filter(img => img.file && !img.url);
    if (toUpload.length === 0) return;

    for (const img of toUpload) {
      const url = await uploadTempImage(img.file, img.id);
      if (url) {
        setRemarksImages(prev =>
          prev.map(i => i.id === img.id ? { ...i, url } : i)
        );
      }
    }
  }, [uploadTempImage]);

  // ─── Loading state ───
  if (itemsLoading || !formInitialized) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-slate-200 rounded-xl" />
        <div className="h-64 bg-slate-200 rounded-xl" />
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  const outsideDone = (outsideItems || []).every(item => checkItems[item.key]?.status);
  const insideDone = (insideItems || []).every(item => checkItems[item.key]?.status);
  const outsideRepairs = (outsideItems || []).filter(item => checkItems[item.key]?.status === 'repair_needed').length;
  const insideRepairs = (insideItems || []).filter(item => checkItems[item.key]?.status === 'repair_needed').length;

  const outsideStatus = outsideDone ? (outsideRepairs > 0 ? 'issues' : 'done') : 'pending';
  const insideStatus = insideDone ? (insideRepairs > 0 ? 'issues' : 'done') : 'pending';

  const handleCheckChange = (key, status) => {
    setCheckItems(prev => ({ ...prev, [key]: { ...prev[key], status } }));
  };

  // Render a section (always open, no collapse)
  const renderSection = (title, items, status, repairCount) => (
    <div className={`rounded-xl overflow-hidden border ${
      status === 'done' ? 'border-green-300 bg-green-50'
        : status === 'issues' ? 'border-red-300 bg-red-50'
        : 'border-gray-200 bg-white'
    }`}>
      <div className={`px-4 py-3 flex items-center justify-between ${
        status === 'done' ? 'bg-green-50'
          : status === 'issues' ? 'bg-red-50'
          : 'bg-slate-50'
      }`}>
        <h3 className="font-semibold text-charcoal text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          {status === 'done' && (
            <span className="text-xs text-green-700 font-semibold">All OK</span>
          )}
          {status === 'issues' && (
            <span className="text-xs text-red-700 font-semibold">{repairCount} issue{repairCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div className="px-2">
        {items.map(item => (
          <CheckItemRow
                key={item.key}
                itemKey={item.key}
                label={item.label}
                tooltip={item.tooltip}
            value={checkItems[item.key]?.status || ''}
            onChange={(status) => handleCheckChange(item.key, status)}
            notes={checkItems[item.key]?.notes || ''}
            onNotesChange={(notes) => setCheckItems(prev => ({
              ...prev,
              [item.key]: { ...prev[item.key], notes }
            }))}
            images={checkItems[item.key]?.images || []}
            onImagesChange={(images) => handleItemImagesChange(item.key, images)}
          />
        ))}
      </div>
    </div>
  );

  // Count problems for warning message
  const totalUnchecked = allItems.filter(item => !checkItems[item.key]?.status).length;
  const missingDescriptions = allItems.filter(item =>
    checkItems[item.key]?.status === 'repair_needed' && !checkItems[item.key]?.notes?.trim()
  ).length;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {renderSection('Outside Check', outsideItems, outsideStatus, outsideRepairs)}
      {renderSection('Inside Check', insideItems, insideStatus, insideRepairs)}

      {/* Section 3: Remarks + Photos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-gray-100">
          <h3 className="font-semibold text-charcoal text-sm">Remarks</h3>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Any additional notes or observations..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-charcoal/30 focus:border-charcoal"
          />
          <ImageUpload
            images={remarksImages}
            onImagesChange={handleRemarksImagesChange}
            maxImages={3}
            storageKey="pending_photos_remarks"
          />
        </div>
      </div>

      {/* Debug scroll2 panel */}
      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] font-mono text-yellow-800 max-h-32 overflow-y-auto">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold">DEBUG SCROLL2</span>
          <button
            type="button"
            className="text-red-500 text-[9px]"
            onClick={() => { localStorage.removeItem('_dbg_log_scroll2'); }}
          >
            clear
          </button>
          <button
            type="button"
            className="text-blue-500 text-[9px]"
            onClick={(e) => {
              e.stopPropagation();
              try {
                const logs = JSON.parse(localStorage.getItem('_dbg_log_scroll2') || '[]');
                const panel = document.getElementById('dbg-scroll2-panel');
                if (panel) {
                  panel.innerHTML = logs.slice(-8).map((l) => `<div>${l}</div>`).join('');
                }
              } catch { /* ignore */ }
            }}
          >
            refresh
          </button>
        </div>
        <div id="dbg-scroll2-panel">
          {(() => {
            try {
              const logs = JSON.parse(localStorage.getItem('_dbg_log_scroll2') || '[]');
              return logs.slice(-8).map((l, i) => <div key={i}>{l}</div>);
            } catch { return null; }
          })()}
        </div>
      </div>

      {/* Warning message when not all items checked */}
      {showWarning && (totalUnchecked > 0 || missingDescriptions > 0) && (
        <div id="precheck-warning" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            {totalUnchecked > 0 && (
              <>
                <p className="text-sm font-semibold text-red-800">
                  {totalUnchecked} item{totalUnchecked !== 1 ? 's' : ''} not checked yet
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  You must check every item before submitting.
                </p>
              </>
            )}
            {missingDescriptions > 0 && (
              <>
                <p className={`text-sm font-semibold text-red-800 ${totalUnchecked > 0 ? 'mt-2' : ''}`}>
                  {missingDescriptions} issue{missingDescriptions !== 1 ? 's' : ''} missing description
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  Please describe what&apos;s wrong for each item marked with a warning.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitting}
        className={`w-full py-4 rounded-xl font-bold text-white text-base transition-all shadow-lg ${
          submitting
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-charcoal hover:bg-black active:scale-[0.98]'
        }`}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Submitting...
          </span>
        ) : (
          'Submit Pre-Shift Check'
        )}
      </button>
    </form>
  );
}

PreCheckForm.propTypes = {
  selectedTug: PropTypes.object,
  onSubmitSuccess: PropTypes.func,
  checkType: PropTypes.oneOf(['pre_shift', 'during_shift']),
};
