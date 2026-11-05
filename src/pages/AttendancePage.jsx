import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import AddViolationModal from '../components/Admin/AddViolationModal';
import { attendanceLabel } from '../utils/attendanceStatus';

/**
 * Black list overview: users with attendance records and/or disciplinary notes.
 * Detail editing lives on Admin Users → Violations tab (deep-link via onOpenUserViolations).
 */
export default function AttendancePage({ users = [], onOpenUserViolations }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grouped, setGrouped] = useState([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalUserId, setAddModalUserId] = useState(null);

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
      console.error('Error fetching black list:', e);
      setError(e.message || 'Failed to load data');
      setGrouped([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = (userId) => {
    setAddModalUserId(userId ?? null);
    setAddModalOpen(true);
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

  if (grouped.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-charcoal">Black list</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              No one on the black list.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openAddModal(null)}
            className="admin-btn"
          >
            Add violation
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Add attendance marks (no show, sick, late, other) from the rota or open a user on Users → Violations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-charcoal">Black list</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Overview of attendance and disciplinary notes. Open a person to manage details on Users.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddModal(null)}
          className="admin-btn-muted"
        >
          Add violation
        </button>
      </div>

      <div className="space-y-3">
        {grouped.map((row) => (
          <div
            key={row.user_id}
            className="admin-section-card"
          >
            <div className="admin-section-body">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => openUser(row.user_id)}
                  className="font-bold text-charcoal text-left hover:underline"
                >
                  {row.profile?.first_name || ''} {row.profile?.last_name || ''}
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {row.no_show > 0 && (
                    <span className="admin-chip !h-7 text-xs cursor-default">
                      No show: {row.no_show}
                    </span>
                  )}
                  {row.sick > 0 && (
                    <span className="admin-chip !h-7 text-xs cursor-default">
                      Sick: {row.sick}
                    </span>
                  )}
                  {row.late > 0 && (
                    <span className="admin-chip !h-7 text-xs cursor-default">
                      Late: {row.late}
                    </span>
                  )}
                  {row.other > 0 && (
                    <span className="admin-chip !h-7 text-xs cursor-default">
                      Other: {row.other}
                    </span>
                  )}
                  {(row.violations?.length || 0) > 0 && (
                    <span className="admin-chip admin-chip-active !h-7 text-xs cursor-default">
                      Violations: {row.violations.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openUser(row.user_id)}
                    className="admin-btn"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddModal(row.user_id)}
                    className="admin-btn-muted"
                  >
                    Add violation
                  </button>
                </div>
              </div>

              {row.records && row.records.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">Attendance</h4>
                  <ul className="text-sm text-gray-600 space-y-0.5">
                    {row.records
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 20)
                      .map((r, i) => (
                        <li key={i}>
                          {r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'} —{' '}
                          <span className="font-medium">{attendanceLabel(r.status) || r.status}</span>
                          {r.note && <span className="text-gray-500"> — {r.note}</span>}
                        </li>
                      ))}
                  </ul>
                  {row.records.length > 20 && (
                    <p className="text-xs text-gray-500 mt-1">+ {row.records.length - 20} more</p>
                  )}
                </div>
              )}

              {row.violations && row.violations.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-gray-500 mb-1">Disciplinary notes</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {row.violations.slice(0, 5).map((v) => (
                      <li key={v.id} className="flex flex-wrap gap-x-2">
                        <span className="text-gray-500">
                          {v.created_at ? format(new Date(v.created_at), 'd MMM yyyy') : '—'}
                        </span>
                        <span>{v.body}</span>
                      </li>
                    ))}
                  </ul>
                  {row.violations.length > 5 && (
                    <p className="text-xs text-gray-500 mt-1">
                      + {row.violations.length - 5} more — Open for full list
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <AddViolationModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        initialUserId={addModalUserId}
        users={users}
        onSuccess={fetchData}
      />
    </div>
  );
}

AttendancePage.propTypes = {
  users: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      first_name: PropTypes.string,
      last_name: PropTypes.string,
    })
  ),
  onOpenUserViolations: PropTypes.func,
};
