# Impeccable Audit — My Rota (Web + PWA)

**Route:** `/my-rota`  
**Component:** `src/pages/WeeklyRotaPage.jsx` (~1397 lines)  
**Surfaces:** Desktop week grid + mobile sticky filters / day accordions (same page; PWA uses same shell)  
**Evidence:** `impeccable detect` on source; logged-in IDE browser CDP + screenshots `my-rota-desktop.png` / `my-rota-mobile.png`  
**Date:** 2026-11-27  
**Mode:** Audit only (no code changes)

### Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Shell `h1` still says “Main Page”; mobile filters ~34px; admin slots `role="button"` without keyboard |
| 2 | Performance | 2 | Very large page module; admin view floods DOM with hundreds of `role="button"` list items |
| 3 | Theming | 2 | Detector: indigo→violet AI gradient on Shift filter; many `text-[10px]`/`[11px]` |
| 4 | Responsive Design | 3 | Strong 1→7 col grid + mobile accordion; filter chips undersized on phone |
| 5 | Implementation Integrity | 2 | `card-modern` / shift tones OK; indigo-violet + custom portal modals drift from project Modal/filter patterns |
| **Total** | | **11/20** | **Acceptable** |

### Implementation Integrity Verdict
**Fail (narrow).** My Rota is recognisably Yard Rota (week cards, shift bands, “Your shifts this week”), but the Shift filter’s indigo–violet gradient trips the AI-palette detector and fights DESIGN.md’s “no purple-indigo” rule. Shared shell `h1` (“Main Page”) on `/my-rota` is a product-integrity miss for this surface. Prefer existing `Modal` / filter-bar patterns over one-off portal sheets.

### Executive Summary
- Score: **11/20** (Acceptable)
- Issues: **0 P0** / **5 P1** / **5 P2** / **2 P3**
- Top: wrong page `h1`; mobile filter targets; admin `li role=button` without keyboard; indigo-violet Shift chip; oversized page / DOM for admin
- Next: `/impeccable harden`, `/impeccable adapt`, `/impeccable quieter` or `/impeccable colorize` (re-token Shift chip), `/impeccable optimize`, `/impeccable typeset`, `/impeccable polish`

### Detailed Findings by Severity

#### [P1] Document `h1` is “Main Page” on My Rota
- **Location:** Global shell `HomePage.jsx` `h1.sr-only` (always “Main Page”); My Rota has `h2` “Your shifts this week” only
- **Category:** Accessibility / Integrity
- **Impact:** SR/landmark title wrong for `/my-rota` (verified CDP mobile+desktop).
- **WCAG:** 2.4.6; 1.3.1
- **Recommendation:** Page-specific `h1` (“My Rota”) or shell title driven by route.
- **Suggested command:** `/impeccable harden`

#### [P1] Mobile Week / Location / Shift filters ~34px tall, no disclosure semantics
- **Location:** `#weekly-top-nav` buttons (~1134–1161); CDP 390px: height 34, no `aria-expanded` / `aria-haspopup`
- **Category:** Accessibility / Responsive (PWA + mobile web)
- **Impact:** Miss-taps; SR users don’t hear that a picker opens.
- **WCAG:** 2.5.5; 4.1.2
- **Recommendation:** `min-h-11`; `aria-haspopup="dialog"` + `aria-expanded` bound to modal open state.
- **Suggested command:** `/impeccable adapt` + `/impeccable harden`

#### [P1] Desktop header filter chips ~24px hit height
- **Location:** Portal into `#my-rota-desktop-filters` (~1059–1068): `px-1 py-0.5`
- **Category:** Accessibility / Responsive
- **Impact:** Hard to click precisely; weak vs Operate touch/pointer target bar.
- **Recommendation:** Larger padding / `min-h-11` consistent with other header controls.
- **Suggested command:** `/impeccable adapt`

#### [P1] Admin attendance rows: `li role="button"` without keyboard support
- **Location:** `ShiftSection` (~804–808): `role={isAdmin ? 'button' : undefined}`, `onClick` only — no `tabIndex`, no Enter/Space
- **Category:** Accessibility
- **Impact:** CDP saw **263** `[role=button]` nodes for admin; keyboard users cannot activate attendance.
- **WCAG:** 2.1.1 Keyboard; 4.1.2
- **Recommendation:** Real `<button>` per row, or `tabIndex={0}` + keydown; reduce role noise.
- **Suggested command:** `/impeccable harden`

#### [P1] Shift filter uses indigo→violet gradient (design-system ban signal)
- **Location:** Shift button classes (~1155); detector `ai-color-palette` warning on `from-indigo-50` / `from-indigo-100`
- **Category:** Theming / Integrity
- **Impact:** Looks like generic AI chrome; conflicts with DESIGN.md / One Signal (Shift Blue scarcity, no purple-indigo stacks).
- **Recommendation:** Restyle like Week (blue) / Location (teal) using rota/slate tokens only.
- **Suggested command:** `/impeccable quieter` or `/impeccable colorize`

#### [P2] Custom portal “modals” instead of project `Modal`
- **Location:** Week / Location / Shift portals (~1220+); backdrop `div`, not `Modal.jsx`
- **Category:** Integrity / Accessibility
- **Impact:** Likely missing focus trap, `aria-modal`, Escape consistency vs ConfirmDialog/Modal rules.
- **Recommendation:** Reuse `src/components/ui/Modal.jsx`.
- **Suggested command:** `/impeccable harden`

#### [P2] Mobile day accordion headers lack `aria-expanded`
- **Location:** `DayCard` mobile expand via `onHeaderClick` / `isExpanded` (~1186–1207, ~870+)
- **Category:** Accessibility
- **Impact:** Chevron-only affordance; SR state unclear.
- **Recommendation:** Toggle control with `aria-expanded={isExpanded}`.
- **Suggested command:** `/impeccable harden`

#### [P2] Shift section icons not consistently hidden from AT
- **Location:** `SHIFT_SECTION_CONFIG` icons (~28–38) rendered beside `h4` (~775) without `aria-hidden` on wrappers
- **Category:** Accessibility
- **Impact:** Possible decorative noise next to “Day shift” text.
- **Recommendation:** `aria-hidden` on icon nodes.
- **Suggested command:** `/impeccable harden`

#### [P2] Type sizes off DESIGN.md ramp
- **Location:** Detector advisories lines ~776, 791, 827 (`text-[11px]`); badges `text-[10px]` (~816, 821)
- **Category:** Theming
- **Impact:** Tiny labels, especially time dividers and attendance chips.
- **Recommendation:** `text-xs` / documented steps.
- **Suggested command:** `/impeccable typeset`

#### [P2] Performance: monolithic page + dense interactive DOM (admin)
- **Location:** Entire `WeeklyRotaPage.jsx`; admin `role=button` on every slot `li`
- **Category:** Performance
- **Impact:** Heavy parse/reconcile; jank risk on mid phones (PWA).
- **Recommendation:** Split DayCard/ShiftSection/filters; buttons only where needed; virtualize if lists grow.
- **Suggested command:** `/impeccable optimize`

#### [P3] Hover lift on filter chips (`hover:-translate-y-[1px]`) without reduced-motion local guard
- **Location:** Mobile filter buttons (~1137–1155)
- **Category:** Accessibility / Motion
- **Impact:** Minor motion; global reduce helps partially.
- **Recommendation:** `motion-reduce:transform-none` / disable translate under reduced motion.
- **Suggested command:** `/impeccable optimize`

#### [P3] Empty “Your shifts” is clear; day empty states OK
- **Location:** `YourShiftsThisWeek` empty copy; “No shifts scheduled”
- **Category:** Positive-leaning / polish
- **Impact:** Low — keep; ensure empty week doesn’t feel broken.
- **Recommendation:** Optional deepen empty CTA (e.g. check location filter) via `/impeccable clarify` if product wants.

### Patterns & Systemic Issues
- Filter pickers (mobile sticky + desktop portal) undersized and under-ARIA’d in parallel.
- Admin interactivity bolted onto `<li>` instead of controls.
- Colour language for filters diverges (blue / teal / indigo-violet) instead of one filter-bar system.

### Positive Findings
- Clear Operate layout: personal week summary + yard day cards
- Responsive grid `grid-cols-1 … 2xl:grid-cols-7` with mobile collapse
- Sticky mobile filter bar uses `pt-safe` (PWA notch-aware)
- Loading skeletons + error card with Retry
- Current-user slot highlight (`amber` border) aids scan
- Some icons already `aria-hidden` (MapPin, task dot)
- Shell skip link / `main#main-content` present (from earlier shell work)

### Web vs PWA
| | Web desktop | PWA / mobile |
|--|-------------|--------------|
| Strengths | Multi-column week scan; header filter portal | Sticky Week/Hub/Shift; accordion days; bottom nav My Rota active |
| Weaknesses | Tiny header chips (24px); wrong `h1` | Filter chips 34px; accordion ARIA; same indigo Shift chip |

### Recommended Actions
1. **[P1] `/impeccable harden`**: Route `h1`; filter `aria-*`; real buttons for admin slots; Modal; day `aria-expanded`
2. **[P1] `/impeccable adapt`**: ≥44px filter controls (mobile + desktop portal)
3. **[P1] `/impeccable quieter`**: Remove indigo–violet Shift gradient
4. **[P2] `/impeccable optimize`**: Split module; fewer fake buttons; reduced-motion on lifts
5. **[P2] `/impeccable typeset`**: Replace 10–11px literals
6. **`/impeccable polish`**: Final pass

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `/impeccable audit` after fixes to see your score improve.
