# Flutter MVP Merge Checklist

## Scope Guard

- [ ] Changes are limited to `apps/yard_rota_flutter/**`.
- [ ] User-facing strings are in English.

## Hard UI Rules

- [ ] No `Color(0x...)` in feature widgets.
- [ ] No magic style values for spacing/radius/typography in feature widgets.
- [ ] Shared UI components are reused for feature pages.

## Hard Performance Rules

- [ ] Calendar renders cached data first when available.
- [ ] Calendar requests are month scoped only.
- [ ] Critical requests use timeout + bounded retry policy.
- [ ] No heavy data transforms inside widget `build()`.
- [ ] Grid/list rendering uses `GridView.builder`/`ListView.builder`.

## Performance SLO Validation

- [ ] Cold start first interactive screen is `<= 1500ms`.
- [ ] Login success to calendar visible is `<= 800ms`.
- [ ] Month switch from cache is `<= 100ms`.

## Quality Gates

- [ ] `dart format --output=none --set-exit-if-changed .`
- [ ] `flutter analyze`
- [ ] `flutter test`
- [ ] `dart run tool/perf_slo_check.dart`
- [ ] `dart run tool/quality_gate.dart`
