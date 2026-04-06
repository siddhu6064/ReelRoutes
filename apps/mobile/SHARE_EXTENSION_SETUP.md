# Share Extension — Setup Guide

The iOS Share Extension lets users share any video URL directly from
YouTube, Instagram, TikTok, Facebook, X, or Safari into ReelRoutes
without copy-pasting. This file documents what's automated and what
requires manual steps in Apple / EAS dashboards.

---

## What's already done in code

| File                      | What it does                                                                |
| ------------------------- | --------------------------------------------------------------------------- |
| `app.json`                | `expo-share-intent` plugin configured with App Group + iOS activation rules |
| `app.json`                | App Group entitlement: `group.app.reelroutes.mobile`                        |
| `app.json`                | CarPlay + background location entitlements                                  |
| `eas.json`                | preview + production profiles with `App Groups: true` capability            |
| `app/+native-intent.ts`   | Routes all share deep link formats to `/(tabs)/new-trip`                    |
| `hooks/useShareIntent.ts` | Extracts and normalises the URL from any share format                       |
| `app/(tabs)/new-trip.tsx` | Auto-starts import 600ms after share arrives                                |

---

## Manual steps before running `eas build`

### 1. Apple Developer Portal

1. Go to **Certificates, IDs & Profiles → Identifiers**
2. Select `app.reelroutes.mobile`
3. Enable **App Groups** capability
4. Create App Group: `group.app.reelroutes.mobile`
5. Also create a second identifier for the extension:
   `app.reelroutes.mobile.ShareExtension`
6. Enable **App Groups** on that identifier too and add it to the same group

### 2. EAS Dashboard

1. Go to **eas.expo.dev → your project → Credentials**
2. Under iOS, ensure App Groups is listed as a capability
3. EAS will auto-provision the App Group entitlement on build

### 3. Update eas.json placeholders

Replace these in `eas.json` before submitting:

```
"appleId": "your-apple-id@example.com"   ← your Apple ID
"ascAppId": "XXXXXXXXXX"                  ← App Store Connect App ID
"appleTeamId": "XXXXXXXXXX"              ← your 10-char Team ID
```

And in the env blocks, add your real Clerk keys:

```
"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_test_..."   ← preview
"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_..."   ← production
```

---

## Build commands

```bash
# Install EAS CLI (once)
npm install -g eas-cli
eas login

# Development build (simulator — share extension NOT testable here)
eas build --platform ios --profile development

# Preview build (real device — share extension works)
eas build --platform ios --profile preview

# Install on device via TestFlight or direct download from EAS dashboard
# Then test: open YouTube app → share → ReelRoutes
```

---

## Testing the share extension

Once the preview build is installed on a real iOS device:

1. Open **YouTube** → find any travel video → tap **Share** → scroll to **ReelRoutes**
2. ReelRoutes opens, URL is populated, import starts automatically
3. Test the same flow with Instagram, TikTok, Facebook, X, and Safari

### Expected behaviour

- App opens directly on the Import tab
- Green "Shared from YouTube" banner appears
- Import starts automatically after 600ms
- After completion, navigates straight to the trip map

### If ReelRoutes doesn't appear in the share sheet

- App Groups entitlement is missing — check Apple Developer Portal
- Run `eas build` again after fixing the entitlement

---

## Android

Android intent handling is configured automatically via `app.json`:

```json
"intentFilters": [{
  "action": "android.intent.action.SEND",
  "data": [{ "mimeType": "text/plain" }],
  "category": ["android.intent.category.DEFAULT"]
}]
```

Test on Android: share any URL from any app → ReelRoutes appears in the chooser.
