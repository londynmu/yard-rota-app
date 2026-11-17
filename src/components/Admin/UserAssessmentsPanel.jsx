import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../ui/ToastContext';
import AssessmentSignedImage from './AssessmentSignedImage';
import AddAssessmentModal from './AddAssessmentModal';
import { printAssessment } from '../../lib/assessmentPrint';

function formatDate(value) {
  if (!value) return '—';
  try {
    return format(new Date(`${value}T12:00:00`), 'd MMM yyyy');
  } catch {
    return value;
  }
}

function formatTime(value) {
  if (!value) return null;
  const raw = String(value);
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

/**
 * Per-user driver assessments for the Admin Users Assessments tab.
 */
export default function UserAssessmentsPanel({ user, onCountChange }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('shunter_assessments')
        .select(
          'id, user_id, assessment_date, next_due_date, duration, time_from, time_to, profile_snapshot, image_paths, notes, created_at',
        )
        .eq('user_id', user.id)
        .order('assessment_date', { ascending: false });
      if (fetchError) throw fetchError;
      setRows(data || []);
      onCountChangeRef.current?.(data?.length || 0);
    } catch (err) {
      console.error('[UserAssessmentsPanel] Error loading assessments:', err);
      setError(err.message || 'Failed to load assessments');
      setRows([]);
      onCountChangeRef.current?.(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = async (row) => {
    setPrintingId(row.id);
    try {
      const opened = await printAssessment(row);
      if (!opened) toast.error('Pop-up blocked — allow pop-ups to print');
    } catch (err) {
      console.error('[UserAssessmentsPanel] print failed', err);
      toast.error(err.message || 'Failed to print');
    } finally {
      setPrintingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-sm text-gray-600">
          Driver assessment records for this person. Paper forms are stored as photos;
          next due is one year after the assessment date.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No assessments yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const timeFrom = formatTime(row.time_from);
              const timeTo = formatTime(row.time_to);
              const timeLabel =
                timeFrom && timeTo ? `${timeFrom}–${timeTo}` : timeFrom || timeTo || null;
              return (
                <li
                  key={row.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-charcoal"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-charcoal">
                        {formatDate(row.assessment_date)}
                        {row.duration ? ` · ${row.duration}` : ''}
                        {timeLabel ? ` · ${timeLabel}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Next due {formatDate(row.next_due_date)}
                      </p>
                      {row.notes?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-charcoal">
                          {row.notes.trim()}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePrint(row)}
                      disabled={printingId === row.id}
                      className="admin-btn-muted shrink-0"
                    >
                      {printingId === row.id ? 'Printing…' : 'Print'}
                    </button>
                  </div>
                  {(row.image_paths || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.image_paths.map((path) => (
                        <AssessmentSignedImage
                          key={path}
                          url={path}
                          alt="Assessment form"
                          asLink
                          className="h-20 w-20 overflow-hidden rounded-md border border-gray-200"
                          imgClassName="h-full w-full object-cover"
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end border-t border-gray-200 bg-white px-5 py-3">
        <button type="button" onClick={() => setAddOpen(true)} className="admin-btn">
          New assessment
        </button>
      </div>

      <AddAssessmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        user={user}
        onSuccess={fetchData}
      />
    </div>
  );
}

UserAssessmentsPanel.propTypes = {
  user: PropTypes.object.isRequired,
  onCountChange: PropTypes.func,
};
