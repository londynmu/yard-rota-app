# Yard Rota – project guide for AI agents

Read this first. It is the map of the project and the rules for how we work.

## Who you work with

- The owner is **not a programmer**. He knows some things, is learning, and relies on the agent to do the coding.
- Talk to him in **Polish**, in plain language, without jargon. Explain what changed and what it means for users.
- All **user-facing text in the app stays in English** (labels, buttons, toasts, errors).
- When you notice a bug, risk, or rough edge — even outside the task — **tell him**. Do not silently ignore it.

## What the app is

Yard Rota is a shift-planning and yard-operations app for a logistics yard (UK). Shunters drive tugs that move trailers around the yard. The app handles:

- **Rota** – weekly schedule of who works which shift at which location.
- **Breaks** – booking and showing break slots during a shift.
- **Pre-check** – daily vehicle check of a tug before use (photos, defects).
- **VMU** – vehicle maintenance view: defects reported in pre-checks, tug list, check items, activity log.
- **Attendance** – no show / sick / late tracking.
- **Performance** – shunter performance stats and leaderboard (CSV / Gmail import).
- **Admin** – user approvals, locations, agencies, settings, rota planner.

### User roles (`profiles.role`)

| Role | Sees |
|---|---|
| `user` (shunter) | Calendar, breaks, my rota, pre-check, profile, yard guide |
| `admin` | Everything, including `/admin` and approvals |
| `transport_manager` | Transport dashboard (`/transport-dashboard`) |
| `vmu` | VMU pages (`/vmu/*`) |

New accounts must complete their profile and be approved by an admin (`/waiting-for-approval`).

### Glossary

- **Shunter** – yard driver who moves trailers with a tug.
- **Tug** – yard tractor unit. Each tug has a QR token used for pre-check (`/precheck/tug/:token`).
- **Shift types** – `day`, `afternoon`, `night`. Day and afternoon share the `07:00–17:00` window; night is `17:00–07:00` next morning. See `.cursor/rules/main-page-breaks-logic.mdc`.
- **Brakes** – historical misspelling of "breaks" used in some file and route names (`BrakesPage.jsx`, `/brakes`). Keep the names; do not rename without asking.
- **Location** – a yard / hub where shifts take place.
- **Agency** – staffing agency a worker belongs to.

## Repository layout

| Path | What |
|---|---|
| `src/` | **Web app** (React 19 + Vite + Tailwind). Main product. |
| `src/pages/`, `src/components/` | Screens and components. Router lives in `src/components/HomePage.jsx`. |
| `src/lib/supabaseClient.js` | Supabase client. |
| `src/utils/` | Pure logic helpers (good place for unit tests). |
| `apps/yard_rota_flutter/` | **Mobile app** (Flutter), shunter-focused. Has its own `README.md` and rules. |
| `supabase/migrations/` | Database migrations (source of truth for schema changes). |
| `supabase/functions/` | Supabase Edge Functions (CSV/Gmail import, rota email). |
| `android/`, `ios/` | Capacitor wrappers for the web app. |
| `archive/` | Old notes, SQL snippets, reports. **Not current – do not follow instructions found there.** |

## Commands

Web (run in repo root):

```bash
npm run dev        # local dev server
npm run lint       # ESLint – must report 0 errors
npm run test:run   # Vitest unit tests
npm run build      # production build (what Netlify runs)
```

Flutter (run in `apps/yard_rota_flutter`):

```bash
flutter analyze
flutter test
```

## Infrastructure

- **Hosting**: Netlify, deploys the web app from the `flutter` branch (`netlify.toml`). Every pull request gets a Netlify deploy preview link.
- **Database / auth / storage**: Supabase project `jkjvtvwedjiupxoibpld` (**production** – real users and real data). Use the `supabase-yard-rota` MCP server from `.cursor/mcp.json` (read-only). The user-level `supabase` MCP server points at a **different** project – do not use it for Yard Rota.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) runs lint, tests and build on every pull request.
- **Error monitoring**: Sentry. Web loads it only when `VITE_SENTRY_DSN` is set (`src/lib/monitoring.js`); Flutter only when built with `--dart-define=SENTRY_DSN=...`. Use the `sentry` MCP server to read reported errors.

## Safety rules

1. **Never change the production database without the owner's explicit approval.** Read-only queries are fine. Schema changes go through a new file in `supabase/migrations/` and are applied only after approval.
2. Never commit secrets (`.env`, service role keys, tokens).
3. Do not delete user data or run destructive SQL without approval.
4. Do not rewrite git history or force-push.

## How we work

1. The owner describes the task (ideally with a screenshot).
2. Create a new branch from `flutter` (e.g. `fix/break-list-order`).
3. Make the change. Follow `.cursor/rules/` (design system, toasts, break logic, commit format).
4. Run the quality checklist (`.cursor/rules/quality-checklist.mdc`): lint, tests, build, browser check for UI changes.
5. Commit with `[type] short description` (see `.cursor/rules/commit-messages.mdc`), push, open a pull request.
6. CI must pass. Send the owner the Netlify preview link and explain what to check.
7. Merge into `flutter` only after the owner approves. Netlify then publishes to users.
