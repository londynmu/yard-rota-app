import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import { attendanceLabel } from '../utils/attendanceStatus';

/**
 * Attendance overview: users with attendance records and/or disciplinary notes.
 * Detail editing lives on Admin Users → Violations tab (deep-link via onOpenUserViolations).
 */
export default function AttendancePage({ onOpenUserViolations }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const byUser = {};

      // 1) Attendance
      const { data: attendanceData, error: attError } = await supabase
        .from('attendance')
        .select('scheduled_rota_id, status, recorded_at');

      if (attError) throw attError;

      if (attendanceData && attendanceData.length > 0) {
        const rotaIds = [...new Set(attendanceData.map((a) => a.scheduled_rota_id))];
        const { data: rotaData, error: rotaError } = await supabase
          .from('scheduled_rota')
          .select('id, user_id, date')
          .in('id', rotaIds);

        if (rotaError) throw rotaError;
        const rotaMap = (rotaData || []).reduce((acc, r) => {
          acc[r.id] = r;
          return acc;
        }, {});

        const { data: notesData, error: notesError } = await supabase
          .from('attendance_notes')
          .select('scheduled_rota_id, note')
          .in('scheduled_rota_id', rotaIds);
        if (notesError) console.warn('[AttendancePage] Could not load attendance notes:', notesError);
        const noteByRotaId = (notesData || []).reduce((acc, n) => {
          acc[n.scheduled_rota_id] = n.note;
          return acc;
        }, {});

        const attUserIds = [...new Set(attendanceData.map((a) => rotaMap[a.scheduled_rota_id]?.user_id).filter(Boolean))];
        let profilesMap = {};
        if (attUserIds.length > 0) {
          const { data: profilesData, error: profError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', attUserIds);
          if (profError) throw profError;
          profilesMap = (profilesData || []).reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }

        attendanceData.forEach((row) => {
          const rota = rotaMap[row.scheduled_rota_id];
          const uid = rota?.user_id;
          if (!uid) return;
          if (!byUser[uid]) {
            byUser[uid] = {
              user_id: uid,
              profile: profilesMap[uid] || { first_name: 'Unknown', last_name: '' },
              records: [],
              no_show: 0,
              sick: 0,
              late: 0,
              other: 0,
              violations: [],
            };
          }
          const rec = {
            date: rota?.date,
            status: row.status,
            note: noteByRotaId[row.scheduled_rota_id] || null,
            recorded_at: row.recorded_at,
          };
          byUser[uid].records.push(rec);
          if (row.status === 'no_show') byUser[uid].no_show += 1;
          else if (row.status === 'sick') byUser[uid].sick += 1;
          else if (row.status === 'late') byUser[uid].late += 1;
          else if (row.status === 'other') byUser[uid].other += 1;
        });
      }

      // 2) Violations
      const { data: violationsData, error: violError } = await supabase
        .from('shunter_violations')
        .select('id, user_id, body, category, created_at')
        .order('created_at', { ascending: false });

      if (violError) throw violError;

      const violationUserIds = violationsData ? [...new Set(violationsData.map((v) => v.user_id))] : [];
      const needProfileIds = violationUserIds.filter((id) => !byUser[id]);
      if (needProfileIds.length > 0) {
        const { data: profilesData, error: profError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', needProfileIds);
        if (profError) throw profError;
        const extraProfiles = (profilesData || []).reduce((acc, p) => {
          acc[p.id] = p;
          return acc;
        }, {});
        needProfileIds.forEach((uid) => {
          if (!byUser[uid]) {
            byUser[uid] = {
              user_id: uid,
              profile: extraProfiles[uid] || { first_name: 'Unknown', last_name: '' },
              records: [],
              no_show: 0,
              sick: 0,
              late: 0,
              other: 0,
              violations: [],
            };
          }
        });
      }

      if (violationsData) {
        violationsData.forEach((v) => {
          if (!byUser[v.user_id]) return;
          byUser[v.user_id].violations.push(v);
        });
      }

      const list = Object.values(byUser).map((u) => ({
        ...u,
        total: u.records.length + (u.violations?.length || 0),
      }));
      list.sort((a, b) => b.total - a.total);

      setGrouped(list);
    } catch (e) {
      console.error('Error fetching attendance:', e);
      setError(e.message || 'Failed to load data');
      setGrouped([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleRow = (userId) => {
    setExpandedUserId((current) => (current === userId ? null : userId));
  };

  const openUser = (userId) => {
    if (onOpenUserViolations) {
      onOpenUserViolations(userId);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const pageIntro = (
    <div>
      <h2 className="text-lg font-semibold text-charcoal">Attendance</h2>
      <p className="mt-0.5 text-sm text-gray-600">
        Absences and disciplinary notes. Open a person to manage details on Users.
      </p>
    </div>
  );

  if (grouped.length === 0) {
    return (
      <div className="space-y-4">
        {pageIntro}
        <p className="text-sm text-gray-500">No attendance records yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pageIntro}

      <div className="space-y-2">
        {grouped.map((row) => {
          const expanded = expandedUserId === row.user_id;
          const name = `${row.profile?.first_name || ''} ${row.profile?.last_name || ''}`.trim() || 'Unknown';
          const records = [...(row.records || [])].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );
          return (
            <div key={row.user_id} className="admin-section-card">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleRow(row.user_id)}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="truncate font-semibold text-charcoal">{name}</span>
                  <span className="ml-auto flex flex-wrap justify-end gap-2">
                    {row.no_show > 0 && (
                      <span className="admin-chip !h-7 cursor-default text-xs">No show: {row.no_show}</span>
                    )}
                    {row.sick > 0 && (
                      <span className="admin-chip !h-7 cursor-default text-xs">Sick: {row.sick}</span>
                    )}
                    {row.late > 0 && (
                      <span className="admin-chip !h-7 cursor-default text-xs">Late: {row.late}</span>
                    )}
                    {row.other > 0 && (
                      <span className="admin-chip !h-7 cursor-default text-xs">Other: {row.other}</span>
                    )}
                    {(row.violations?.length || 0) > 0 && (
                      <span className="admin-chip admin-chip-active !h-7 cursor-default text-xs">
                        Violations: {row.violations.length}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openUser(row.user_id)}
                  className="admin-btn shrink-0"
                >
                  Open
                </button>
              </div>

              {expanded && (
                <div className="space-y-3 border-t border-gray-200 px-4 py-3">
                  {records.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Attendance</h4>
                      <ul className="space-y-0.5 text-sm text-gray-600">
                        {records.slice(0, 20).map((record, index) => (
                          <li key={`${record.date}-${record.status}-${index}`}>
                            {record.date ? format(new Date(record.date), 'd MMM yyyy') : '—'} —{' '}
                            <span className="font-medium">{attendanceLabel(record.status) || record.status}</span>
                            {record.note && <span className="text-gray-500"> — {record.note}</span>}
                          </li>
                        ))}
                      </ul>
                      {records.length > 20 && (
                        <p className="mt-1 text-xs text-gray-500">+ {records.length - 20} more</p>
                      )}
                    </div>
                  )}

                  {row.violations && row.violations.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">Disciplinary notes</h4>
                      <ul className="space-y-1 text-sm text-gray-600">
                        {row.violations.slice(0, 5).map((violation) => (
                          <li key={violation.id} className="flex flex-wrap gap-x-2">
                            <span className="text-gray-500">
                              {violation.created_at ? format(new Date(violation.created_at), 'd MMM yyyy') : '—'}
                            </span>
                            <span>{violation.body}</span>
                          </li>
                        ))}
                      </ul>
                      {row.violations.length > 5 && (
                        <p className="mt-1 text-xs text-gray-500">
                          + {row.violations.length - 5} more — Open for the full list
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

AttendancePage.propTypes = {
  onOpenUserViolations: PropTypes.func,
};
