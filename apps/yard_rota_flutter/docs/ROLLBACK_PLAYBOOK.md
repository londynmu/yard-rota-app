# Rollback Playbook

## Owner and Decision Points

- Owner: mobile engineer on release duty.
- Stop/Go checkpoints:
  - build + test gate
  - staging smoke test
  - production health check after release

## Code Rollback

1. Identify release commit SHA.
2. Revert commit(s):
   - `git revert <sha>`
3. Run validation:
   - `flutter analyze`
   - `flutter test`
   - `flutter test integration_test -d flutter-tester`
4. Redeploy reverted build.

## Local DB Rollback (Client-Side)

This phase introduces additive local tables only.
Rollback strategy:

1. Revert Flutter code.
2. Let older code ignore the local DB file.
3. If needed, trigger app logout + local cleanup path to clear local tables.

## Supabase Rollback

No Supabase migration is included in this phase.

For future SQL batches, each migration must define one of:

- explicit no-op rollback rationale, or
- compensating migration script (non-destructive).

## Verification After Rollback

- Login flow works.
- Calendar month screen loads.
- Availability modal opens and saves.
- No regression in PWA baseline checks.
