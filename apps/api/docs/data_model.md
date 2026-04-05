# ReelRoutes V4 — Data Model Reference

> **Collection:** `users` · `trips` · `jobs`  
> **Embedded:** `Pin` inside `Trip.pins[]`  
> **ODM:** Beanie 1.x (async, Motor-backed)  
> **Database:** MongoDB Atlas (M0+ free tier for dev, M10+ for prod)

---

## Design Philosophy

### Why MongoDB?

ReelRoutes' core data is a **Trip** — a video URL plus a variable-length list of places (Pins). Pins are always read together with their parent trip, never queried independently. This is the canonical use case for **document embedding**: no joins, no N+1 queries, and pin lists serialize directly into API responses.

SQL would require a `trips` table, a `pins` table, and a join on every read. MongoDB lets us store the trip and all its pins in a single document and retrieve them with one `findOne`.

### Embedding vs Referencing — the decision matrix

| Relationship                     | Pattern                | Why                                                                                                  |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `Trip` → `Pin[]`                 | **Embedded**           | Pins are always read with their trip. Max ~50 pins per trip. No independent pin queries.             |
| `Trip.user_id` → `User.clerk_id` | **Reference (string)** | Users exist independently. Many trips per user. Cross-user access prevention requires user identity. |
| `Job.user_id` → `User.clerk_id`  | **Reference (string)** | Same rationale as trips.                                                                             |
| `Job` → `Trip`                   | **None at DB level**   | `Trip.job_id` stores provenance only — it is never joined.                                           |

We use **Clerk's `clerk_id` string as the reference key** (not MongoDB ObjectId) because:

- Auth tokens carry `clerk_id` — linking trips to users requires no DB lookup
- Clerk webhooks fire `user.created` with `clerk_id` — syncing is straightforward
- Avoids a MongoDB `users.findOne` on every authenticated request

---

## Collections

### `users`

Mirrors a Clerk user into MongoDB for ownership queries.

```
{
  _id:         ObjectId            # Beanie-managed
  clerk_id:    "clerk_abc123"      # UNIQUE — Clerk's user identifier
  email:       "user@example.com"
  name:        "Yuki Tanaka"
  avatar_url:  "https://..."       # optional
  google_id:   "g_12345"          # optional — Google OAuth
  apple_id:    "a_12345"          # optional — Apple OAuth
  created_at:  ISODate
  updated_at:  ISODate
}
```

**Indexes:**

- `clerk_id` → UNIQUE. The primary lookup key. Must be unique.
- `email` → Non-unique. Used for admin queries and email-based lookups.

**Sync strategy:** Clerk webhooks `user.created` and `user.updated` call `POST /api/webhooks/clerk` which upserts the UserDocument. The `clerk_id` is the upsert key — if the user already exists (race condition), the upsert is idempotent.

**Guest mode:** When a user imports a video without signing in, `Trip.user_id` and `Job.user_id` are `null`. No UserDocument is created. If the user later signs in, they can claim their guest trip by setting `user_id` to their `clerk_id`.

---

### `trips`

The primary user-facing document. Contains all trip metadata and all pins.

```
{
  _id:           ObjectId
  user_id:       "clerk_abc123"    # null for guest trips
  title:         "Japan 2024 — Tokyo & Kyoto"
  source_url:    "https://youtube.com/watch?v=abc"
  platform:      "youtube"         # enum: youtube|instagram|tiktok|facebook|twitter|unknown
  thumbnail_url: "https://..."     # optional
  video_duration: 1847.0           # seconds, optional
  job_id:        ObjectId          # provenance — the job that created this trip, optional

  pins: [                          # EMBEDDED — always read with the trip
    {
      id:            "uuid-v4"     # client-generated, stable across edits
      order:         0             # display order (0-indexed)
      place_name:    "Shibuya Crossing"
      place_id:      "ChIJ..."     # Google Places ID, optional
      lat:           35.6595
      lng:           139.7004
      address:       "..., Tokyo, Japan"    # optional
      country_code:  "JP"          # optional
      city:          "Tokyo"       # optional
      context_quote: "We started at Shibuya Crossing..."  # verbatim transcript, optional
      timestamp_hint: 42.0         # seconds into video, optional
      confidence:    0.95          # 0.0–1.0; < 0.5 triggers suggestion UI
      manually_added: false
      notes:         null          # user-editable
      tags:          []            # user-editable
      created_at:    ISODate
      updated_at:    ISODate
    },
    ...
  ]

  share_token:   null              # set when user shares; generates unique URL slug
  is_shared:     false
  created_at:    ISODate
  updated_at:    ISODate
}
```

**Indexes:**

- `(user_id ASC, created_at DESC)` — The primary list query: "all trips for user, newest first." Most frequent read pattern.
- `share_token ASC` — UNIQUE + SPARSE. Unique so share tokens don't collide. Sparse because most trips are never shared (null tokens must not trigger the unique constraint).
- `created_at DESC` — For background cleanup of old anonymous guest trips.

**Pin design decisions:**

- **Why embed pins in the trip?** Pins are never queried outside their parent trip. The application always reads all pins at once (to render the map). Embedding eliminates a join and simplifies the service layer.
- **Why client-generated UUID for `pin.id`?** The client assigns pin IDs so it can reference them optimistically (before the server round-trip). This is essential for drag-to-reorder UX. UUIDs don't collide in practice; the ID is validated on write.
- **Why `confidence` on pins?** The AI extractor outputs a confidence score for each location mention. Pins with `confidence < 0.5` are flagged in the "Did we miss anything?" section — shown to the user as suggestions they can tap to confirm.
- **Why `context_quote`?** Explainability. Users can tap a pin and see exactly what the creator said that caused it to be extracted. Also useful for debugging extraction quality.
- **Why `timestamp_hint`?** Lets the UI deep-link into the source video at the moment the place was mentioned.

---

### `jobs`

Represents one video import processing task. Workers update this document as the pipeline advances. The client polls `GET /api/jobs/:id` every 3 seconds.

```
{
  _id:              ObjectId
  user_id:          "clerk_abc123"  # null for guest imports
  url:              "https://youtube.com/watch?v=abc"
  platform:         "youtube"

  status:           "queued"        # enum: queued|processing|completed|failed
  progress:         0               # 0–100 integer
  current_step:     null            # enum: fetching_video|transcribing|extracting_locations|geocoding|finalizing
  progress_message: null            # human-readable step description for the UI

  # Pipeline artifacts — stored for debugging and re-extraction
  transcript:       null            # raw transcript text
  raw_locations:    []              # AI-extracted place name strings, pre-geocoding

  # Error state
  error:            null            # human-readable error message
  error_code:       null            # machine-readable: TRANSCRIPT_FAILED, NO_LOCATIONS_FOUND, etc.

  created_at:       ISODate
  started_at:       null            # set when worker picks up the job
  completed_at:     null            # set on completion or failure
}
```

**Indexes:**

- `(url ASC, status ASC)` — **Deduplication check.** Before creating a new job, workers query this index to see if the same URL is already queued or processing. Prevents users from submitting duplicate imports.
- `(user_id ASC, created_at DESC)` — User's job history page. Same pattern as trips.
- `(status ASC, created_at ASC)` — **Worker polling.** ARQ workers query this index to find `queued` jobs in FIFO order.

**Job lifecycle:**

```
QUEUED ──► PROCESSING ──► COMPLETED
                 └──────► FAILED
```

Each status transition is atomic (a single `save()` call). Progress updates are sent as partial saves. The `transcript` and `raw_locations` fields are stored on the job even after completion — they're kept for 30 days for debugging extraction quality without needing to re-process the video.

**Why store `transcript` on the Job?** If the AI extraction produces poor results, we can re-run the extraction step using the stored transcript without hitting the YouTube API or Whisper again. This saves cost and latency for debugging.

---

## Query Patterns

All production query patterns and their supporting indexes:

| Query                                               | Index used                | Notes                            |
| --------------------------------------------------- | ------------------------- | -------------------------------- |
| `users.findOne({clerk_id})`                         | `uq_users_clerk_id`       | Auth middleware on every request |
| `trips.find({user_id}).sort({created_at: -1})`      | `idx_trips_user_created`  | Trip list page                   |
| `trips.findOne({share_token})`                      | `uq_trips_share_token`    | Public share URL                 |
| `trips.findOne({_id})`                              | `_id` default             | Trip detail page                 |
| `jobs.findOne({_id})`                               | `_id` default             | Client polling (every 3s)        |
| `jobs.findOne({url, status: queued})`               | `idx_jobs_url_status`     | Dedup before creating job        |
| `jobs.find({status: queued}).sort({created_at: 1})` | `idx_jobs_status_created` | Worker FIFO queue                |
| `jobs.find({user_id}).sort({created_at: -1})`       | `idx_jobs_user_created`   | Job history page                 |

---

## Index Validation

All indexes declared in `app/models/documents.py` under each class's `Settings.indexes` list. Run index validation in tests via `tests/test_models.py::TestUserDocument::test_index_strategy_*`.

To apply indexes to a live Atlas cluster, run:

```bash
poetry run python -c "
import asyncio
from app.config.database import connect_db, disconnect_db

async def main():
    await connect_db()
    print('Indexes applied.')
    await disconnect_db()

asyncio.run(main())
"
```

Beanie calls `create_indexes()` during `init_beanie()`, which is idempotent — safe to run repeatedly.

---

## Document Size Limits

MongoDB's BSON document size limit is **16 MB**. Practical limits for ReelRoutes:

| Document              | Estimated size                 | Limit | Safety margin |
| --------------------- | ------------------------------ | ----- | ------------- |
| User                  | ~500 bytes                     | 16 MB | Unlimited     |
| Job (with transcript) | ~50 KB (transcript ~30 KB avg) | 16 MB | 320× headroom |
| Trip (50 pins)        | ~25 KB                         | 16 MB | 640× headroom |

No concern about hitting document size limits at current scale.

---

## Future Schema Considerations

- **Collections (not yet built):** `chat_sessions` for AI trip chat history (Phase 5)
- **TTL index on jobs:** Add `expireAfterSeconds: 2592000` (30 days) on `completed_at` to auto-delete old job records
- **TTL index on guest trips:** Add `expireAfterSeconds: 604800` (7 days) on `created_at` where `user_id == null` to clean up anonymous trips
- **Atlas Search:** If full-text trip/pin search is needed (Phase 5+), add an Atlas Search index on `trips.title` and `pins.place_name`
