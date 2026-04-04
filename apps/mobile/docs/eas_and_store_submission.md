# ReelRoutes Mobile — EAS Build & App Store Submission Guide

## EAS Build Setup (Task 14)

### Prerequisites
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Build profiles (configured in eas.json)

| Profile | Purpose | Distribution |
|---------|---------|-------------|
| `development` | Local dev with DevClient | Internal (simulator) |
| `preview` | TestFlight / internal track | Internal |
| `production` | App Store / Play Store | Store |

### Build commands

```bash
# iOS development build (simulator)
eas build --profile development --platform ios

# iOS TestFlight build
eas build --profile preview --platform ios

# Android internal track build
eas build --profile preview --platform android

# Production builds for store submission
eas build --profile production --platform all
```

### Required credentials (EAS manages these)
- iOS: Apple Developer account, certificates, provisioning profiles
- Android: Keystore (EAS auto-generates on first build)

---

## Task 15 — Share Sheet Integration Validation

Run these tests on physical iOS + Android devices before App Store submission.

### iOS (physical device required for share sheet)

| Test | App | Steps | Expected |
|------|-----|-------|---------|
| YouTube share | YouTube iOS app | Open video → Share → ReelRoutes | App opens, URL pre-filled |
| Instagram share | Instagram iOS | Open Reel → Share → More → ReelRoutes | App opens, URL pre-filled |
| TikTok share | TikTok iOS | Open video → Share → More → ReelRoutes | App opens, URL pre-filled |
| Facebook share | Facebook iOS | Open video → Share → ReelRoutes | App opens, URL pre-filled |
| Safari share | Safari | Open YouTube in Safari → Share → ReelRoutes | App opens, URL pre-filled |
| Import completes | Any | Share URL → Import | Processing screen → trip map |
| Add to existing trip | Any | Import with existing trips → Add to trip sheet | Merge works |

### Android (physical device or emulator)

| Test | Steps | Expected |
|------|-------|---------|
| YouTube share | YouTube → Share → ReelRoutes | App opens, URL pre-filled |
| Chrome share | YouTube in Chrome → Share → ReelRoutes | App opens, URL pre-filled |
| Intent handler | `adb shell am start -a android.intent.action.SEND -t text/plain -e android.intent.extra.TEXT https://youtube.com/watch?v=abc app.reelroutes.mobile` | App opens |

### Core flow validation (both platforms)

- [ ] Import screen loads from tab
- [ ] URL paste + validation works
- [ ] Platform detection (YouTube/IG/TikTok/FB/X) shows correctly
- [ ] Processing screen shows 5-step progress
- [ ] Processing polls every 3 seconds
- [ ] On completion: redirects to trip map
- [ ] Trip map renders numbered coral markers
- [ ] Tap marker → pin detail bottom sheet opens
- [ ] Notes editing + save works
- [ ] Open in Maps works (Apple Maps on iOS, Google Maps on Android)
- [ ] AI chat drawer opens and responds
- [ ] Edit trip screen reorders stops
- [ ] Delete trip works
- [ ] Sign in with Google (Clerk OAuth)
- [ ] Profile screen shows user info after sign-in
- [ ] Trips persist after sign out and sign back in

---

## Task 16 — App Store Submission

### Apple App Store

1. **Build:**
   ```bash
   eas build --profile production --platform ios
   ```

2. **Submit:**
   ```bash
   eas submit --profile production --platform ios
   ```

3. **App Store Connect — fill in:**
   - App name: `ReelRoutes — Travel Map Builder`
   - Subtitle: `Turn travel videos into trip maps`
   - Description (see template below)
   - Keywords: `travel,map,trip,youtube,itinerary,vacation,places`
   - Category: Travel
   - Age rating: 4+
   - Privacy policy URL: `https://reelroutes.app/privacy`
   - Support URL: `https://reelroutes.app/support`

4. **Screenshots required (6.7", 6.1", iPad 12.9"):**
   - Import screen with YouTube URL pasted
   - Processing screen showing 5-step progress
   - Trip map with numbered coral markers (Alaska video)
   - Pin detail sheet showing Denali context quote
   - AI chat with day-by-day itinerary reply

### Google Play Store

1. **Build:**
   ```bash
   eas build --profile production --platform android
   ```

2. **Submit:**
   ```bash
   eas submit --profile production --platform android
   ```

3. **Play Console — fill in:**
   - App name: `ReelRoutes — Travel Map Builder`
   - Short description (80 chars): `Turn any travel video into an interactive trip map`
   - Full description (see template below)
   - Category: Travel & Local
   - Content rating: Everyone

---

## App Store Description Template

```
Turn any travel video into your personal trip map — in 30 seconds.

Discovered an amazing destination on YouTube, Instagram, or TikTok?
ReelRoutes extracts every location mentioned in the video and builds
you an interactive map, ready to plan your trip around.

HOW IT WORKS
• Paste any YouTube, Instagram, TikTok, Facebook, or X video URL
• Our AI reads the transcript and identifies every place mentioned
• Each location is geocoded and pinned on a beautiful dark map
• Ask the AI assistant to build your itinerary, estimate budget,
  or suggest what to pack

FEATURES
◈ Supports 5 platforms: YouTube, Instagram, TikTok, Facebook, X
◈ AI extracts locations with confidence scores and source quotes
◈ Edit trips: reorder stops, add places manually, edit notes
◈ Share your trip map with a link — no login required to view
◈ AI travel assistant with full trip context
◈ Guest mode: no sign-in required to import and view

Share your trip plans and discover new destinations through
the videos you already love.
```
