# Impeccable Homepage Audit — Main Page (Web + PWA)

**Final score after harden → adapt → distill → optimize → clarify → typeset → polish: 20/20 (Excellent)**  
**Target:** Main Page (`/calendar`, nav Main Page / bottom Home)  
**Branch:** `fix/impeccable-main-page-audit`  
**Updated:** 2026-11-27 (post-command iteration)

## Score history

| Pass | Total | Notes |
|------|-------|-------|
| Baseline audit | 13/20 | Acceptable — zoom off, no h1, tabs 34px, ARIA gaps, PWA icon/orientation, duplicate h3s |
| After harden→polish | **20/20** | All five dimensions at 4 |

### Audit Health Score (final)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | Zoom on; `h1`; skip link; Primary `aria-current`; user `aria-expanded` + Escape; tabs 44px; closed mobile sidebar `aria-hidden`/`inert` |
| 2 | Performance | 4 | Targeted transitions (no universal `*`); deferred SW; lazy routes; reduced-motion short-circuits chrome transitions |
| 3 | Theming | 4 | Bottom-nav uses slate tokens/`@apply`; light-only intentional; Main Page shell on rota tokens |
| 4 | Responsive Design | 4 | Home tabs ≥44px; safe-area; PWA `orientation: any`; dual mobile/desktop Main Page |
| 5 | Implementation Integrity | 4 | Quick-link labels are spans; one stats rail mounted; PWA icons split `any` / `maskable`; detector primary-clean |
| **Total** | | **20/20** | **Excellent** |

## What each command changed

### 1. `/impeccable harden`
- Removed `user-scalable=no` from `index.html` viewport
- Added `h1.sr-only` “Main Page” + `id="main-content"`
- Skip link “Skip to main content”
- Bottom + desktop Primary nav: `aria-label="Primary"`, `aria-current="page"`
- User menu: `aria-expanded` + Escape to close
- Hamburger: `aria-label="Open menu"`, `aria-expanded`, `aria-controls`
- Admin sidebar: when closed on narrow screens → `aria-hidden` + `inert` + invisible

### 2. `/impeccable adapt`
- Home tabs `min-h-11` / taller padding → measured **44px** height
- Bottom nav icons `min-height: 2.75rem`
- PWA manifest: `orientation: any`; separate icon purposes (`any` + `maskable` + 192 entry)

### 3. `/impeccable distill`
- Admin quick links: `h3` → `span` (not fake headings)
- Mount **one** shunter-stats / quick-nav rail via `matchMedia(min-width: 1024px)` (no duplicate DOM)

### 4. `/impeccable optimize`
- Replaced global `* { transition }` with targeted `a, button, .bottom-nav-icon, .card-modern, .glass-card`
- `prefers-reduced-motion: reduce` zeroes those durations (not a page-wide 0.01ms nuke)

### 5. `/impeccable clarify`
- PWA install benefit: honest offline copy (shell vs live data)
- Offline status banner on Main Page when `navigator.onLine === false`

### 6. `/impeccable typeset`
- Bottom nav labels `text-[10px]` → `text-xs`
- TodayShiftSummaryCard `text-[11px]` → `text-xs`

### 7. `/impeccable polish`
- Bottom-nav colours → slate `@apply` / RGB alpha tokens
- Skip-link focus affordance
- Re-verified logged-in Main Page (IDE browser CDP): h1, viewport, tabs 44px, Home `aria-current`, sidebar hidden when closed on mobile

## Commands that did not regress
No command broke layout in the logged-in Main Page check. Distill required a follow-up (conditional mount) after span-only change because CSS-hidden twins still duplicated “Total shunters” in the a11y tree at mid widths.

## Remaining notes (not score blockers)
- Admin sidebar still has advisory `text-[13px]` off DESIGN.md ramp (outside Main Page chrome score drivers)
- Real dedicated 192×192 PNG asset is still the 512 file referenced at 192 — split purpose is fixed; a true 192 asset would be nicer later
- Changes are on branch `fix/impeccable-main-page-audit` (not committed unless you ask)

## Recommended Actions (complete)
All mapped audit actions for this surface were applied. Re-run `/impeccable audit` after any further visual change to confirm the score holds.
