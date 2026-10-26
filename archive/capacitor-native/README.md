# Archived Capacitor native shells

**Do not ship these to the app stores.**

Yard Rota mobile store builds ship from **Flutter only** (`apps/yard_rota_flutter/`). See that app’s `docs/STORE_RELEASE.md` and root `AGENTS.md`.

This folder holds the old Capacitor `android/` and `ios/` project trees that wrapped the web app. They are kept for reference only.

## Keep npm `@capacitor/*` packages

The **web** app still uses Capacitor JS packages at runtime (camera, status bar, platform checks):

- `@capacitor/core`
- `@capacitor/camera`
- `@capacitor/status-bar`

Do **not** remove those from `package.json` when cleaning native projects. Root `capacitor.config.ts` may remain for local web/Capacitor experiments; it is not the store release path.
