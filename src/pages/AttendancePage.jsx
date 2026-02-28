import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import AddViolationModal from '../components/Admin/AddViolationModal';

const CATEGORY_LABELS = {
  trailer_check: 'Trailer not checked',
  radio: 'Not listening to radio',
  other: 'Other',
};

/**
 * Black list: users with at least one attendance record (no show / sick / late)
 * or at least one disciplinary violation. Sorted by total count (attendance + violations).
 */
export default function AttendancePage({ users = [] }) {
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
              violations: [],
            };
          }
          const rec = {
            date: rota?.date,
            status: row.status,
            recorded_at: row.recorded_at,
          };
          byUser[uid].records.push(rec);
          if (row.status === 'no_show') byUser[uid].no_show += 1;
          else if (row.status === 'sick') byUser[uid].sick += 1;
          else if (row.status === 'late') byUser[uid].late += 1;
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

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold text-charcoal mb-4">Black list</h2>
        <p className="text-gray-600">No one on the black list.</p>
        <p className="text-sm text-gray-500 mt-2">
          Add attendance marks (no show, sick, late) from the rota or add disciplinary notes from Users.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-charcoal">Black list</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Attendance (no show, sick, late) and disciplinary notes. Sorted by total count.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddModal(null)}
          className="px-4 py-2 rounded-lg bg-charcoal text-white text-sm font-medium hover:bg-black"
        >
          Add violation
        </button>
      </div>

      <div className="space-y-4">
        {grouped.map((row) => (
          <div
            key={row.user_id}
            className="bg-white rounded-xl border-2 border-gray-200 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-bold text-charcoal">
                {row.profile?.first_name || ''} {row.profile?.last_name || ''}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {row.no_show > 0 && (
                  <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-300 text-sm">
                    No show: {row.no_show}
                  </span>
                )}
                {row.sick > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300 text-sm">
                    Sick: {row.sick}
                  </span>
                )}
                {row.late > 0 && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-300 text-sm">
                    Late: {row.late}
                  </span>
                )}
                {(row.violations?.length || 0) > 0 && (
                  <span className="bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full border border-gray-400 text-sm">
                    Violations: {row.violations.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openAddModal(row.user_id)}
                  className="px-3 py-1 rounded-lg bg-charcoal text-white text-xs font-medium hover:bg-black"
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
                        <span className="font-medium capitalize">{r.status.replace('_', ' ')}</span>
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
                  {row.violations.map((v) => (
                    <li key={v.id} className="flex flex-wrap gap-x-2">
                      <span className="text-gray-500">
                        {v.created_at ? format(new Date(v.created_at), 'd MMM yyyy') : '—'}
                      </span>
                      <span>{v.body}</span>
                      {v.category && (
                        <span className="text-gray-500">
                          ({CATEGORY_LABELS[v.category] || v.category})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
};
