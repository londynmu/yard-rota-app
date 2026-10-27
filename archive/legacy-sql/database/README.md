# Legacy database notes — DO NOT RUN ON PRODUCTION

This folder is archived. It is **not** how the live Yard Rota database is managed.

**Do not** paste `schema.sql`, `seed.sql`, or any other file here into the Supabase SQL Editor on production.

Use only:

- `supabase/migrations/` for schema changes (after owner approval on production)
- The in-app admin flows / `delete_own_account` for account removal

See `archive/legacy-sql/README.md`.
