# Rota: max consecutive work days — rollout and QA

## What was added

- **Settings** (`public.settings`): `enforce_max_consecutive_work_days` (default `false`), `max_consecutive_work_days` (default `6`).
- **Database**: partial index `idx_scheduled_rota_user_id_date`, trigger `trg_scheduled_rota_consecutive_work_days` calling `scheduled_rota_enforce_consecutive_work_days()` on `BEFORE INSERT OR UPDATE OF user_id, date` on `scheduled_rota`.
- **Admin UI**: Settings → **Rota** tab (toggle + max days, English copy). Rota planner pre-check in `RotaManager.jsx` when enforcement is on.

Enforcement uses **calendar days** with at least one assigned row in `scheduled_rota` for that `user_id`. Multiple slots on the same day count as one day.

## Live database rollout

1. Prefer a **low-traffic** window (migration is quick; default leaves enforcement **off**).
2. Apply the migration file: [`supabase/migrations/20260505120000_scheduled_rota_consecutive_work_days.sql`](../supabase/migrations/20260505120000_scheduled_rota_consecutive_work_days.sql) via Supabase CLI or SQL Editor.
3. Verify defaults:

   ```sql
   SELECT key, value FROM public.settings
   WHERE key IN ('enforce_max_consecutive_work_days', 'max_consecutive_work_days');
   ```

   Expect `enforce_max_consecutive_work_days` = `false`.

4. Smoke-test with enforcement **still off**: assign staff as usual (no change).
5. Turn **Enforce max consecutive work days** on in Admin → Settings → Rota only after smoke-test.
6. Optional: confirm trigger exists:

   ```sql
   SELECT tgname FROM pg_trigger
   WHERE tgrelid = 'public.scheduled_rota'::regclass
     AND tgname = 'trg_scheduled_rota_consecutive_work_days';
   ```

## Rollback (emergency)

Run in SQL (order matters):

```sql
DROP TRIGGER IF EXISTS trg_scheduled_rota_consecutive_work_days ON public.scheduled_rota;
DROP FUNCTION IF EXISTS public.scheduled_rota_enforce_consecutive_work_days();
-- Optional: remove index if you want to revert that too
-- DROP INDEX IF EXISTS public.idx_scheduled_rota_user_id_date;
```

Settings rows can remain; set `enforce_max_consecutive_work_days` to `false` to disable without dropping the function.

## Manual QA checklist

| Step | Enforcement | Action | Expected |
|------|----------------|--------|----------|
| 1 | Off | Assign same person 7+ calendar days in a row | Allowed (unchanged behaviour). |
| 2 | On, max 6 | Assign through 6 consecutive days, then assign the 7th | Blocked; English error about maximum consecutive calendar days. |
| 3 | On, max 6 | 6 consecutive days, skip one calendar day, assign next | Allowed. |
| 4 | On | Remove assignment (`user_id` cleared) | No error from this trigger. |
| 5 | On | Any path that updates only `start_time` / `end_time` (same `user_id`, `date`) | Trigger does not run from column list; streak unchanged. |

If the app uses **RPC or other clients** that `INSERT`/`UPDATE` `scheduled_rota` with a non-null `user_id`, the trigger applies the same rule as the admin planner.

## Notes

- **Existing** rows in `scheduled_rota` are **not** backfilled or cleaned up; the rule only blocks **new** violations.
- Overnight shifts are **not** split across two calendar days unless you store two rows with two `date` values; that is a separate product decision.
