import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { attendanceLabel } from '../../utils/attendanceStatus';
import AddViolationModal from './AddViolationModal';

const CATEGORY_LABELS = {
  trailer_check: 'Trailer not checked',
  radio: 'Not listening to radio',
  other: 'Other',
};

/**
 * Per-user attendance + disciplinary notes for Admin Users → Attendance & Violations.
 * Loads attendance by snapshot user_id (survives rota unassign) plus shunter_violations.
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
        date: a.date || rotaDateMap[a.scheduled_rota_id] || null,
        status: a.status,
        note: noteByAttendanceId[a.id] || null,
      }));
      setAttendanceRecords(attList);

      const { data: violData, error: violErr } = await supabase
        .from('shunter_violations')
        .select('id, body, category, created_at')
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
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
      <p className="text-sm text-gray-600">
        Attendance marks and disciplinary notes for this person.
      </p>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Attendance
        </h3>
        {attendanceRecords.length === 0 ? (
          <p className="text-sm text-gray-500">No attendance records.</p>
        ) : (
          <ul className="text-sm text-charcoal space-y-1.5">
            {attendanceRecords.map((r, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-gray-500">
                  {r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'}
                </span>
                <span className="font-medium">{attendanceLabel(r.status) || r.status}</span>
                {r.note && <span className="text-gray-500">— {r.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Disciplinary notes
        </h3>
        {violations.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {violations.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-charcoal"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mb-1">
                  <span>
                    {v.created_at ? format(new Date(v.created_at), 'd MMM yyyy') : '—'}
                  </span>
                  {v.category && (
                    <span>· {CATEGORY_LABELS[v.category] || v.category}</span>
                  )}
                </div>
                <p className="text-sm text-charcoal whitespace-pre-wrap break-words">{v.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      <div className="flex justify-end border-t border-gray-200 bg-white px-5 py-3">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="admin-btn min-h-11"
        >
          Add violation
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
