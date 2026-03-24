Lighthouse navigation baseline

- Run: npm run lighthouse:nav
- Output: navigation-baseline-summary.json (FCP, LCP, INP, TBT, CLS, etc.)
- Optional full reports: LIGHTHOUSE_FULL_JSON=1 npm run lighthouse:nav
- Override URL: LIGHTHOUSE_BASE_URL=http://localhost:5173 npm run lighthouse:nav
- Override paths: LIGHTHOUSE_PATHS=/calendar,/login npm run lighthouse:nav

Use Navigation mode (this script) for comparable cold-load metrics; do not compare with timespan JSON captures.
