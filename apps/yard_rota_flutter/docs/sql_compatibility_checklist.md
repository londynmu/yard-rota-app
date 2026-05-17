# SQL Compatibility Checklist

Use this checklist before merging any Supabase SQL migration that can affect
Flutter or PWA clients.

## Additive-Only Rules

- [ ] No column rename or drop on shared tables (`availability`, `scheduled_rota`).
- [ ] No column type change on shared fields.
- [ ] No new `NOT NULL` column without a safe default.
- [ ] Existing status semantics remain unchanged.

## Policy and Access

- [ ] RLS policies are backward-compatible for authenticated users.
- [ ] Existing client payloads are still accepted.
- [ ] Existing `SELECT/INSERT/UPDATE` patterns still work.

## Validation

- [ ] Flutter flow: read/write `availability` still succeeds.
- [ ] Flutter flow: read `scheduled_rota` still succeeds.
- [ ] PWA baseline flow validation completed on staging.
- [ ] Rollback companion migration prepared (or explicit no-op rationale).
