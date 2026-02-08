import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';

// #region agent log
const _dbgP = (loc, msg, data) => { try { const prev = JSON.parse(localStorage.getItem('_dbg_log') || '[]'); prev.push(`${new Date().toLocaleTimeString()} [${loc}] ${msg} ${JSON.stringify(data)}`); if(prev.length>40)prev.shift(); localStorage.setItem('_dbg_log', JSON.stringify(prev)); } catch {} };
// #endregion
import useNetworkStatus from '../lib/useNetworkStatus';
import TugSelector from '../components/PreCheck/TugSelector';
import PreCheckForm from '../components/PreCheck/PreCheckForm';
import DuringShiftReport from '../components/PreCheck/DuringShiftReport';
import {
  getPrecheckQueueStatus,
  onPrecheckQueueUpdate,
  processPrecheckQueue,
} from '../lib/precheckQueue';
// TugDamageHistory used in TugSelector

// ─── Persist state helpers ───
const DURING_SHIFT_KEY = 'precheck_during_shift';
const PAGE_STATE_KEY = 'precheck_page_state';
export const FORM_STATE_KEY = 'precheck_form_state';

const saveDuringShiftState = (tug) => {
  if (tug) sessionStorage.setItem(DURING_SHIFT_KEY, JSON.stringify({ tugId: tug.id, tugNumber: tug.tug_number, displayName: tug.display_name }));
};
const clearDuringShiftState = () => sessionStorage.removeItem(DURING_SHIFT_KEY);
const loadDuringShiftState = () => {
  try { const s = sessionStorage.getItem(DURING_SHIFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
};

const savePageState = (step, tug) => {
  try {
    sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify({
      step,
      tug: tug ? { id: tug.id, tug_number: tug.tug_number, display_name: tug.display_name } : null,
    }));
  } catch { /* ignore */ }
};
const loadPageState = () => {
  try { const s = sessionStorage.getItem(PAGE_STATE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
};
const clearPageState = () => sessionStorage.removeItem(PAGE_STATE_KEY);
export const clearFormState = () => sessionStorage.removeItem(FORM_STATE_KEY);

// ─── Shift Window Logic ───
// Calculates the time window for the current shift based on scheduled_rota data.
// Returns { start: Date, end: Date } or null.
export function getShiftWindow(shifts, now = new Date()) {
  if (!shifts || shifts.length === 0) return null;

  for (const shift of shifts) {
    const shiftDate = shift.date; // "2026-02-05"
    const startStr = shift.start_time; // "05:45"
    const endStr = shift.end_time; // "18:00"
    if (!shiftDate || !startStr || !endStr) continue;

    const start = new Date(`${shiftDate}T${startStr}:00`);
    let end = new Date(`${shiftDate}T${endStr}:00`);

    // Night shift: end_time < start_time means end is next day
    if (end <= start) {
      end = new Date(end.getTime() + 86400000);
    }

    // Check if NOW falls within this shift window (with 1h buffer before start)
    const bufferStart = new Date(start.getTime() - 3600000);
    if (now >= bufferStart && now <= end) {
      return { start, end };
    }
  }

  return null;
}

// Fallback: 12 hours from the earliest check time
function getFallbackWindow(checks) {
  if (checks && checks.length > 0) {
    const earliest = new Date(checks[checks.length - 1].check_time || checks[checks.length - 1].created_at);
    return { start: earliest, end: new Date(earliest.getTime() + 12 * 3600000) };
  }
  return null;
}

export default function PreCheckPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline, connection } = useNetworkStatus();

  // Restore state from sessionStorage (survives page refresh)
  const savedDuringShift = loadDuringShiftState();
  const savedPage = !token ? loadPageState() : null; // QR token takes priority over saved state
  const clearPendingPhotos = () => {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(k => {
        if (k.startsWith('pending_photos')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch { /* ignore */ }
  };

  const getInitialStep = () => {
    if (savedDuringShift) return 'during_shift';
    if (savedPage?.step === 'form' && savedPage?.tug) return 'form';
    if (savedPage?.step === 'during_shift' && savedPage?.tug) return 'during_shift';
    return 'select';
  };

  const getInitialTug = () => {
    if (savedDuringShift) return { id: savedDuringShift.tugId, tug_number: savedDuringShift.tugNumber, display_name: savedDuringShift.displayName };
    if (savedPage?.tug) return savedPage.tug;
    return null;
  };

  const [step, setStep] = useState(getInitialStep);
  const [selectedTug, setSelectedTug] = useState(getInitialTug);
  const [userLocationId, setUserLocationId] = useState(null);
  const [shiftChecks, setShiftChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrError, setQrError] = useState(null);
  const [lastSubmitType, setLastSubmitType] = useState(null);
  const [lastSubmitQueued, setLastSubmitQueued] = useState(false);
  const [queueStatus, setQueueStatus] = useState({ total: 0, pending: 0, uploading: 0, failed: 0 });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    initialize();
    return () => {
      clearPendingPhotos();
    };
  }, [user, token]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshStatus = async () => {
      const status = await getPrecheckQueueStatus(user.id);
      setQueueStatus(status);
    };

    refreshStatus();
    const unsubscribe = onPrecheckQueueUpdate(refreshStatus);
    return () => unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isOnline) return;

    const sync = async () => {
      setIsSyncing(true);
      try {
        await processPrecheckQueue({ supabase, userId: user.id });
      } finally {
        setIsSyncing(false);
      }
    };

    sync();
  }, [isOnline, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event) => {
      if (event?.data?.type !== 'PRECHECK_SYNC') return;
      if (!isOnline) return;
      setIsSyncing(true);
      processPrecheckQueue({ supabase, userId: user.id })
        .finally(() => setIsSyncing(false));
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [user?.id, isOnline]);

  const initializedRef = useRef(false);

  const initialize = async () => {
    if (!user) return;
    // Only show loading skeleton on first init — re-init must NOT unmount child components
    if (!initializedRef.current) {
      setLoading(true);
    }
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

      // 1. Get user's shifts (today + yesterday for night shifts)
      const { data: shifts } = await supabase
        .from('scheduled_rota')
        .select('location, start_time, end_time, shift_type, date')
        .eq('user_id', user.id)
        .in('date', [today, yesterday])
        .order('date', { ascending: false });

      // Determine shift window
      const sw = getShiftWindow(shifts || [], now);

      // Set location from the active shift
      if (shifts && shifts.length > 0) {
        const activeShift = shifts[0];
        if (activeShift.location) {
          const { data: locData } = await supabase
            .from('locations')
            .select('id')
            .eq('name', activeShift.location)
            .maybeSingle();
          if (locData) setUserLocationId(locData.id);
        }
      }

      // 2. Get existing pre-shift checks in the shift window
      let checksQuery = supabase
        .from('precheck_submissions')
        .select('*, tugs(tug_number, display_name)')
        .eq('user_id', user.id)
        .eq('check_type', 'pre_shift')
        .order('check_time', { ascending: false });

      if (sw) {
        checksQuery = checksQuery
          .gte('check_time', sw.start.toISOString())
          .lte('check_time', sw.end.toISOString());
      } else {
        // No shift found - look for checks in last 12 hours
        const twelveHoursAgo = new Date(now.getTime() - 12 * 3600000);
        checksQuery = checksQuery.gte('check_time', twelveHoursAgo.toISOString());
      }

      const { data: existingChecks } = await checksQuery;
      const checks = existingChecks || [];

      // Calculate effective window (shift-based or fallback from checks)
      const effectiveWindow = sw || getFallbackWindow(checks, now);

      // Check if we're still within the window
      if (effectiveWindow && now <= effectiveWindow.end) {
        setShiftChecks(checks);
      } else {
        setShiftChecks([]); // Window expired
      }

      // Set selected tug and show completed view if checks exist
      // BUT don't override if user was in the middle of a form or camera (restored from sessionStorage)
      const restoredStep = getInitialStep();
      const cameraActive = (() => { try { return sessionStorage.getItem('camera_intent_active') === 'true'; } catch { return false; } })();
      if (checks.length > 0 && effectiveWindow && now <= effectiveWindow.end && !savedDuringShift) {
        if (restoredStep !== 'form' && restoredStep !== 'during_shift' && !cameraActive) {
          const latest = checks[0];
          setSelectedTug({
            id: latest.tug_id,
            tug_number: latest.tugs?.tug_number,
            display_name: latest.tugs?.display_name,
          });
          setStep('completed');
        }
        // If restoredStep is 'form'/'during_shift' or camera is active, keep it
      }

      // 3. QR token handling
      if (token) {
        const { data: tugByToken, error } = await supabase
          .from('tugs')
          .select('*, locations(id, name)')
          .eq('qr_token', token)
          .eq('status', 'active')
          .maybeSingle();

        if (error || !tugByToken) {
          setQrError('Invalid or inactive QR code. Please try again or select a tug manually.');
        } else {
          setSelectedTug(tugByToken);
          // Check if THIS specific tug was already checked in this shift
          const alreadyChecked = checks.some(c => c.tug_id === tugByToken.id);
          if (!alreadyChecked) {
            window.scrollTo({ top: 0 });
            setStep('form');
          }
          // If already checked, will show the completed view
        }
      }
    } catch (err) {
      console.error('[PreCheckPage] Init error:', err);
    } finally {
      setLoading(false);
      initializedRef.current = true;
    }
  };

  const handleTugSelect = (tug) => {
    setSelectedTug(tug);
    setQrError(null);
  };

  const handleProceedToForm = () => {
    if (!selectedTug) {
      alert('Please select a tug.');
      return;
    }
    clearPendingPhotos();
    // #region agent log
    try{const prev=JSON.parse(localStorage.getItem('_dbg_log_HA')||'[]');prev.push(`${new Date().toLocaleTimeString()} handleProceedToForm scrollTo(0)`);if(prev.length>30)prev.shift();localStorage.setItem('_dbg_log_HA',JSON.stringify(prev));}catch{}
    // #endregion
    window.scrollTo({ top: 0 });
    setStep('form');
    savePageState('form', selectedTug);
  };

  const handleSubmitSuccess = (submission, meta = {}) => {
    clearPendingPhotos();
    if (submission) {
      setShiftChecks(prev => [submission, ...prev]);
    }
    setLastSubmitType('precheck');
    setLastSubmitQueued(!!meta.queued);
    setStep('success');
    clearPageState();
    clearFormState();
  };

  const handleStartDuringShift = (tug) => {
    clearPendingPhotos();
    setSelectedTug(tug);
    saveDuringShiftState(tug);
    setStep('during_shift');
    savePageState('during_shift', tug);
  };

  const handleCheckAnotherTug = () => {
    clearPendingPhotos();
    setSelectedTug(null);
    setStep('select');
    clearPageState();
    clearFormState();
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-40 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  // ─── Completed view ───
  if (step === 'completed' && shiftChecks.length > 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className="space-y-3">
        {/* All checks grouped in one card */}
        <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
          {shiftChecks.map((check, idx) => {
            const tugName = check.tugs?.display_name || check.tugs?.tug_number || 'Unknown';
            const tugNumber = check.tugs?.tug_number || '';
            const time = new Date(check.check_time || check.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={check.id} className={`p-3 flex items-center justify-between ${idx > 0 ? 'border-t border-green-200' : ''}`}>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <span className="text-sm font-bold text-green-800">{tugName}</span>
                    <span className="text-xs text-green-600 ml-2">
                      {tugName !== tugNumber ? `${tugNumber} • ` : ''}{time}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleStartDuringShift({
                    id: check.tug_id,
                    tug_number: tugNumber,
                    display_name: check.tugs?.display_name,
                  })}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                >
                  Report Damage
                </button>
              </div>
            );
          })}
        </div>

        {/* Check Another Tug */}
        <button
          onClick={handleCheckAnotherTug}
          className="w-full py-3 bg-charcoal text-white font-semibold rounded-xl hover:bg-black transition-colors"
        >
          Check Another Tug
        </button>
        </div>
      </div>
    );
  }

  // ─── During shift damage report ───
  if (step === 'during_shift') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
        {(queueStatus.total > 0 || !isOnline) && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${
            !isOnline ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                {!isOnline && (
                  <span>You are offline. Reports will sync when you&apos;re back online.</span>
                )}
                {isOnline && (
                  <span>
                    {queueStatus.failed > 0
                      ? `${queueStatus.failed} upload(s) failed.`
                      : `${queueStatus.pending + queueStatus.uploading} upload(s) pending.`}
                    {connection?.effectiveType ? ` (${connection.effectiveType})` : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!isOnline || !user?.id) return;
                  setIsSyncing(true);
                  try {
                    await processPrecheckQueue({ supabase, userId: user.id });
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                disabled={!isOnline || isSyncing}
                className={`px-2 py-1 rounded border text-xs ${
                  !isOnline || isSyncing
                    ? 'border-gray-200 text-gray-400'
                    : 'border-blue-300 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync now'}
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => {
            clearDuringShiftState();
            setStep(shiftChecks.length > 0 ? 'completed' : 'select');
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <DuringShiftReport
          selectedTug={selectedTug}
          onSubmitSuccess={(_, meta = {}) => {
            clearDuringShiftState();
            clearPendingPhotos();
            setLastSubmitType('damage');
            setLastSubmitQueued(!!meta.queued);
            setStep('success');
          }}
        />
      </div>
    );
  }

  // ─── Success screen ───
  if (step === 'success') {
    const isDamage = lastSubmitType === 'damage';
    const tugName = selectedTug?.display_name || selectedTug?.tug_number || '';
    const tugNumber = selectedTug?.tug_number || '';
    const now = new Date();

    return (
      <div className="max-w-lg mx-auto px-4 py-6 pb-24">
        <div className={`${isDamage ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border rounded-xl p-5 space-y-4`}>
          <div>
            <h2 className={`text-base font-bold ${isDamage ? 'text-red-800' : 'text-green-800'}`}>
              {isDamage ? `Damage has been recorded for ${tugName}` : `Pre-Shift Check completed for ${tugName}`}
            </h2>
            <p className={`text-xs mt-1 ${isDamage ? 'text-red-600' : 'text-green-600'}`}>
              {tugName !== tugNumber ? `${tugNumber} • ` : ''}{now.toLocaleDateString('en-GB')} {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {lastSubmitQueued && (
              <p className="text-xs mt-1 text-slate-500">
                Saved offline. Upload will resume automatically when you&apos;re online.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleCheckAnotherTug}
              className="w-full py-2.5 bg-charcoal text-white font-semibold rounded-xl hover:bg-black transition-colors text-sm"
            >
              Check Another Tug
            </button>
            <button
              onClick={() => navigate('/calendar')}
              className="w-full py-2.5 bg-white text-charcoal font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Select tug ───
  if (step === 'select') {
    const checkedTugIds = shiftChecks.map(c => c.tug_id);

    return (
      <div className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-4">
        {/* Back to completed checks if any exist */}
        {shiftChecks.length > 0 && (
          <button
            onClick={() => setStep('completed')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to today&apos;s checks
          </button>
        )}

        <h1 className="text-lg font-bold text-charcoal">Select Tug</h1>

        {qrError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
            {qrError}
          </div>
        )}

        <TugSelector
          selectedTug={selectedTug}
          onSelect={handleTugSelect}
          onStartCheck={(tug) => {
            setSelectedTug(tug);
            handleProceedToForm();
          }}
          userLocationId={userLocationId}
          checkedTugIds={checkedTugIds}
        />
      </div>
    );
  }

  // ─── Form (pre-shift check) ───
  // scrollTo(0) removed from render body — now only in handleProceedToForm / QR flow

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-4">
      {(queueStatus.total > 0 || !isOnline) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${
          !isOnline ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              {!isOnline && (
                <span>You are offline. Checks will sync when you&apos;re back online.</span>
              )}
              {isOnline && (
                <span>
                  {queueStatus.failed > 0
                    ? `${queueStatus.failed} upload(s) failed.`
                    : `${queueStatus.pending + queueStatus.uploading} upload(s) pending.`}
                  {connection?.effectiveType ? ` (${connection.effectiveType})` : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!isOnline || !user?.id) return;
                setIsSyncing(true);
                try {
                  await processPrecheckQueue({ supabase, userId: user.id });
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={!isOnline || isSyncing}
              className={`px-2 py-1 rounded border text-xs ${
                !isOnline || isSyncing
                  ? 'border-gray-200 text-gray-400'
                  : 'border-blue-300 text-blue-700 hover:bg-blue-100'
              }`}
            >
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setStep('select');
            clearPageState();
            clearFormState();
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Change Tug
        </button>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className="w-5 h-5 rounded bg-red-500 text-white flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </span>
            Issue
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className="w-5 h-5 rounded bg-green-500 text-white flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </span>
            OK
          </span>
        </div>
      </div>

      <PreCheckForm
        selectedTug={selectedTug}
        onSubmitSuccess={handleSubmitSuccess}
        checkType="pre_shift"
      />

      {/* #region agent log - visible debug panel for H-A */}
      <div className="mt-2 p-2 bg-orange-50 border border-orange-300 rounded text-[10px] font-mono text-orange-800 max-h-40 overflow-y-auto">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold">DEBUG H-A: scrollTo(0) calls</span>
          <button type="button" className="text-red-500 text-[9px]" onClick={() => { localStorage.removeItem('_dbg_log_HA'); }}>clear</button>
          <button type="button" className="text-blue-500 text-[9px]" onClick={() => { try { document.getElementById('dbg-ha-panel').innerHTML = JSON.parse(localStorage.getItem('_dbg_log_HA')||'[]').slice(-10).map(l=>`<div>${l}</div>`).join(''); } catch {} }}>refresh</button>
        </div>
        <div id="dbg-ha-panel">
          {(() => { try { return JSON.parse(localStorage.getItem('_dbg_log_HA')||'[]').slice(-10).map((l,i)=><div key={i}>{l}</div>); } catch { return null; } })()}
        </div>
      </div>
      {/* #endregion */}
    </div>
  );
}
