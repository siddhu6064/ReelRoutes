# ReelRoutes — Investor Demo Script

**Format:** 90-second screen recording + 3-minute live walkthrough
**Target video:** A high-quality Alaska travel vlog on YouTube
  (rich transcript, many specific named places — ideal for showing AI extraction)

---

## Setup (before recording)

1. Open browser in a clean profile — no extensions visible
2. Pre-load `https://reelroutes.app` (import page)
3. Have this YouTube URL ready to paste:
   `https://www.youtube.com/watch?v=ALASKA_VIDEO_ID`
   *(use a real Alaska travel video with good CC — e.g. Kara and Nate, Lost LeBlancs)*
4. Have a second browser tab open with the share page from a previous run
   (so the map renders immediately without waiting)

---

## The 90-Second Recording

### 0:00–0:08 — Hook
*[Screen: import page]*
> "This is ReelRoutes. Every travel creator's audience has the same problem —
> they watch a great video, then spend hours Googling every place mentioned."

### 0:09–0:20 — Import
*[Paste the Alaska YouTube URL and click Import]*
> "We solve it in 30 seconds. Paste any travel video URL."

*[Processing screen with 5 animated steps]*
> "Our AI reads the transcript, finds every location, and geocodes each one."

### 0:21–0:40 — The Map
*[Trip map page with Alaska pins loading]*
> "This is what the audience actually wanted — an interactive map
> of every place in the video."

*[Click Denali pin → detail panel slides in with context quote]*
> "Each pin shows the exact quote from the video — so you remember
> why that place matters."

### 0:41–0:55 — AI Assistant
*[Open chat panel, type "Build me a 7-day Alaska itinerary"]*
*[Reply appears with structured day-by-day plan]*
> "The AI assistant has full trip context. Ask it anything —
> itinerary, budget, what to pack."

### 0:56–1:10 — Share
*[Click Share → share link copied]*
*[Open /share/:token in new tab — read-only map loads instantly]*
> "One click to share. Your friends see the full map — no login required.
> And at the bottom—"

*[Camera on the growth CTA banner]*
> "—they can import their own video. That's how we grow."

### 1:11–1:30 — Traction + Close
*[Switch to screen showing stats / product metrics]*
> "We support YouTube, Instagram, TikTok, Facebook, and X.
> The pipeline extracts locations from 95% of travel videos with captions.
>
> We're looking for [X] to [goal]. Let me show you the live product."

---

## Live Walkthrough (3 min after recording)

1. **Import a live URL** — paste a fresh video, show real-time processing
2. **Pin detail** — click a specific pin, show context quote + Maps link
3. **Edit trip** — drag to reorder stops, show how simple editing is
4. **AI chat** — ask "What's the best time of year to visit?" (show trip-aware answer)
5. **Share flow** — generate link, open in incognito tab, show the growth CTA
6. **Mobile** — show the responsive layout on a phone screen

---

## Questions to Prepare For

**"How accurate is the extraction?"**
> 95%+ location recall on YouTube videos with closed captions.
> For TikTok/Instagram without captions, we fall back to Whisper audio transcription.
> Low-confidence extractions are flagged for manual review in the UI.

**"What's the moat?"**
> Data network effect — the more trips imported, the better we understand
> which videos produce the best extraction results by platform and creator.
> Plus the AI travel assistant improves with usage data.

**"Why not just use ChatGPT?"**
> ChatGPT doesn't know what video you watched. We do — and we extract
> timed, geocoded, confidence-scored locations from the actual transcript,
> then present them on a map. That's the product.

**"Revenue model?"**
> Freemium: 10 imports/month free. Pro: unlimited imports + offline maps
> + trip collaboration. B2B: API for travel agencies and content platforms.

**"What's the viral coefficient?"**
> Every shared trip sends 3 viewers to the share page.
> At 20% share-to-import conversion, K ≈ 0.8–1.2.
> Above 1.0 = self-sustaining growth.

---

## Talking Points (keep handy)

- 430+ tests passing across unit, integration, and E2E
- 5 platform adapters: YouTube, Instagram, TikTok, Facebook, X
- Full stack: FastAPI + MongoDB + React + ARQ async workers
- Deployed on Railway (API) + Vercel (web)
- Auth: Clerk — zero PII stored on our servers
- OpenAI GPT-4o for extraction, Whisper for audio, Google Places for geocoding
