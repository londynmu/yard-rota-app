import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { addDays, format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../ui/ToastContext';
import {
  backfillMissingReassessmentDefaults,
  isReassessmentEligibleRole,
  pickPreferredDueRow,
} from '../../utils/reassessmentDefaults';

function personName(snapshot, profiles) {
  const fromSnap = `${snapshot?.first_name || ''} ${snapshot?.last_name || ''}`.trim();
  if (fromSnap) return fromSnap;
  const fromProfile = `${profiles?.first_name || ''} ${profiles?.last_name || ''}`.trim();
  return fromProfile || 'Unknown';
}

/**
 * Admin dashboard card: assessments due in the next 30 days (shunters / role user only).
 * Also backfills default due dates for eligible users missing an entry.
 */
export default function AssessmentsDueCard({ onOpenUser, users }) {
  const { user: authUser } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [backfillNote, setBackfillNote] = useState(null);

  const loadDueList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const until = format(addDays(new Date(), 30), 'yyyy-MM-dd');
      const { data, error: fetchError } = await supabase
        .from('shunter_assessments')
        .select(
          'id, user_id, next_due_date, profile_snapshot, profiles:user_id(first_name, last_name, role)',
        )
        .gte('next_due_date', today)
        .lte('next_due_date', until)
        .order('next_due_date', { ascending: true });
      if (fetchError) throw fetchError;

      // One row per eligible user. Prefer real assessments over auto_due placeholders,
      // then soonest due. Exclude admin/vmu/TM/transport.
      const byUser = new Map();
      (data || []).forEach((row) => {
        const role = row.profiles?.role;
        if (!isReassessmentEligibleRole(role)) return;
        byUser.set(row.user_id, pickPreferredDueRow(byUser.get(row.user_id), row));
      });
      setRows(
        [...byUser.values()].sort((a, b) =>
          String(a.next_due_date || '').localeCompare(String(b.next_due_date || '')),
        ),
      );
    } catch (err) {
      console.error('[AssessmentsDueCard] load failed', err);
      setError(err.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Paint due list immediately — do not wait on the slow admin users RPC.
  useEffect(() => {
    loadDueList();
  }, [loadDueList]);

  // Backfill only after users arrive (background).
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!authUser?.id || !Array.isArray(users) || users.length === 0) return;
      try {
        const result = await backfillMissingReassessmentDefaults(supabase, {
          users,
          createdBy: authUser.id,
        });
        if (!cancelled && result.inserted > 0) {
          setBackfillNote(`Set default due dates for ${result.inserted} shunter(s).`);
          toast.success(`Set default reassessment dates for ${result.inserted} shunter(s).`);
          await loadDueList();
        }
      } catch (err) {
        console.warn('[AssessmentsDueCard] backfill skipped', err);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- users list identity from AdminPage
  }, [authUser?.id, users, loadDueList]);

  return (
    <div className="admin-section-card">
      <div className="admin-section-header">
        <h3 className="admin-section-title">Assessments due in next 30 days</h3>
      </div>
      <div className="admin-section-body">
        {backfillNote ? (
          <p className="mb-2 text-xs text-rota-text-muted">{backfillNote}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-rota-text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-rota-text-muted">No assessments due in the next 30 days.</p>
        ) : (
          <ul className="divide-y divide-slate-200/80">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpenUser?.(row.user_id)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-slate-50/80 motion-reduce:transition-none"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-charcoal">
                    {personName(row.profile_snapshot, row.profiles)}
                  </span>
                  <span className="shrink-0 text-xs text-rota-text-muted">
                    {row.next_due_date
                      ? format(parseISO(row.next_due_date), 'd MMM yyyy')
                      : '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

AssessmentsDueCard.propTypes = {
  onOpenUser: PropTypes.func,
  users: PropTypes.arrayOf(PropTypes.object),
};
