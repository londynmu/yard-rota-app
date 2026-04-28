# DB Impact

## Supabase Impact

No Supabase schema or RLS changes are required in this phase.

- Shared tables used:
  - `availability`
  - `scheduled_rota`
- Contract policy:
  - Existing payload structure is unchanged.
  - Existing status values are unchanged.

## Local SQLite Impact (Flutter only)

New local tables in app storage:

- `calendar_month_meta`
- `calendar_shift_local`
- `availability_local`
- `sync_outbox`

These tables are private to Flutter runtime and do not affect PWA behavior.

## Compatibility Assessment

- PWA compatibility risk: **low** (no backend schema modifications in this batch).
- Flutter backward compatibility: **medium** (new local persistence path, covered by tests).
- Required gate before future SQL migration:
  - `docs/sql_compatibility_checklist.md` must be completed.
