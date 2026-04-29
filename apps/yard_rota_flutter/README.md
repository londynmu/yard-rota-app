# Yard Rota Flutter App

This folder contains a separate Flutter client for shunter-focused flows.

## Scope

- Only Flutter implementation lives in this folder.
- Existing web code in the repository is out of scope.
- User-facing app text must remain in English.

## Hard UI Rules

1. Never use `Color(0x...)` directly in feature widgets.
2. Use only semantic tokens from `lib/core/theme` for colors, spacing, radius, and typography.
3. Build screens from shared components in `lib/core/ui`.
4. Keep touch targets mobile-friendly (`>= 44px`).

## Hard Performance Rules

1. Calendar must use offline-first rendering: read cache first, then refresh in background.
2. Calendar network requests must fetch only month-level data (`currentMonth` and optional adjacent prefetch).
3. Every critical request must use timeout and bounded retry with backoff.
4. Heavy mapping and calculations are forbidden inside `build()` methods.
5. Dynamic grids and lists must use builder widgets.
6. Login must fail fast on unauthorized responses and show retry actions for transient failures.
7. Merge is blocked if SLO checks fail.

## Performance SLO

- Cold start to first interactive screen: `<= 1500ms`
- Login success to calendar visible: `<= 800ms`
- Calendar month switch with cache available: `<= 100ms`

## Folder Layout

- `lib/core/theme` token system and themes
- `lib/core/ui` shared UI components
- `lib/core/network` API abstractions and data models
- `lib/features/*` shunter flows (auth, calendar, my_rota)
- `tool/quality_gate.dart` static checks for hardcoded style regressions
- `docs/merge_checklist.md` merge checklist with performance gates

## Local Quality Commands

```bash
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
dart run tool/perf_slo_check.dart
dart run tool/quality_gate.dart
```

## API Connection

- The Flutter app is connected to the same Supabase backend used by the web app.
- Auth uses `signInWithPassword` and session restore from Supabase Auth.
- Calendar month data is loaded from `scheduled_rota`.
- **My Rota** (Profile → My Rota): weekly roster for a chosen **location** and optional **shift type** filter (`all` / day / afternoon / night). Uses `scheduled_rota` (date range + location + shift filter), `profiles` for names, `locations` for the hub list, and `attendance` for No show / Sick / Late badges and present counts. Week starts on **Saturday** (same convention as the web `WeeklyRotaPage`). Admins can tap a person to update or clear attendance.
- Optional overrides for environment-specific projects:

```bash
flutter run --dart-define=SUPABASE_URL=YOUR_URL --dart-define=SUPABASE_ANON_KEY=YOUR_KEY
```
