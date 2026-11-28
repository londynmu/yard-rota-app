import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';
import Modal from '../ui/Modal';
import AssessmentSignedImage from './AssessmentSignedImage';
import AddAssessmentModal from './AddAssessmentModal';
import { printAssessment } from '../../lib/assessmentPrint';
import {
  ensureUserReassessmentDefault,
  isAutoDueAssessment,
  isReassessmentEligibleRole,
  pickPreferredDueRow,
} from '../../utils/reassessmentDefaults';

function formatDate(value) {
  if (!value) return '—';
  try {
    const raw = String(value);
    const date = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return format(date, 'd MMM yyyy');
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
 * Only role `user` (shunters) — other roles are excluded.
 */
export default function UserAssessmentsPanel({ user, onCountChange }) {
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editDueDate, setEditDueDate] = useState('');
  const [savingDue, setSavingDue] = useState(false);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const eligible = isReassessmentEligibleRole(user?.role);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    if (!isReassessmentEligibleRole(user.role)) {
      setRows([]);
      setLoading(false);
      setError(null);
      onCountChangeRef.current?.(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (authUser?.id) {
        await ensureUserReassessmentDefault(supabase, {
          user,
          createdBy: authUser.id,
        });
      }

      const { data, error: fetchError } = await supabase
        .from('shunter_assessments')
        .select(
          'id, user_id, assessment_date, next_due_date, duration, time_from, time_to, profile_snapshot, image_paths, notes, created_at',
        )
        .eq('user_id', user.id)
        .order('next_due_date', { ascending: true });
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
  }, [user, authUser?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasRealAssessment = useMemo(
    () => rows.some((row) => !isAutoDueAssessment(row)),
    [rows],
  );
  const primaryActionLabel = hasRealAssessment ? 'Reassessment' : 'New assessment';
  const dueEditRow = useMemo(
    () => rows.reduce((best, row) => pickPreferredDueRow(best, row), null),
    [rows],
  );
  const joinedDateLabel = useMemo(() => {
    if (user?.created_at) return formatDate(user.created_at);
    const autoDueRow = rows.find((row) => isAutoDueAssessment(row));
    if (autoDueRow?.assessment_date) return formatDate(autoDueRow.assessment_date);
    return null;
  }, [user?.created_at, rows]);

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

  const openEditDue = (row) => {
    setEditRow(row);
    setEditDueDate(row.next_due_date || '');
  };

  const handleSaveDueDate = async (event) => {
    event.preventDefault();
    if (!editRow?.id || !editDueDate) {
      toast.error('Reassessment date is required');
      return;
    }
    setSavingDue(true);
    try {
      const { error: updateError } = await supabase
        .from('shunter_assessments')
        .update({ next_due_date: editDueDate })
        .eq('id', editRow.id);
      if (updateError) throw updateError;
      toast.success('Reassessment date updated');
      setEditRow(null);
      await fetchData();
    } catch (err) {
      console.error('[UserAssessmentsPanel] due date update failed', err);
      toast.error(err.message || 'Failed to update date');
    } finally {
      setSavingDue(false);
    }
  };

  if (!eligible) {
    return (
      <div className="p-5">
        <p className="text-sm text-gray-600">
          Reassessments apply only to shunters (role user). This account is excluded.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4" aria-busy="true" aria-live="polite">
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
        {rows.length === 0 ? (
          <div className="admin-section-card">
            <div className="admin-section-body py-6">
              <p className="text-sm text-rota-text-muted">No assessments yet.</p>
              {joinedDateLabel ? (
                <p className="mt-1 text-xs text-gray-500">Joined {joinedDateLabel}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {joinedDateLabel ? (
              <p className="text-sm text-gray-600">Joined {joinedDateLabel}</p>
            ) : null}
            <ul className="space-y-3">
              {rows.map((row) => {
                const autoDue = isAutoDueAssessment(row);
                const timeFrom = formatTime(row.time_from);
                const timeTo = formatTime(row.time_to);
                const timeLabel =
                  timeFrom && timeTo ? `${timeFrom}–${timeTo}` : timeFrom || timeTo || null;
                return (
                  <li key={row.id} className="admin-section-card text-sm text-charcoal">
                    <div className="admin-section-body space-y-3">
                      <div className="min-w-0">
                        {autoDue ? (
                          <>
                            <p className="font-medium text-charcoal">
                              Reassessment due {formatDate(row.next_due_date)}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              Joined {formatDate(row.assessment_date)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-medium text-charcoal">
                              {formatDate(row.assessment_date)}
                              {row.duration ? ` · ${row.duration}` : ''}
                              {timeLabel ? ` · ${timeLabel}` : ''}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              Next due {formatDate(row.next_due_date)}
                            </p>
                          </>
                        )}
                        {!autoDue && row.notes?.trim() ? (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-charcoal">
                            {row.notes.trim()}
                          </p>
                        ) : null}
                      </div>
                      {(row.image_paths || []).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
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
                      ) : null}
                    </div>
                    {!autoDue ? (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handlePrint(row)}
                          disabled={printingId === row.id}
                          className="admin-btn-muted min-h-11"
                        >
                          {printingId === row.id ? 'Printing…' : 'Print'}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
        {dueEditRow ? (
          <button
            type="button"
            onClick={() => openEditDue(dueEditRow)}
            className="admin-btn-muted min-h-11"
          >
            Edit due date
          </button>
        ) : null}
        <button type="button" onClick={() => setAddOpen(true)} className="admin-btn min-h-11">
          {primaryActionLabel}
        </button>
      </div>

      <AddAssessmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        user={user}
        onSuccess={fetchData}
        mode={hasRealAssessment ? 'reassessment' : 'new'}
      />

      <Modal
        isOpen={Boolean(editRow)}
        onClose={() => !savingDue && setEditRow(null)}
        ariaLabelledBy="edit-reassessment-due-title"
      >
        <form onSubmit={handleSaveDueDate}>
          <h3 id="edit-reassessment-due-title" className="mb-2 text-xl font-semibold text-charcoal">
            Edit reassessment date
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            Set the next due date for this shunter. Leave other assessment details unchanged.
          </p>
          <label htmlFor="reassessment-due-date" className="mb-1.5 block text-sm font-medium text-charcoal">
            Next due date
          </label>
          <input
            id="reassessment-due-date"
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            required
            data-autofocus
            className="admin-input mb-6 min-h-11 w-full"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={savingDue}
              onClick={() => setEditRow(null)}
              className="admin-btn-muted order-2 min-h-11 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingDue}
              className="admin-btn order-1 min-h-11 sm:order-2"
            >
              {savingDue ? 'Saving…' : 'Save date'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

UserAssessmentsPanel.propTypes = {
  user: PropTypes.object.isRequired,
  onCountChange: PropTypes.func,
};
