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

  const selected = grouped.find((row) => row.user_id === expandedUserId) || null;

  if (grouped.length === 0) {
    return (
      <div className="space-y-4">
        {pageIntro}
        <p className="text-sm text-gray-500">No attendance records yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 md:hidden">
        {pageIntro}

        <div className="space-y-2">
          {grouped.map((row) => {
            const expanded = expandedUserId === row.user_id;
            const name = personName(row);
            const records = sortedRecords(row);
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

      <div className={`hidden h-full min-h-0 w-full md:flex md:flex-row md:gap-4`}>
        <div className={`flex h-full min-h-0 w-full min-w-0 flex-col ${selected ? 'md:flex-1 md:basis-0' : 'max-w-lg'}`}>
          <div className="mb-3 shrink-0">
            <h2 className="text-base font-semibold text-slate-800">Attendance</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {grouped.length} {grouped.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
            {grouped.map((row) => {
              const name = personName(row);
              const isSelected = selected?.user_id === row.user_id;
              return (
                <button
                  key={row.user_id}
                  type="button"
                  onClick={() => toggleRow(row.user_id)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`admin-section-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                    isSelected ? 'ring-2 ring-slate-200' : ''
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{summaryLine(row)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <AttendanceDetail
            row={selected}
            onOpen={() => openUser(selected.user_id)}
          />
        )}
      </div>
    </>
  );
}

function personName(row) {
  return `${row.profile?.first_name || ''} ${row.profile?.last_name || ''}`.trim() || 'Unknown';
}

function sortedRecords(row) {
  return [...(row.records || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function summaryLine(row) {
  const parts = [];
  if (row.no_show > 0) parts.push(`No show ${row.no_show}`);
  if (row.sick > 0) parts.push(`Sick ${row.sick}`);
  if (row.late > 0) parts.push(`Late ${row.late}`);
  if (row.other > 0) parts.push(`Other ${row.other}`);
  if (row.violations?.length) parts.push(`${row.violations.length} notes`);
  return parts.join(' · ') || 'No records';
}

function statusTone(status) {
  if (status === 'no_show') return 'bg-rose-50 text-rose-700';
  if (status === 'sick') return 'bg-amber-50 text-amber-800';
  if (status === 'late') return 'bg-sky-50 text-sky-700';
  return 'bg-slate-100 text-slate-600';
}

function AttendanceDetail({ row, onOpen }) {
  const name = personName(row);
  const records = sortedRecords(row);
  const counts = [
    ['No show', row.no_show, 'bg-rose-50 text-rose-700'],
    ['Sick', row.sick, 'bg-amber-50 text-amber-800'],
    ['Late', row.late, 'bg-sky-50 text-sky-700'],
    ['Other', row.other, 'bg-slate-100 text-slate-600'],
    ['Notes', row.violations?.length || 0, 'bg-violet-50 text-violet-700'],
  ].filter(([, count]) => count > 0);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-800">{name}</h2>
          <p className="truncate text-xs text-slate-500">{summaryLine(row)}</p>
        </div>
        <button type="button" onClick={onOpen} className="admin-btn shrink-0">
          Open on Users
        </button>
      </div>

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
          {counts.map(([label, count, tone]) => (
            <span key={label} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
              {label} {count}
            </span>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {records.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-500">Records</h3>
            <ul className="space-y-1">
              {records.map((record, index) => (
                <li
                  key={`${record.date}-${record.status}-${index}`}
                  className="flex items-start gap-3 rounded-lg px-2 py-2"
                >
                  <span className="w-28 shrink-0 text-sm text-slate-500">
                    {record.date ? format(new Date(record.date), 'd MMM yyyy') : '—'}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(record.status)}`}>
                    {attendanceLabel(record.status) || record.status}
                  </span>
                  {record.note ? (
                    <span className="min-w-0 text-sm text-slate-500">{record.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}

        {row.violations?.length > 0 && (
          <section className={records.length > 0 ? 'mt-6' : ''}>
            <h3 className="mb-2 text-sm font-medium text-slate-500">Notes</h3>
            <ul className="space-y-2">
              {row.violations.map((violation) => (
                <li key={violation.id} className="rounded-lg px-2 py-2">
                  <p className="text-xs text-slate-400">
                    {violation.created_at ? format(new Date(violation.created_at), 'd MMM yyyy') : '—'}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">{violation.body}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {records.length === 0 && !(row.violations?.length > 0) && (
          <p className="text-sm text-slate-500">No records for this person.</p>
        )}
      </div>
    </div>
  );
}

AttendanceDetail.propTypes = {
  row: PropTypes.object.isRequired,
  onOpen: PropTypes.func.isRequired,
};

AttendancePage.propTypes = {
  onOpenUserViolations: PropTypes.func,
};
