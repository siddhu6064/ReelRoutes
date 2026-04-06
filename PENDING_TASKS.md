# ReelRoutes — Pending Tasks (Requires External Access)

Tasks that are code-complete but need a manual step in an external
dashboard before they fully activate. Pick these up when you have
access to the relevant console.

---

## 🍎 Apple Developer Portal — Share Extension App Group

**Blocked by:** Apple Developer Portal access  
**Time needed:** ~5 minutes  
**Code is:** ✅ complete — `app.json`, `eas.json`, `hooks/useShareIntent.ts` all done

### Steps

1. Go to **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers**
2. Select `app.reelroutes.mobile`
3. Enable **App Groups** capability
4. Create App Group: `group.app.reelroutes.mobile`
5. Create a second identifier: `app.reelroutes.mobile.ShareExtension`
6. Enable **App Groups** on that identifier, add to the same group
7. Then run: `eas build --platform ios --profile preview`
8. Install the TestFlight build and test: YouTube → Share → ReelRoutes

### What it unlocks

The native iOS share sheet extension — user taps Share in any video
app and ReelRoutes appears as a destination. Import starts automatically.

---

## 🚀 EAS Dashboard — Clerk Keys

**Blocked by:** Clerk dashboard access  
**Time needed:** ~2 minutes

### Steps

1. Go to **dashboard.clerk.com → your app → API Keys**
2. Copy the publishable key for test and live environments
3. In `apps/mobile/eas.json`, replace:
   - `"pk_test_REPLACE_ME"` → your test publishable key (preview profile)
   - `"pk_live_REPLACE_ME"` → your live publishable key (production profile)

---

## 🚀 EAS Dashboard + App Store Connect — Submit config

**Blocked by:** Apple Team ID + App Store Connect App ID  
**Time needed:** ~5 minutes

### Steps

1. In `apps/mobile/eas.json` under `submit.production.ios`, replace:
   - `"your-apple-id@example.com"` → your Apple ID email
   - `"ascAppId": "XXXXXXXXXX"` → App Store Connect app numeric ID
   - `"appleTeamId": "XXXXXXXXXX"` → your 10-character Apple Team ID
2. For Android: add `google-play-service-account.json` to `apps/mobile/`
   (download from Google Play Console → Setup → API access)

---

## 📊 Sentry DSN

**Blocked by:** Sentry project creation  
**Time needed:** ~3 minutes

### Steps

1. Create a new project at **sentry.io** (React Native + FastAPI)
2. Copy the DSN
3. Add to Railway env vars: `SENTRY_DSN=https://...`
4. Add to Vercel env vars: `SENTRY_DSN=https://...`
5. Add to EAS env vars: `EXPO_PUBLIC_SENTRY_DSN=https://...`

---

## 📊 PostHog API Key

**Blocked by:** PostHog project creation  
**Time needed:** ~2 minutes

### Steps

1. Create project at **posthog.com**
2. Copy the project API key
3. Add `POSTHOG_API_KEY` to Railway, Vercel, and EAS env vars

---

## 🤖 Android — Digital Asset Links (for autoVerify)

**Blocked by:** Production domain + signing key  
**Time needed:** ~10 minutes  
**Why needed:** The `autoVerify: true` intent filters in `app.json` tell Android
to verify that reelroutes.app is associated with the app. Without this, Android
shows "Open with…" chooser every time instead of routing directly.

### Steps

1. Get your SHA-256 fingerprint from EAS:
   `eas credentials --platform android`
2. Create `https://reelroutes.app/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.reelroutes.mobile",
      "sha256_cert_fingerprints": ["YOUR_SHA256_HERE"]
    }
  }
]
```

3. Deploy this file to the web server (Vercel — add to `apps/web/public/.well-known/`)
4. Verify with: `adb shell pm get-app-links app.reelroutes.mobile`
