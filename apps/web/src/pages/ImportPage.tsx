import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProcessVideo } from "@/api/client";
import { useAppStore } from "@/stores/appStore";
import styles from "./ImportPage.module.css";

const PLATFORMS = [
  { id: "youtube", label: "YouTube", pattern: /youtube\.com|youtu\.be/, color: "#FF0000", icon: "▶" },
  { id: "instagram", label: "Instagram", pattern: /instagram\.com/, color: "#E1306C", icon: "◈" },
  { id: "tiktok", label: "TikTok", pattern: /tiktok\.com/, color: "#010101", icon: "♪" },
  { id: "facebook", label: "Facebook", pattern: /facebook\.com|fb\.watch/, color: "#1877F2", icon: "f" },
  { id: "twitter", label: "X / Twitter", pattern: /twitter\.com|x\.com/, color: "#000", icon: "𝕏" },
];

function detectPlatform(url: string) {
  return PLATFORMS.find((p) => p.pattern.test(url)) ?? null;
}

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { mutateAsync: processVideo, isPending } = useProcessVideo();
  const { userId, setGuestJob } = useAppStore();

  const detected = url ? detectPlatform(url) : null;
  const valid = url.trim() !== "" && isValidUrl(url.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError("Please enter a valid video URL."); return; }
    setError("");

    try {
      const result = await processVideo({ url: url.trim(), userId: userId ?? undefined });
      if (!userId) {
        setGuestJob({ jobId: result.jobId, url: url.trim(), tripId: null });
      }
      navigate(`/processing/${result.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.badge}>AI-Powered Trip Extraction</div>
        <h1 className={styles.title}>
          Turn any travel video<br />into a trip plan
        </h1>
        <p className={styles.sub}>
          Paste a YouTube, Instagram, TikTok, or Facebook URL.
          We extract every location and build your interactive map.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputWrap}>
            <span className={styles.inputIcon}>
              {detected ? (
                <span style={{ color: detected.color }}>{detected.icon}</span>
              ) : "🔗"}
            </span>
            <input
              className={styles.input}
              type="url"
              placeholder="Paste a travel video URL…"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              autoFocus
              autoComplete="off"
            />
            {detected && (
              <span className={styles.platformBadge} style={{ background: detected.color }}>
                {detected.label}
              </span>
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.btn}
            type="submit"
            disabled={!valid || isPending}
          >
            {isPending ? (
              <><span className={styles.spinner} /> Processing…</>
            ) : (
              "Extract Trip →"
            )}
          </button>
        </form>

        <div className={styles.platforms}>
          {PLATFORMS.map((p) => (
            <span
              key={p.id}
              className={`${styles.platformChip} ${detected?.id === p.id ? styles.active : ""}`}
              style={detected?.id === p.id ? { borderColor: p.color, color: p.color } : {}}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.steps}>
        {[
          { n: "01", title: "Paste any URL", body: "YouTube, Instagram, TikTok, Facebook, or X" },
          { n: "02", title: "AI extracts locations", body: "GPT-4o reads the transcript and finds every place mentioned" },
          { n: "03", title: "Edit your trip map", body: "Reorder stops, add notes, chat with your AI travel assistant" },
        ].map((s) => (
          <div key={s.n} className={styles.step}>
            <span className={styles.stepN}>{s.n}</span>
            <strong>{s.title}</strong>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
