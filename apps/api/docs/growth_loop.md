# ReelRoutes — Growth Loop Definition

## The Core Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│   User discovers travel content on YouTube/Instagram     │
│                         │                               │
│                         ▼                               │
│   Pastes URL into ReelRoutes → gets trip map            │
│                         │                               │
│                         ▼                               │
│   Saves & shares trip link with friends                 │
│                         │                               │
│                         ▼                               │
│   Friend visits /share/:token (no login required)        │
│                         │                               │
│                         ▼                               │
│   Sees CTA: "Saw a travel video you love?               │
│              Import your own — it's free →"              │
│                         │                               │
│                         ▼                               │
│            New user imports their video        ──────┐  │
│                                                      │  │
└──────────────────────────────────────────────────────┘  │
         ▲                                                 │
         └─────────────── loop repeats ───────────────────┘
```

## Why It Works

**Problem it solves:** Travel content creators and their audiences both
have the same pain — manually building itineraries from videos.

**Viral mechanism:**
- Every trip share is free organic distribution
- The share page is beautiful and immediately useful
- The CTA appears naturally at the moment of highest intent
  (they just looked at someone else's trip and want to do the same)

**Viral coefficient target:** > 1.0
- If 1 in 3 share page visitors imports their own video → K > 1
- Even 1 in 5 is self-sustaining growth

## Funnel Stages

| Stage | Event | Target Conversion |
|-------|-------|------------------|
| Landing | `page_view` | — |
| Import started | `import_started` | 60% of visitors |
| Import completed | `import_completed` | 80% of imports |
| Trip saved | `trip_saved` | 70% of completions |
| Trip shared | `trip_shared` | 30% of saves |
| Share page viewed | `share_page_view` | ~3 viewers per share |
| New import from share | `import_started` (referrer=share) | 20% of share viewers |

**Net: 0.6 × 0.8 × 0.7 × 0.3 × 3 × 0.2 = ~0.06 organic installs per visitor**

At steady state with paid/organic acquisition: K ≈ 0.8–1.2 depending on content quality.

## Growth Levers

### Lever 1 — Share page quality
The share page must be immediately impressive. A beautiful map with
labelled pins is far more shareable than a list of text.
**Metric:** Share → new import conversion rate.

### Lever 2 — Share prompt timing
Show "Copy share link" immediately after a trip map loads, while
the user is most excited about their trip.
**Metric:** Share rate (trip_shared / trip_saved).

### Lever 3 — Video thumbnail on share page
Showing the source video thumbnail on the share page increases
click-through rate significantly — people recognise the video.
**Metric:** Share page → import conversion.

### Lever 4 — Platform-specific sharing
Pre-compose share text for Instagram Stories, X, WhatsApp:
*"Just mapped out my Japan trip from [creator]'s video 🗺️"*
**Metric:** Social referral traffic.

## PostHog Dashboards to Build

1. **Growth loop funnel:** import_started → trip_saved → trip_shared → share referral import
2. **Platform breakdown:** Which platform (YouTube/TikTok/Instagram) has highest completion rate
3. **D7 retention:** Do users who save a trip return within 7 days
4. **Chat engagement:** Users who send 3+ chat messages vs those who don't — trip save rate

## Week 1 Targets (Post-launch)

- 50 trips imported
- 10 trips shared
- 3 new users from share links
- K-factor measured and baseline set
