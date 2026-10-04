# Store release guide

Bundle / application ID on every platform: **`com.yard.rota`** (same ID as the earlier Capacitor build, so the Flutter app ships as an update). Version lives in `pubspec.yaml` (`version: 4.1.0+8`); bump the build number (`+N`) for every upload.

## 1. One-time setup

### Backend (Supabase project `jkjvtvwedjiupxoibpld`)

1. Apply `supabase/migrations/20261004120000_delete_own_account.sql` **before** shipping the app or web build (both filter on the new `profiles.deleted_at` column). Self-deletion and admin deletion now anonymise the account instead of hard-deleting it, so PreChecks, defects and violations survive. Test with two throwaway accounts, one deleted in-app and one deleted by an admin: neither can sign in, both disappear from the admin user list, and their PreCheck history is still visible to VMU as "Deleted user".
2. Auth → URL Configuration → Redirect URLs: add `yardrota://auth-confirmation` and `yardrota://reset-password`.
3. Make sure `https://shunters.net/privacy-policy.html`, `/terms.html` and `/delete-account.html` are deployed (web app `public/`).
4. Create the support mailbox used in the app and legal pages (`support@shunters.net`, override with `--dart-define=SUPPORT_EMAIL=...`).

### Android signing

```bash
keytool -genkey -v -keystore ~/yard-rota-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/key.properties.example android/key.properties   # fill in passwords + storeFile
```

If `com.yard.rota` was already uploaded from the Capacitor project, sign with **the same upload key** (or reset it in Play Console → App integrity). Enable Play App Signing.

### iOS / macOS signing

Open `ios/Runner.xcworkspace` and `macos/Runner.xcworkspace` in Xcode → Runner target → Signing & Capabilities → select the team. Register `com.yard.rota` in App Store Connect (one app record can hold both iOS and macOS).

## 2. Build commands

```bash
flutter build appbundle --release --obfuscate --split-debug-info=build/symbols   # Google Play
flutter build ipa --release --obfuscate --split-debug-info=build/symbols         # App Store (upload via Transporter / Xcode)
flutter build macos --release                                                     # then Product → Archive in Xcode for Mac App Store
flutter build windows --release && dart run msix:create                           # Windows .msix
```

Regenerate icons / splash after changing `assets/branding/*`:

```bash
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

## 3. Distribution model

The app is for approved yard staff only. Public App Store review can reject internal business apps (guideline 3.2). Recommended:

- **Apple:** request an **Unlisted App** (https://developer.apple.com/support/unlisted-app-distribution/) — listed on the store but reachable only by link. Alternative: Custom App via Apple Business Manager.
- **Google Play:** production track with a normal listing, or a closed testing track / Managed Google Play for private distribution. New personal developer accounts must run a closed test (12 testers, 14 days) before production.

## 4. App Review notes (both stores)

Provide a pre-approved demo account (role: shunter, profile completed, account approved) with some rota data:

```
Email: <demo account>
Password: <demo password>
Accounts are created by staff and approved by a yard administrator.
Account deletion: Home → Account → Delete account.
Camera is used only to scan tug QR codes and attach PreCheck photos.
```

## 5. Privacy answers

No third-party analytics, ads or tracking SDKs. Data is stored in Supabase.

| Data | Purpose | Linked to user | Tracking |
|---|---|---|---|
| Email address, name | App functionality (account) | Yes | No |
| User ID | App functionality | Yes | No |
| Photos (profile, PreCheck evidence) | App functionality | Yes | No |
| Other user content (availability, rota, PreCheck answers) | App functionality | Yes | No |
| Product interaction (`page_visits` screen views) | Analytics (first-party) | Yes | No |

- **Apple App Privacy:** matches `ios/Runner/PrivacyInfo.xcprivacy`.
- **Google Data safety:** data encrypted in transit: yes; users can request deletion: yes (in-app + `https://shunters.net/delete-account.html`).
- **Encryption export:** `ITSAppUsesNonExemptEncryption = false` (HTTPS only).

## 6. Store listing checklist

- [ ] App name "Yard Rota", subtitle / short description, full description, keywords
- [ ] Category: Business (or Productivity)
- [ ] Screenshots: iPhone 6.9", iPad 13", Android phone, Mac (if shipping macOS)
- [ ] Google Play feature graphic 1024x500
- [ ] Privacy Policy URL: `https://shunters.net/privacy-policy.html`
- [ ] Support URL / email
- [ ] Content rating questionnaire (Play) and age rating (Apple)
- [ ] Data safety / App Privacy forms (section 5)

## 7. Platform notes

- iPhone and Android phones are locked to portrait; iPad, Android tablets and desktop windows rotate / resize, content is capped at `AppComponentTokens.maxContentWidth`.
- Desktop (macOS, Windows): no camera capture — PreCheck photos are chosen from files. QR scanning is available on macOS only; on Windows tugs are selected from the list.
- Email links (`yardrota://`) open the app on iOS, Android and macOS; on Windows they work when installed from the `.msix` (protocol registered in `msix_config`).
