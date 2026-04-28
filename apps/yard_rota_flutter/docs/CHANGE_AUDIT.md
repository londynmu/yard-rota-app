# Change Audit

## Scope

Offline-first foundation for Flutter app only (`apps/yard_rota_flutter`).

## Files Changed

- `.cursor/rules/flutter-offline-first.mdc`
  - Adds hard offline-first policy and SQL safety constraints.
- `apps/yard_rota_flutter/pubspec.yaml`
  - Adds `drift`, `sqlite3_flutter_libs`, `path_provider`, and `path`.
- `apps/yard_rota_flutter/lib/core/local_db/app_local_database.dart`
  - Introduces local SQLite persistence for calendar, availability, and outbox.
- `apps/yard_rota_flutter/lib/features/calendar/data/calendar_repository.dart`
  - Refactors read path to local-first and async network refresh.
- `apps/yard_rota_flutter/lib/features/calendar/data/availability_repository.dart`
  - Implements local-first load, outbox enqueue, and retry-based sync flush.
- `apps/yard_rota_flutter/lib/features/calendar/presentation/calendar_screen.dart`
  - Separates calendar and availability failure handling (partial failure isolation).
- `apps/yard_rota_flutter/lib/app.dart`
  - Wires local DB and adds lifecycle-triggered outbox sync.
- `apps/yard_rota_flutter/lib/main.dart`
  - Initializes persistent local DB before app start.
- `apps/yard_rota_flutter/tool/quality_gate.dart`
  - Adds required documentation checks for SQL compatibility and rollback artifacts.
- `apps/yard_rota_flutter/docs/supabase_migration_inventory.md`
  - Baseline migration inventory.
- `apps/yard_rota_flutter/docs/sql_compatibility_checklist.md`
  - Checklist for zero-break SQL rollout.
- `apps/yard_rota_flutter/docs/DB_IMPACT.md`
  - Database impact assessment.
- `apps/yard_rota_flutter/docs/ROLLBACK_PLAYBOOK.md`
  - Rollback procedures for code and DB.
- `apps/yard_rota_flutter/test/offline_first/local_db_test.dart`
  - Unit tests for local DB persistence and outbox behavior.
- `apps/yard_rota_flutter/test/offline_first/availability_repository_test.dart`
  - Unit tests for local-first save and outbox sync behavior.

## Why

- Guarantee instant local writes and reads.
- Keep app usable offline.
- Preserve backward compatibility with existing Supabase contracts and PWA.
