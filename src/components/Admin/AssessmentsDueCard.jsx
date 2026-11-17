import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { addDays, format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';

function personName(snapshot, profiles) {
  const fromSnap = `${snapshot?.first_name || ''} ${snapshot?.last_name || ''}`.trim();
  if (fromSnap) return fromSnap;
  const fromProfile = `${profiles?.first_name || ''} ${profiles?.last_name || ''}`.trim();
  return fromProfile || 'Unknown';
}

/**
 * Admin dashboard card: assessments due in the next 30 days.
 */
export default function AssessmentsDueCard({ onOpenUser }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const until = format(addDays(new Date(), 30), 'yyyy-MM-dd');
        const { data, error: fetchError } = await supabase
          .from('shunter_assessments')
          .select(
            'id, user_id, next_due_date, profile_snapshot, profiles:user_id(first_name, last_name)',
          )
          .gte('next_due_date', today)
          .lte('next_due_date', until)
          .order('next_due_date', { ascending: true });
        if (fetchError) throw fetchError;

        // One row per user — soonest due wins.
        const byUser = new Map();
        (data || []).forEach((row) => {
          if (!byUser.has(row.user_id)) byUser.set(row.user_id, row);
        });
        if (!cancelled) setRows([...byUser.values()]);
      } catch (err) {
        console.error('[AssessmentsDueCard] load failed', err);
        if (!cancelled) {
          setError(err.message || 'Failed to load');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-section-card">
      <div className="admin-section-header">
        <h3 className="admin-section-title">Assessments due in next 30 days</h3>
      </div>
      <div className="admin-section-body">
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
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
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
};
