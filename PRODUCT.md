# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary audiences are both equally important:

- **Shunters** — yard drivers who move trailers with tugs. They use the product on the yard, often on a phone: see their rota, book and follow breaks, run tug pre-checks (photos/defects), and use yard guide / profile flows.
- **Admins and yard office roles** — plan and maintain the weekly rota, approve users, manage locations and agencies, review attendance (no show / sick / late), performance/leaderboard, and VMU (vehicle maintenance) defects and activity. Transport managers use the transport dashboard; VMU role uses VMU pages.

New accounts must complete a profile and wait for admin approval before full access.

## Product Purpose

Yard Rota is a shift-planning and yard-operations app for a logistics yard in the UK. It exists so shunters and office staff share one clear picture of who works which shift where, can book breaks during a shift, check tugs before use, and track attendance, performance, and vehicle defects without relying on informal chat or paper.

Success means people can complete those jobs quickly during a live shift or planning session, with correct shift timing and without inventing or changing business rules.

## Positioning

Purpose-built for yard shunting operations (rota + breaks + tug pre-check + VMU + attendance/performance), not a generic workforce calendar. Shift windows are domain-specific: day and afternoon share `07:00–17:00` on the same calendar day; night is `17:00–07:00` the next morning, with night-cycle rules that must stay intact.

## Operating Context

- Real production data and auth on Supabase; web hosts on Netlify from the `flutter` branch.
- Shunters often work outdoors / on a phone; admins more often on desktop.
- Tugs are identified with QR tokens for pre-check (`/precheck/tug/:token`).
- Some historical route/file names use “Brakes” for breaks — keep those names unless the owner asks to rename.
- Owner collaborates with AI agents in Polish; end users see English in the product.

## Capabilities and Constraints

Confirmed capabilities: weekly rota by location and shift; break booking and lists; tug pre-check with photos/defects; VMU views; attendance; performance import/leaderboard; admin approvals, locations, agencies, settings, rota planner; role-gated surfaces (`user`, `admin`, `transport_manager`, `vmu`).

Hard constraints confirmed with the owner:

- **Do not change any business or domain logic** (including break/shift windows, list ordering rules, role access, and related workflows). Design work may refine presentation only where it does not alter behaviour.
- **All user-facing product copy stays in English** (labels, buttons, toasts, errors).
- Reuse the existing UI system (Info / Breaks / Calendar patterns and shared tokens) rather than inventing a parallel look when refining screens.
- Two clients share product truth: **web** (`src/`, React 19 + Vite + Tailwind) and **Flutter** (`apps/yard_rota_flutter/`, store releases). Capacitor native shells are archived; Flutter is the store mobile path.
- Production database schema changes only via approved `supabase/migrations/`; no silent production data changes.

## Brand Commitments

- Product name: **Yard Rota**.
- Voice to end users: clear, operational English; no jargon-heavy UX copy.
- Owner-facing agent communication: Polish, plain language.
- Visual identity already exists in both clients; do not invent a new brand world unless the owner explicitly asks for a redesign.

## Evidence on Hand

- Project map and glossary: `AGENTS.md`
- Breaks / shift window rules: `.cursor/rules/main-page-breaks-logic.mdc`
- UI reuse rules: `.cursor/rules/reuse-existing-ui-styles.mdc` and related Cursor rules
- Web UI under `src/`; Flutter UI under `apps/yard_rota_flutter/lib/`
- Do not fabricate testimonials, customer quotes, or external press; none are required for this product record.

## Product Principles

1. **Behaviour first** — presentation may improve; shift, break, rota, and role logic stay as specified.
2. **Both audiences matter** — shunter phone flows and admin desktop flows are first-class, not afterthoughts.
3. **One product, two clients** — web and Flutter should feel like the same Yard Rota, adapted per platform.
4. **Operational clarity** — scanability and correct status beat decorative novelty on Operate surfaces.
5. **English in the product** — every user-visible string remains English.

## Accessibility & Inclusion

No separate formal standard was mandated beyond usable real-world operation (including phone use on the yard and readable admin tools). Prefer clear contrast, readable type, and touch-friendly controls on shunter flows without changing required workflows.
