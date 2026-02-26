import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';

/**
 * Admin page: list of people with at least one attendance record (no show / sick / late),
 * with dates and counts per status.
 */
export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [grouped, setGrouped] = useState([]);

  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: attendanceData, error: attError } = await supabase
          .from('attendance')
          .select('scheduled_rota_id, status, recorded_at');

        if (attError) throw attError;

        if (!attendanceData || attendanceData.length === 0) {
          setGrouped([]);
          setLoading(false);
          return;
        }

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

        const userIds = [...new Set(attendanceData.map((a) => rotaMap[a.scheduled_rota_id]?.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length > 0) {
          const { data: profilesData, error: profError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
          if (profError) throw profError;
          profilesMap = (profilesData || []).reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }

        const byUser = {};
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

        const list = Object.values(byUser).map((u) => ({
          ...u,
          total: u.records.length,
        }));
        list.sort((a, b) => {
          const aName = `${a.profile?.last_name || ''} ${a.profile?.first_name || ''}`.trim();
          const bName = `${b.profile?.last_name || ''} ${b.profile?.first_name || ''}`.trim();
          return aName.localeCompare(bName);
        });

        setGrouped(list);
      } catch (e) {
        console.error('Error fetching attendance:', e);
        setError(e.message || 'Failed to load attendance data');
        setGrouped([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading attendance records…</p>
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
        <h2 className="text-lg font-semibold text-charcoal mb-4">Attendance</h2>
        <p className="text-gray-600">No attendance records.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-charcoal mb-4">Attendance</h2>
      <p className="text-sm text-gray-600 mb-4">
        People with at least one no show, sick or late mark. Default is present (no record).
      </p>
      <div className="space-y-4">
        {grouped.map((user) => (
          <div
            key={user.user_id}
            className="bg-white rounded-xl border-2 border-gray-200 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-charcoal">
                {user.profile?.first_name || ''} {user.profile?.last_name || ''}
              </h3>
              <div className="flex flex-wrap gap-2 text-sm">
                {user.no_show > 0 && (
                  <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-300">
                    No show: {user.no_show}
                  </span>
                )}
                {user.sick > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
                    Sick: {user.sick}
                  </span>
                )}
                {user.late > 0 && (
                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-300">
                    Late: {user.late}
                  </span>
                )}
              </div>
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              {user.records
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 20)
                .map((r, i) => (
                  <li key={i}>
                    {r.date ? format(new Date(r.date), 'd MMM yyyy') : '—'} —{' '}
                    <span className="font-medium capitalize">{r.status.replace('_', ' ')}</span>
                  </li>
                ))}
            </ul>
            {user.records.length > 20 && (
              <p className="text-xs text-gray-500 mt-2">+ {user.records.length - 20} more</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
