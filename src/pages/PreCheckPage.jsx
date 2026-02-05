import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import TugSelector from '../components/PreCheck/TugSelector';
import PreCheckForm from '../components/PreCheck/PreCheckForm';
import TugDamageHistory from '../components/PreCheck/TugDamageHistory';

export default function PreCheckPage() {
  const { token } = useParams(); // QR deep link token
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [step, setStep] = useState('select'); // 'select' | 'form' | 'success' | 'during_shift'
  const [selectedTug, setSelectedTug] = useState(null);
  const [userLocationId, setUserLocationId] = useState(null);
  const [todayPreCheck, setTodayPreCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrError, setQrError] = useState(null);

  useEffect(() => {
    initialize();
  }, [user, token]);

  const initialize = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Get user's today shift location
      const today = new Date().toISOString().split('T')[0];
      const { data: todayShift } = await supabase
        .from('scheduled_rota')
        .select('location')
        .eq('user_id', user.id)
        .eq('date', today)
        .limit(1)
        .maybeSingle();

      if (todayShift?.location) {
        // Look up location ID by name
        const { data: locationData } = await supabase
          .from('locations')
          .select('id')
          .eq('name', todayShift.location)
          .maybeSingle();
        
        if (locationData) setUserLocationId(locationData.id);
      }

      // 2. Check if user already has a pre-shift check today
      const { data: existingCheck } = await supabase
        .from('precheck_submissions')
        .select('*, tugs(tug_number)')
        .eq('user_id', user.id)
        .eq('check_date', today)
        .eq('check_type', 'pre_shift')
        .maybeSingle();

      if (existingCheck) {
        setTodayPreCheck(existingCheck);
        setSelectedTug({ id: existingCheck.tug_id, tug_number: existingCheck.tugs?.tug_number });
      }

      // 3. If QR token, load tug by token
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
          if (!existingCheck) {
            setStep('form');
          }
        }
      }
    } catch (err) {
      console.error('[PreCheckPage] Init error:', err);
    } finally {
      setLoading(false);
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
    setStep('form');
  };

  const handleSubmitSuccess = (submission) => {
    setTodayPreCheck(submission);
    setStep('success');
  };

  const handleStartDuringShift = () => {
    setStep('during_shift');
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-40 bg-slate-200 rounded-xl" />
        <div className="h-40 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  // Already completed pre-shift check today
  if (todayPreCheck && step !== 'during_shift') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-green-800 mb-1">Pre-Shift Check Completed</h2>
          <p className="text-sm text-green-600">
            Tug <strong>{selectedTug?.tug_number || todayPreCheck.tugs?.tug_number}</strong> checked today at{' '}
            {new Date(todayPreCheck.check_time || todayPreCheck.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Report new damage during shift */}
        <button
          onClick={handleStartDuringShift}
          className="w-full py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Report New Damage
        </button>

        {/* Damage history */}
        {selectedTug && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <TugDamageHistory tugId={selectedTug.id} />
          </div>
        )}
      </div>
    );
  }

  // During shift damage report
  if (step === 'during_shift') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <button
          onClick={() => setStep('select')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-lg font-bold text-charcoal">Report Damage During Shift</h2>
        <PreCheckForm 
          selectedTug={selectedTug} 
          onSubmitSuccess={(submission) => {
            setTodayPreCheck(prev => prev); // Keep the pre-shift check reference
            setStep('success');
          }}
          checkType="during_shift"
        />
      </div>
    );
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-green-800 mb-2">Check Submitted Successfully</h2>
          <p className="text-sm text-green-600 mb-6">
            Your check for <strong>{selectedTug?.tug_number}</strong> has been recorded.
          </p>
          <button
            onClick={() => navigate('/calendar')}
            className="px-6 py-2.5 bg-charcoal text-white font-medium rounded-lg hover:bg-black transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // Step: Select tug
  if (step === 'select') {
    return (
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-charcoal">Daily Tug Check</h1>
          <p className="text-sm text-gray-500 mt-1">Select your tug and complete the pre-shift inspection</p>
        </div>

        {qrError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
            {qrError}
          </div>
        )}

        <TugSelector 
          selectedTug={selectedTug} 
          onSelect={handleTugSelect}
          userLocationId={userLocationId}
        />

        {/* Damage history for selected tug */}
        {selectedTug && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <TugDamageHistory tugId={selectedTug.id} />
          </div>
        )}

        {/* Continue button */}
        {selectedTug && (
          <button
            onClick={handleProceedToForm}
            className="w-full py-4 bg-charcoal text-white font-bold rounded-xl hover:bg-black active:scale-[0.98] transition-all shadow-lg text-base"
          >
            Start PreCheck for {selectedTug.tug_number}
          </button>
        )}
      </div>
    );
  }

  // Step: Form
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <button
        onClick={() => setStep('select')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-charcoal transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Change Tug
      </button>

      <PreCheckForm 
        selectedTug={selectedTug} 
        onSubmitSuccess={handleSubmitSuccess}
        checkType="pre_shift"
      />
    </div>
  );
}
