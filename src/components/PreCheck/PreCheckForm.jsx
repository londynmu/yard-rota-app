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
import { getOpenDefectsForTug } from '../../lib/precheckDefects';
import { isLikelyNetworkError } from '../../lib/uploadRetry';

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

export default function PreCheckForm({ selectedTug, onSubmitSuccess, onChangeTug, checkType = 'pre_shift' }) {
  const { user } = useAuth();
  const { isOnline } = useNetworkStatus();
  /* global __PRECHECK_SCHEMA_VERSION__ */
  const CLIENT_SCHEMA_VERSION = typeof __PRECHECK_SCHEMA_VERSION__ !== 'undefined'
    ? __PRECHECK_SCHEMA_VERSION__
    : '0';

  // ─── Dynamic items from DB ───
  const [outsideItems, setOutsideItems] = useState(null);
  const [insideItems, setInsideItems] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(true);

  // ─── Schema version guard ───
  const [schemaStatus, setSchemaStatus] = useState('checking'); // checking | ok | mismatch | error
  const [serverSchemaVersion, setServerSchemaVersion] = useState(null);
  const [expectedActiveItems, setExpectedActiveItems] = useState(null);
  const [schemaErrorMessage, setSchemaErrorMessage] = useState(null);

  useEffect(() => {
    const fetchCheckItems = async () => {
      try {
        const { data, error } = await supabase
          .from('precheck_check_items')
          .select('item_key, label, tooltip, category, allow_na')
          .eq('is_active', true)
          .order('sort_order');

        if (error) throw error;

        const outside = (data || [])
          .filter(i => i.category === 'outside')
          .map(i => ({ key: i.item_key, label: i.label, tooltip: i.tooltip, allowNa: !!i.allow_na }));
        const inside = (data || [])
          .filter(i => i.category === 'inside')
          .map(i => ({ key: i.item_key, label: i.label, tooltip: i.tooltip, allowNa: !!i.allow_na }));

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

  // Fetch schema version (and optional expected item count) from app_config
  useEffect(() => {
    const fetchSchemaVersion = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('key, value')
          .in('key', ['precheck_schema_version', 'precheck_expected_active_items']);

        if (error) throw error;

        let serverVersion = null;
        let expectedCount = null;
        (data || []).forEach(row => {
          if (row.key === 'precheck_schema_version') serverVersion = row.value;
          if (row.key === 'precheck_expected_active_items') expectedCount = row.value;
        });

        if (expectedCount !== null) {
          const parsed = Number(expectedCount);
          if (Number.isFinite(parsed)) setExpectedActiveItems(parsed);
        }

        if (serverVersion !== null) {
          setServerSchemaVersion(serverVersion);
          const serverNum = Number(serverVersion);
          const clientNum = Number(CLIENT_SCHEMA_VERSION);
          if (Number.isFinite(serverNum) && Number.isFinite(clientNum) && serverNum > clientNum) {
            setSchemaStatus('mismatch');
          } else {
            setSchemaStatus('ok');
          }
        } else {
          setSchemaStatus('error');
          setSchemaErrorMessage('Schema version not found in config');
        }
      } catch (err) {
        console.error('[PreCheckForm] Schema version fetch error:', err);
        setSchemaStatus('error');
        setSchemaErrorMessage(err?.message || 'Unknown error');
      }
    };

    fetchSchemaVersion();
  }, [CLIENT_SCHEMA_VERSION]);

  // Derived: all items combined (only available after fetch)
  const allItems = outsideItems && insideItems ? [...outsideItems, ...insideItems] : [];

  // ─── Known defects per item (fetched when tug selected) ───
  const [knownDefectsByItem, setKnownDefectsByItem] = useState({});

  // ─── Form state (initialized after items load) ───
  const [checkItems, setCheckItems] = useState({});
  const [formInitialized, setFormInitialized] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [remarksImages, setRemarksImages] = useState([]);
  const [remarksEnabled, setRemarksEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const formSessionId = useRef(getFormSessionId()).current;

  useEffect(() => {
    if (!selectedTug?.id) {
      setKnownDefectsByItem({});
      return;
    }
    const load = async () => {
      const byItem = await getOpenDefectsForTug(selectedTug.id, supabase);
      setKnownDefectsByItem(byItem);
    };
    load();
  }, [selectedTug?.id]);

  useEffect(() => {
    const fetchRemarksSetting = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'pre_shift_remarks_enabled')
          .maybeSingle();
        if (error) throw error;
        setRemarksEnabled(!data || data.value !== 'false');
      } catch (err) {
        console.error('[PreCheckForm] Settings fetch error:', err);
        setRemarksEnabled(true);
      }
    };
    fetchRemarksSetting();
  }, []);

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
      allItems.map(item => [item.key, { status: '', notes: '', images: [], linkedDamageId: null }])
    );

    if (savedForm?.checkItems) {
      for (const key of Object.keys(fresh)) {
        if (savedForm.checkItems[key]) {
          fresh[key].status = savedForm.checkItems[key].status || '';
          fresh[key].notes = savedForm.checkItems[key].notes || '';
          fresh[key].linkedDamageId = savedForm.checkItems[key].linkedDamageId || null;
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

  // ─── Restore scroll position after form is fully rendered (handles camera/gallery return) ───
  useEffect(() => {
    if (!formInitialized) return;
    // Check all possible scroll keys for a saved position
    const scrollKeys = [
      'pending_photos_remarks_scrollY',
      ...allItems.map(item => `pending_photos_item_${item.key}_scrollY`),
    ];
    let savedY = null;
    for (const key of scrollKeys) {
      try {
        const v = Number(sessionStorage.getItem(key));
        if (Number.isFinite(v) && v > 0 && (savedY === null || v > savedY)) {
          savedY = v;
        }
      } catch { /* ignore */ }
    }
    if (savedY !== null && savedY > 0) {
      // Use rAF to ensure DOM is painted
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: 'auto' });
      });
    }
    // Clear all scroll keys after restore to prevent stale values from interfering
    for (const key of scrollKeys) {
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    }
  }, [formInitialized, allItems]);

  // ─── Debounced save to sessionStorage (including image URLs) ───
  const saveTimerRef = useRef(null);
  const saveToStorage = useCallback(() => {
    if (!formInitialized) return;
    const stripped = {};
    for (const key of Object.keys(checkItems)) {
      stripped[key] = {
        status: checkItems[key].status,
        notes: checkItems[key].notes,
        linkedDamageId: checkItems[key].linkedDamageId || null,
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

    // 2. Check repair_needed items have description (except when linked to existing defect)
    const missingNotes = allItems.filter(item => {
      const ci = checkItems[item.key];
      if (ci?.status !== 'repair_needed') return false;
      if (ci?.linkedDamageId) return false;
      return !ci?.notes?.trim();
    });
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
    formSessionId,
    remarks: remarksEnabled ? (remarks?.trim() || '') : '',
    remarksImages: remarksEnabled ? mapImagesToQueueEntries(remarksImages) : [],
    items: allItems.map(item => ({
      key: item.key,
      label: item.label,
      status: checkItems[item.key]?.status || '',
      notes: checkItems[item.key]?.notes || '',
      linkedDamageId: checkItems[item.key]?.linkedDamageId || null,
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
  const isSchemaMismatch = schemaStatus === 'mismatch';
  const countMismatch = expectedActiveItems !== null && allItems.length > 0 && allItems.length !== expectedActiveItems;

  const handleCheckChange = (key, status) => {
    const scrollY = window.scrollY;
    setCheckItems(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        status,
        linkedDamageId: status !== 'repair_needed' ? null : prev[key]?.linkedDamageId,
      },
    }));
    // Restore scroll: rAF for normal browsers, setTimeout for iOS Safari (adjusts scroll later)
    const restore = () => window.scrollTo({ top: scrollY, behavior: 'auto' });
    requestAnimationFrame(restore);
    setTimeout(restore, 80);
  };

  // Section: title on main container, floating cards below (no wrapper box)
  const renderSection = (title, items, status, repairCount) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-charcoal">{title}</h2>
        {status === 'done' && (
          <span className="text-xs text-green-700 font-semibold">All OK</span>
        )}
        {status === 'issues' && (
          <span className="text-xs text-red-700 font-semibold">{repairCount} issue{repairCount !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div className="space-y-4">
        {items.map(item => (
          <CheckItemRow
            key={item.key}
            itemKey={item.key}
            label={item.label}
            tooltip={item.tooltip}
            allowNa={item.allowNa}
            value={checkItems[item.key]?.status || ''}
            onChange={(status) => handleCheckChange(item.key, status)}
            notes={checkItems[item.key]?.notes || ''}
            onNotesChange={(notes) => setCheckItems(prev => ({
              ...prev,
              [item.key]: { ...prev[item.key], notes },
            }))}
            images={checkItems[item.key]?.images || []}
            onImagesChange={(images) => handleItemImagesChange(item.key, images)}
            knownDefects={knownDefectsByItem[item.key] || []}
            linkedDamageId={checkItems[item.key]?.linkedDamageId}
            onLinkDefect={(damageId) => setCheckItems(prev => ({
              ...prev,
              [item.key]: { ...prev[item.key], linkedDamageId: damageId || null },
            }))}
          />
        ))}
      </div>
    </div>
  );

  // Count problems for warning message
  const totalUnchecked = allItems.filter(item => !checkItems[item.key]?.status).length;
  const missingDescriptions = allItems.filter(item => {
    const ci = checkItems[item.key];
    if (ci?.status !== 'repair_needed') return false;
    if (ci?.linkedDamageId) return false;
    return !ci?.notes?.trim();
  }).length;

  const totalItems = allItems.length;
  const checkedCount = allItems.filter(item => checkItems[item.key]?.status).length;
  const progressPct = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0;
  const tugLabel = selectedTug?.display_name || selectedTug?.tug_number || null;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Schema version guard messages */}
      {isSchemaMismatch && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 flex flex-col gap-2">
          <div className="font-semibold">Your app is outdated</div>
          <div className="text-xs text-red-700">
            Please close and reopen the app (or refresh) to load the latest PreCheck form. If the issue persists, reinstall/update the app.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Refresh now
            </button>
          </div>
        </div>
      )}

      {schemaStatus === 'error' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          Could not verify latest form version (offline or network issue). Your current form will be used.
        </div>
      )}

      {schemaStatus !== 'mismatch' && countMismatch && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          Form items count differs from expected. You can continue, but please report if this persists.
        </div>
      )}

      {/* Sticky tug info bar – rounded card with margins, Change Tug on the right */}
      {tugLabel && (
        <div className="sticky top-0 z-30 pt-safe pt-1">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-lg font-extrabold text-charcoal">{tugLabel}</span>
              {onChangeTug && (
                <button
                  type="button"
                  onClick={onChangeTug}
                  className="text-sm font-medium text-slate-500 hover:text-charcoal transition-colors"
                >
                  Change Tug
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {renderSection('Outside Check', outsideItems, outsideStatus, outsideRepairs)}
      {renderSection('Inside Check', insideItems, insideStatus, insideRepairs)}

      {/* Section 3: Remarks + Photos */}
      {remarksEnabled && (
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
      )}

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
        disabled={submitting || isSchemaMismatch}
        className={`w-full py-4 rounded-xl font-bold text-white text-base transition-all shadow-lg ${
          submitting
            ? 'bg-gray-400 cursor-not-allowed'
            : isSchemaMismatch
              ? 'bg-red-400 cursor-not-allowed'
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
  onChangeTug: PropTypes.func,
  checkType: PropTypes.oneOf(['pre_shift', 'during_shift']),
};
