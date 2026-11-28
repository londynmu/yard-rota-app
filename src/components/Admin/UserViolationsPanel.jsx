import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { attendanceLabel } from '../../utils/attendanceStatus';
import AddViolationModal from './AddViolationModal';

function eventSortKey(event) {
  if (event.sortAt) return new Date(event.sortAt).getTime();
  return 0;
}

function formatEventDate(isoOrDate) {
  if (!isoOrDate) return '—';
  try {
    return format(new Date(isoOrDate), 'd MMM yyyy');
  } catch {
    return '—';
  }
}

/**
 * Per-user attendance + disciplinary notes for Admin Users → Info tab.
 * Single chronological timeline (newest first).
 */
export default function UserViolationsPanel({ userId, users = [], onCountChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [violations, setViolations] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('id, scheduled_rota_id, status, recorded_at, date')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
      if (attErr) throw attErr;

      const attRows = attData || [];
      const attendanceIds = attRows.map((a) => a.id).filter(Boolean);
      let noteByAttendanceId = {};
      if (attendanceIds.length > 0) {
        const { data: notesData, error: notesErr } = await supabase
          .from('attendance_notes')
          .select('attendance_id, note')
          .in('attendance_id', attendanceIds);
        if (notesErr) {
          console.warn('[UserViolationsPanel] Could not load attendance notes:', notesErr);
        }
        noteByAttendanceId = (notesData || []).reduce((acc, n) => {
          if (n.attendance_id) acc[n.attendance_id] = n.note;
          return acc;
        }, {});
      }

      // Fallback dates from live rota when snapshot date is missing (pre-migration rows)
      const missingDateRotaIds = attRows
        .filter((a) => !a.date && a.scheduled_rota_id)
        .map((a) => a.scheduled_rota_id);
      let rotaDateMap = {};
      if (missingDateRotaIds.length > 0) {
        const { data: rotaData, error: rotaErr } = await supabase
          .from('scheduled_rota')
          .select('id, date')
          .in('id', missingDateRotaIds);
        if (rotaErr) throw rotaErr;
        rotaDateMap = (rotaData || []).reduce((acc, r) => {
          acc[r.id] = r.date;
          return acc;
        }, {});
      }

      const attList = attRows.map((a) => ({
        id: a.id,
        date: a.date || rotaDateMap[a.scheduled_rota_id] || null,
        recorded_at: a.recorded_at || null,
        status: a.status,
        note: noteByAttendanceId[a.id] || null,
      }));
      setAttendanceRecords(attList);

      const { data: violData, error: violErr } = await supabase
        .from('shunter_violations')
        .select('id, body, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (violErr) throw violErr;
      setViolations(violData || []);

      onCountChangeRef.current?.((attList?.length || 0) + ((violData || []).length));
    } catch (err) {
      console.error('[UserViolationsPanel] Error loading violations:', err);
      setError(err.message || 'Failed to load records');
      setAttendanceRecords([]);
      setViolations([]);
      onCountChangeRef.current?.(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const personName = useMemo(() => {
    const profile = users.find((u) => u.id === userId);
    if (!profile) return '';
    return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  }, [users, userId]);

  const handlePrint = useCallback(() => {
    document.body.classList.add('printing-user-info');
    const cleanup = () => {
      document.body.classList.remove('printing-user-info');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  }, []);

  const timeline = useMemo(() => {
    const attendanceEvents = attendanceRecords.map((r) => {
      const statusLabel = attendanceLabel(r.status) || r.status || 'Attendance';
      const sortAt = r.recorded_at || (r.date ? `${r.date}T12:00:00` : null);
      return {
        id: `att-${r.id || r.date || statusLabel}`,
        kind: 'attendance',
        sortAt,
        displayDate: r.date || r.recorded_at,
        typeLabel: statusLabel,
        description: r.note || statusLabel,
      };
    });

    const violationEvents = violations.map((v) => ({
      id: `viol-${v.id}`,
      kind: 'violation',
      sortAt: v.created_at,
      displayDate: v.created_at,
      typeLabel: 'Note',
      description: v.body || 'Note',
    }));

    return [...attendanceEvents, ...violationEvents].sort(
      (a, b) => eventSortKey(b) - eventSortKey(a),
    );
  }, [attendanceRecords, violations]);

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
      <div
        id="user-info-print-root"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <h2 className="mb-2 hidden text-base font-semibold text-charcoal print:mb-3 print:block">
          {personName ? `Info — ${personName}` : 'Info'}
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {timeline.map((event) => {
              const detail =
                event.kind === 'attendance' && event.description === event.typeLabel
                  ? null
                  : event.description;
              return (
                <li
                  key={event.id}
                  className="flex min-h-9 items-baseline gap-x-2 py-1.5 text-sm print:items-start"
                >
                  <time
                    dateTime={event.sortAt || undefined}
                    className="w-[5.5rem] shrink-0 tabular-nums text-xs text-gray-500"
                  >
                    {formatEventDate(event.displayDate)}
                  </time>
                  <span
                    className={`w-[6.5rem] shrink-0 truncate text-xs font-semibold print:overflow-visible print:whitespace-normal ${
                      event.kind === 'violation' ? 'text-rose-700' : 'text-slate-700'
                    }`}
                    title={event.typeLabel}
                  >
                    {event.typeLabel}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-sm text-charcoal print:overflow-visible print:whitespace-normal print:break-words"
                    title={detail || undefined}
                  >
                    {detail || '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="user-info-print-hide flex justify-end gap-2 border-t border-gray-200 bg-white px-4 py-2.5">
        <button
          type="button"
          onClick={handlePrint}
          className="admin-btn-muted min-h-11"
        >
          Print
        </button>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="admin-btn min-h-11"
        >
          Add note
        </button>
      </div>

      <AddViolationModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initialUserId={userId}
        users={users}
        onSuccess={fetchData}
      />
    </div>
  );
}

UserViolationsPanel.propTypes = {
  userId: PropTypes.string.isRequired,
  users: PropTypes.arrayOf(PropTypes.object),
  onCountChange: PropTypes.func,
};
