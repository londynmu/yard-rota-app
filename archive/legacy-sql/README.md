# Legacy SQL — DO NOT RUN ON PRODUCTION

These folders are **historical only**. They are not the source of truth for the live database.

**Do not** paste any of these scripts into the Supabase SQL Editor on production.

## Canonical migrations

All schema changes go only through:

```
supabase/migrations/
```

Apply them through the normal migration workflow (after owner approval on production). Account deletion uses the app / `delete_own_account` RPC — never the scripts under `dangerous/`.

## Layout

| Path | What |
|------|------|
| `sql/` | Old ad-hoc SQL (RPCs, tracking, one-off fixes) |
| `migrations/` | Old root-level RLS/index scripts (not Supabase CLI migrations) |
| `database/` | Old setup README + schema snapshot with “paste into SQL Editor” instructions |
| `dangerous/` | Scripts that delete specific users or grant admin — never run |

`archive/sql/` elsewhere in the repo is also historical; same rule applies.
