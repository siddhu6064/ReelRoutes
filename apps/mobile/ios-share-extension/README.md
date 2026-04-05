/\*\*

- apps/mobile/ios-share-extension/README.md
-
- Task 4 — iOS Share Extension setup guide.
-
- The iOS Share Extension lets users share a YouTube/Instagram/TikTok URL
- directly from Safari, YouTube app, Instagram app etc into ReelRoutes.
-
- Implementation approach:
- We use expo-linking's deep link handler — when the user taps
- "Share → ReelRoutes" from a native app, iOS opens our app via URL scheme
- `reelroutes://import?url=<encoded_url>`.
-
- For a full native Share Extension (appears in iOS share sheet alongside
- AirDrop, Copy, etc), you need a native Swift extension target.
- This is added via Expo config plugin below.
  \*/

# iOS Share Extension — ReelRoutes

## How it works

When a user is viewing a YouTube/Instagram/TikTok video on iOS:

1. Tap the **Share** button (box with arrow)
2. Find **ReelRoutes** in the app row (or "More" → add ReelRoutes)
3. ReelRoutes opens with the URL pre-filled and import starts immediately

## Configuration

The `app.json` is already configured with:

```json
{
  "scheme": "reelroutes",
  "ios": {
    "infoPlist": { ... }
  }
}
```

## Native Share Extension (Expo config plugin)

Add this to `app.json` under `plugins` to add a real iOS Share Extension
that appears in the native share sheet:

```json
[
  "expo-share-extension",
  {
    "backgroundColor": "#0f0f0d",
    "headerBackgroundColor": "#0f0f0d",
    "tintColor": "#D85A30",
    "activationRules": {
      "NSExtensionActivationSupportsWebPageWithMaxCount": 1,
      "NSExtensionActivationSupportsWebURLWithMaxCount": 1
    }
  }
]
```

Install: `npx expo install expo-share-extension`

The extension receives the shared URL and opens the main app via:
`reelroutes://import?url=<encoded_url>`

## Android Share Intent

Already configured in `app.json`:

```json
"intentFilters": [{
  "action": "android.intent.action.SEND",
  "data": [{ "mimeType": "text/plain" }],
  "category": ["android.intent.category.DEFAULT"]
}]
```

Handled in `app/(tabs)/new-trip.tsx` via `expo-linking`.

## Testing

### iOS Simulator

1. Run `npx expo start --ios`
2. Open Safari, go to any YouTube URL
3. Tap Share → scroll to find ReelRoutes
4. App opens with URL pre-filled

### Android Emulator

1. Run `npx expo start --android`
2. Open Chrome, go to any YouTube URL
3. Tap Share → ReelRoutes
4. App opens with URL pre-filled

### Physical device

Use EAS development build:
`eas build --profile development --platform ios`
`eas build --profile development --platform android`
