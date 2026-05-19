# Mobile AI Voice Input Exploration (Phase M4)

Date: 2026-04-21
Scope: **exploration only** for voice-to-text input into existing AI chat flow.

---

## 1) Current stack feasibility (React Native + Expo)

### What we already have
- Expo app with React Native and existing AI chat modal (`AIInsightsChatModal`).
- Text chat flow is complete (`prompt` -> `sendQuestion` -> `/api/ai/chat-insights`).
- Session persistence and retry behavior are already in place.

### Key platform reality
- **`expo-speech` is text-to-speech (TTS), not speech-to-text (STT)**.
- For voice input, Expo can record audio (`expo-av` / related media APIs), but transcription still requires:
  - a native STT module, or
  - an online transcription service.

Conclusion: voice input is feasible, but STT requires either native dependency or backend/external transcription.

---

## 2) Candidate approaches

## Option A — Minimal native STT module (on-device when available)

Example direction:
- Expo config plugin + native bridge package for platform speech recognition.
- Stream partial/final transcript events into chat composer.

Pros:
- Fast perceived latency.
- Potentially lower server cost.
- Can support partial results for better UX.

Cons:
- Native dependency and config complexity.
- Behavior differs across iOS/Android implementations.
- Language/accent support quality varies by device/OS.
- Harder to keep consistent in Expo-managed workflows depending on module maturity.

---

## Option B — Audio capture + server transcription (recommended baseline)

Flow:
1. Request mic permission.
2. Record short utterance in app.
3. Upload audio to backend transcription endpoint.
4. Receive transcript and populate existing prompt field.
5. User can edit transcript, then send through existing text chat submit.

Pros:
- Uses existing chat architecture with minimal UX disruption.
- Centralized quality/telemetry controls server-side.
- Easier to add moderation, redaction, and language strategy in one place.
- Keeps client UI simple and deterministic.

Cons:
- Higher latency than on-device STT.
- Ongoing transcription cost.
- Requires robust audio upload handling and backend hardening.
- Requires network for transcription (unless adding separate offline engine).

---

## Option C — Third-party SDK end-to-end STT

Pros:
- Faster to prototype high-accuracy multilingual transcription.
- Some vendors support punctuation, diarization, confidence scores.

Cons:
- Vendor lock-in and recurring costs.
- Privacy/compliance review overhead.
- More external operational dependency.

---

## 3) Key considerations

## Permissions
- Must request microphone permission clearly and contextually.
- Handle deny/permanently denied states with concise fallback to typing.

## Latency + UX
- Voice UX should expose 3 states clearly:
  - idle
  - listening/recording
  - transcribing
- For first version, transcript should be editable before send.

## Accuracy + language support
- Start with a default locale and explicit language setting.
- Track correction/edit rate after transcription as quality signal.
- Keep manual text input always available.

## Cost
- On-device/native STT: lower variable cost, higher client complexity.
- Server/third-party STT: variable API cost per minute + storage/egress overhead.

## Offline behavior
- If online transcription chosen, offline means voice unavailable.
- Should degrade gracefully: show brief message and allow typed prompt immediately.

---

## 4) Integration with current AI chat flow

Current flow:
- User enters `prompt` in composer.
- `sendQuestion` posts to `/api/ai/chat-insights`.

Voice integration (later):
- Add a small voice-input action near send button.
- Voice only fills `prompt` text (does not auto-send in v1).
- User reviews/edits transcript and taps existing send button.
- Reuse existing submit guards, loading, retry, and session persistence behavior.

This keeps voice as an **input modality** only; no separate “voice chat” protocol needed.

---

## 5) Recommended approach

Recommended primary path: **Option B (audio capture + backend transcription)**.

Why:
- Lowest risk integration with the current architecture.
- Most predictable UX and safety controls.
- Minimal disruption to existing modal/chat state logic.

Recommended secondary path to evaluate in parallel:
- **Option A** for on-device STT only if a stable Expo-compatible module is validated for both platforms and language coverage.

---

## 6) Minimal implementation path (future build, not in this task)

Phase V1 (smallest safe):
1. Add mic permission + record button in AI chat composer.
2. Record short clip (max duration guard).
3. Send to backend `/ai/transcribe` endpoint.
4. Populate transcript into `prompt`.
5. User edits + submits via existing `sendQuestion`.
6. Add lightweight telemetry:
   - permission denied rate
   - transcription latency
   - transcription failure rate
   - transcript edit distance proxy (typed edits before send)

Phase V1.1:
- Add language selector (or locale auto-detect fallback).
- Add clearer interruption/cancel states for recording/transcribing.

---

## 7) Risks / open questions

1. **Backend readiness**: no transcription endpoint currently defined in this phase.
2. **Privacy policy updates**: microphone and audio processing disclosures may be required.
3. **Cost controls**: rate limits, max duration, and abuse controls needed before rollout.
4. **Cross-platform consistency**: audio format and quality handling across devices.
5. **Transcript confidence**: whether to expose confidence score or keep hidden initially.
6. **Accessibility**: how voice and keyboard paths coexist without UX clutter.

---

## 8) Decision summary

- Voice input is feasible in current stack.
- Best near-term approach is transcription-to-text feeding existing chat prompt.
- No production implementation done in this task per scope.
