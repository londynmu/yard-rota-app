---
name: Yard Rota
description: Operational yard control desk — frosted cards, Shift Blue accents, hybrid depth across web and Flutter.
colors:
  shift-blue: "#2563EB"
  shift-blue-deep: "#1D4ED8"
  shift-blue-soft: "#3B82F6"
  control-surface: "#F8FAFC"
  control-surface-via: "#EFF6FF"
  control-surface-to: "#F1F5F9"
  charcoal: "#2D2D2D"
  slate-border: "#E2E8F0"
  slate-border-soft: "rgba(226, 232, 240, 0.6)"
  white-glass: "rgba(255, 255, 255, 0.9)"
  white-glass-strong: "rgba(255, 255, 255, 0.82)"
  success: "#059669"
  success-bg: "#ECFDF5"
  warning: "#D97706"
  warning-bg: "#FFFBEB"
  danger: "#DC2626"
  danger-bg: "#FEF2F2"
  info: "#0891B2"
  info-bg: "#ECFEFF"
  shift-day: "#3B82F6"
  shift-afternoon: "#6366F1"
  shift-night: "#64748B"
  text-muted: "#4B5563"
  text-muted-light: "#6B7280"
typography:
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title-sm:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
  label-xs:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "1rem"
  2xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  page-x: "16px"
  page-x-md: "24px"
  section-gap: "24px"
components:
  button-primary:
    backgroundColor: "{colors.shift-blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.shift-blue-deep}"
    textColor: "#FFFFFF"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "#334155"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card-modern:
    backgroundColor: "{colors.white-glass}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.2xl}"
    padding: "0"
  admin-section-card:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.md}"
    padding: "0"
  badge-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.shift-blue-deep}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  input-default:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: Yard Rota

## Overview

**Creative North Star: "Yard Control Desk"**

Yard Rota’s visual system is an operational control desk for a UK logistics yard: calm slate surfaces, frosted content cards, and a single clear blue signal for primary actions and “today / selected” states. Density stays readable on a phone in the yard and on a desktop in the office. Personality lives in soft glass cards, gentle gradient headers, and status colour — not in decorative illustration or loud marketing chrome.

Web (`src/`) is a **light-only** Operate UI built with React, Vite, and Tailwind (`rota.*`, `base.*`, `charcoal`, shared classes in `src/index.css`). Flutter (`apps/yard_rota_flutter`) shares the same slate/blue primitive family via `app_tokens.dart`, with tinted `AppCard` shells on Info / Breaks / Calendar and platform-native navigation affordances. Adaptive means **one product language**, expressed through each client’s tokens — never a second brand invented per screen.

Confirmed visual anti-references: dark-theme-first product chrome; purple-to-indigo “AI” gradients; overloaded glassmorphism; and heavy enterprise dashboards (dense table walls, harsh gray panels). Prefer reuse of Info / Breaks / Calendar / Shunter of the Month patterns over new one-off looks.

**Key Characteristics:**
- Control Surface Slate page washes with Shift Blue as the rare, decisive accent
- Frosted `card-modern` / glass bars as the default content shell
- Hybrid depth: soft shadows plus tinted borders / washes
- Segmented filters and equal columns for location + shift
- English UI copy; system/UI type stacks (no decorative display face)

## Colors

A cool operational palette: slate neutrals for structure, Shift Blue for action and selection, and semantic greens / ambers / reds / cyans for status only.

### Primary
- **Shift Blue** (`#2563EB` / blue-600): Primary actions, focus borders, selected filters, Flutter `AppColorsScheme.light.primary`. Deepen to `#1D4ED8` on hover/press. Soft companion `#3B82F6` for gradients and “today” day chips (`rota.day-today-bg-from`).

### Secondary
- **Afternoon Indigo** (`#6366F1`): Shift-type signal for afternoon only (`rota.shift-afternoon`). Not a second brand accent for general chrome.

### Tertiary
- Omit as a brand tertiary. Night uses **Night Slate** (`#64748B` / `rota.shift-night`) as a shift token, not a decorative accent.

### Neutral
- **Control Surface Slate** (`#F8FAFC`): App background (`--app-bg`, `base.50`, Flutter `slate50` / `bgSecondary`).
- **Control Surface Via / To** (`#EFF6FF` → `#F1F5F9`): Page gradient wash (`rota.page-bg-*`).
- **Charcoal** (`#2D2D2D`): Primary text on web (`--app-fg`, `text-charcoal`).
- **Slate Border** (`#E2E8F0` / soft 60%): Card and section borders (`border-slate-200/60`).
- **White Glass** (`rgba(255,255,255,0.9)` / `0.82`): Card and bottom-nav frosted fills.

### Named Rules
**The One Signal Rule.** Shift Blue is for primary action, selection, and “today” — not for large fills across an entire screen. Status greens/ambers/reds stay on badges and alerts.

**The Light Desk Rule (web).** Web ships light-only (`color-scheme: light`). Do not introduce a product dark theme on web without an explicit redesign decision.

**The Reuse Palette Rule.** Extend `tailwind.config.js` / `app_tokens.dart`; do not invent local hex in feature widgets.

## Typography

**Display Font:** system UI stack (no separate display face in the incumbent system)
**Body Font:** system UI stack (`system-ui`, San Francisco / Segoe / Roboto depending on platform)
**Label/Mono Font:** same family at smaller sizes; Flutter maps to Material text roles (`titleSmall`, `bodySmall`, etc.)

**Character:** Plain, operational, and scannable. Hierarchy comes from weight and size, not from a second decorative typeface.

### Hierarchy
- **Title** (700, ~1.5rem / `text-2xl`, tight tracking): Page titles (`text-charcoal font-bold tracking-tight`).
- **Title SM** (600, 0.875rem): Card/section headers (`admin-section-title`, Shunter card header).
- **Body** (400, 0.875rem): Default reading and list content.
- **Label** (500–600, 0.75rem): Chips, segmented controls, admin buttons.
- **Label XS** (500, ~10px / `text-[10px]`): Compact mobile segment labels (e.g. location truncate).

### Named Rules
**The No Display Face Rule.** Do not introduce Inter-as-brand, serif heroes, or marketing type pairings. Stay on system UI type unless the owner explicitly rebrands.

## Layout

Centered Operate column: **`page-content-inner`** = `max-w-4xl` + `space-y-6` + horizontal page padding (`px-4` / `md:px-6`). Main scroll shells use full-height overflow with transparent/slate wash backgrounds. Bottom navigation reserves safe area (`pb-bottom-nav`).

Segmented operational filters use **`filter-bar-segmented`**: equal `grid-cols-4` columns (location + Day + Afternoon + Night). Long labels truncate; short mobile labels expand at `sm+`.

Flutter mirrors density with `AppSpacing` (4→48) and home tab / M3 segmented patterns (`AppHomeTabs`, `AppM3SegmentedButton`). Prefer matching Info / Breaks / Calendar card stacks over inventing new page grids.

### Named Rules
**The Four-Column Filter Rule.** Location + three shifts stay equal-width; never let one label steal the row.

## Elevation & Depth

**Hybrid:** soft layered shadows from the Tailwind theme (`shadow-soft` / `medium` / `strong` / `glass`) plus tonal washes (slate→blue gradients, tinted badge fills, Flutter card wash + accent border). Surfaces are not flat-by-default marketing cards, nor heavy Material elevation stacks.

### Shadow Vocabulary
- **Soft** (`0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)`): Quiet resting lift.
- **Medium** (`0 4px 12px …`): Default elevated panels.
- **Strong / card** (`shadow-lg` on `card-modern`): Primary content cards.
- **Glass** (`0 8px 32px rgba(31,38,135,0.15)`): Occasional frosted float.

### Named Rules
**The Hybrid Desk Rule.** Depth = light shadow **and** border/wash. Do not rely on drop shadow alone, and do not stack multi-layer neon glows.

## Shapes

Friendly continuous corners: controls often `rounded-xl` (12–16px), primary cards **`rounded-2xl` (1.5rem)**, admin sections `rounded-xl`, badges/pills **`rounded-full`**. Borders stay thin slate (`1px` / hairline–thin in Flutter). Soft blur (`backdrop-blur-sm` / `lg`) appears on glass shells, not on every control.

### Named Rules
**The Card Shell Rule.** New content sections copy `card-modern` (web) or tinted `AppCard` (Flutter) — do not invent a third shell language.

## Components

### Buttons
- **Shape:** Gently curved (`rounded-xl` / ~12–16px).
- **Primary (page):** Gradient Shift Blue (`btn-primary`: blue-600→700), white label, soft shadow, light scale on hover/active.
- **Secondary:** White fill, slate border/text (`btn-secondary`).
- **Admin:** Compact outline chips (`admin-btn`, `admin-btn-danger`) — prefer these inside `/admin` over blue gradients.
- **Dialogs:** Follow ConfirmDialog / outline patterns; do not invent filled danger blocks outside those references.

### Chips
- Status: `badge-success` / `warning` / `danger` / `info` — soft gradient fills, subtle borders, pill radius.
- Rota fill badges: green / red / amber / orange token sets in `rota.badge-*`.
- Admin chips: white + charcoal border; active strengthens charcoal border.

### Cards / Containers
- **Corner Style:** `rounded-2xl` for modern cards; `rounded-xl` for admin sections.
- **Background:** White glass (`bg-white/90`) or solid white admin.
- **Shadow Strategy:** Hybrid (see Elevation).
- **Border:** `border-slate-200/60` or `border-gray-200` (admin).
- **Internal Padding:** Header `px-5 py-3.5`; bodies often `p-3` / `p-2` stacks; page rhythm `space-y-6`.
- **Signature:** Expandable gradient header (`from-slate-50 via-blue-50 to-slate-50`) as on Shunter of the Month.

### Inputs / Fields
- **Style:** White field, gray border, `rounded-lg`, charcoal text (`admin-input` / `rota.input-*`).
- **Focus:** Blue border + soft blue ring (`rota.input-focus-*`) or charcoal ring on admin.
- **Error:** Rose alert tokens (`rota.alert-error-*`).

### Navigation
- Web bottom nav: frosted bar (`bottom-nav-adaptive`), slate icons, active pill with light border/shadow.
- Flutter: glass top/bottom bars (`AppGlassBar`), home segment track (`AppHomeTabs` / `AppNavPill`), honor platform back/safe areas.
- Selected states use Shift Blue / slate contrast — not a third accent hue.

### Signature: Segmented filter bar
Equal-width operational control for location + shifts; copy `CalendarPage` segment chrome rather than redesigning per page.

## Do's and Don'ts

### Do:
- **Do** reuse Info / Breaks / Calendar / Shunter of the Month card patterns and shared classes (`card-modern`, `page-content-inner`, `filter-bar-segmented`, Flutter `AppCard` / tokens).
- **Do** keep user-facing copy in English.
- **Do** put new colours and radii into `tailwind.config.js` or `app_tokens.dart` before using them in features.
- **Do** keep Shift Blue scarce and purposeful (The One Signal Rule).
- **Do** preserve hybrid depth: soft shadow + slate/blue wash borders.

### Don't:
- **Don't** change business or domain logic while restyling.
- **Don't** invent purple-indigo AI gradients, dark-first web chrome, or heavy enterprise table walls.
- **Don't** invent a new card/button language when an existing shell fits.
- **Don't** ship Inter/serif display branding or emoji-led decoration as system identity.
- **Don't** hard-code one-off hex/spacing in feature widgets when a token already exists.
