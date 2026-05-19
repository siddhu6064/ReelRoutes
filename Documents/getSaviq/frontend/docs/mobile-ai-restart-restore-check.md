# Mobile AI Chat Restart Restore Check (Phase M4)

Date: 2026-04-21

## Goal
Validate whether AI chat conversation restore works after app restart, and document the final behavior.

## Findings before this pass
- Chat sessions were persisted only in-memory (Zustand state).
- Reopen in same runtime worked.
- App restart restore was **not** supported.

## Implementation in this pass
- Added durable storage for `aiChatSessions` in `AsyncStorage` (`ai_chat_sessions_v1`) via store actions.
- Added `hydrateAIChatSessions()` store action and called it during auth bootstrap.
- Added sanitize-on-hydration behavior:
  - any persisted `pending` assistant messages are degraded into `failed` retry-capable messages.
  - profile-keyed session structure is preserved.

## Expected restart behavior now
1. User chats in profile A, closes app, reopens app.
2. Opening AI modal for profile A restores prior thread + composer draft from storage.
3. Switching to profile B shows only B thread.
4. Switching back to A restores A thread.
5. Any pending message from pre-restart is shown as interrupted/failed with retry affordance (not left stuck pending).

## Scope/limitations
- Persistence is still lightweight and profile-scoped only.
- No multi-session timeline/history UI added.
- No voice/input modality changes in this pass.
