import { useState } from "react";

import styles from "./PinDetailPanel.module.css";

import type { Pin } from "@/api/client";

import { useUpdatePin, useDeletePin } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

interface Props {
  pin: Pin;
  tripId: string;
  onClose: () => void;
}

function StarRating({ rating, total }: { rating: number; total?: number }): React.ReactElement {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className={styles.stars}>
      {"★".repeat(full)}
      {half ? "½" : ""}
      {"☆".repeat(5 - full - (half ? 1 : 0))}
      <span className={styles.starsNum}> {rating.toFixed(1)}</span>
      {total ? (
        <span className={styles.starsCount}> · {total.toLocaleString()} reviews</span>
      ) : null}
    </span>
  );
}

function OpenBadge({ openNow }: { openNow: boolean | undefined }): React.ReactElement {
  if (openNow === undefined) return null;
  return (
    <span className={styles.openBadge} data-open={openNow}>
      {openNow ? "● Open now" : "● Closed"}
    </span>
  );
}

export default function PinDetailPanel({ pin, tripId, onClose }: Props): React.ReactElement {
  const { userId } = useAppStore();
  const [notes, setNotes] = useState(pin.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(pin.tags);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  const { mutateAsync: updatePin } = useUpdatePin();
  const { mutateAsync: deletePin } = useDeletePin();

  async function handleSave(): void {
    if (!userId) return;
    setSaving(true);
    try {
      await updatePin({ tripId, pinId: pin.id, user_id: userId, notes, tags });
    } finally {
      setSaving(false);
    }
  }

  function addTag(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  }

  async function handleDelete(): void {
    if (!userId) return;
    await deletePin({ tripId, pinId: pin.id, userId });
    onClose();
  }

  const conf = pin.confidence;
  const confColor = conf >= 0.8 ? "var(--green)" : conf >= 0.5 ? "var(--yellow)" : "var(--red)";

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.stopNum}>#{pin.order + 1}</div>
        <div className={styles.headerText}>
          <h2 className={styles.placeName}>{pin.placeName}</h2>
          {pin.address && <p className={styles.address}>{pin.address}</p>}
        </div>
        <button className={styles.close} onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {/* ── Rating + Open status ── */}
      {(pin.rating !== undefined || pin.openNow !== undefined) && (
        <div className={styles.enrichRow}>
          {pin.rating !== undefined && (
            <StarRating
              rating={pin.rating}
              {...(pin.userRatingsTotal !== undefined ? { total: pin.userRatingsTotal } : {})}
            />
          )}
          <OpenBadge openNow={pin.openNow} />
        </div>
      )}

      {/* ── Opening hours ── */}
      {pin.openingHoursText && pin.openingHoursText.length > 0 && (
        <div className={styles.hoursBlock}>
          <button className={styles.hoursToggle} onClick={() => setHoursOpen((o) => !o)}>
            🕐 Hours {hoursOpen ? "▲" : "▼"}
          </button>
          {hoursOpen && (
            <ul className={styles.hoursList}>
              {pin.openingHoursText.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── External links ── */}
      <div className={styles.linkRow}>
        {pin.videoDeepLink && (
          <a className={styles.videoLink} href={pin.videoDeepLink} target="_blank" rel="noreferrer">
            ▶ Watch in video
          </a>
        )}
        {pin.website && (
          <a className={styles.extLink} href={pin.website} target="_blank" rel="noreferrer">
            🌐 Website
          </a>
        )}
        {pin.phoneNumber && (
          <a className={styles.extLink} href={`tel:${pin.phoneNumber}`}>
            📞 {pin.phoneNumber}
          </a>
        )}
      </div>

      {/* ── Context quote ── */}
      {pin.contextQuote && (
        <blockquote className={styles.quote}>
          <span className={styles.quoteIcon}>"</span>
          {pin.contextQuote}
        </blockquote>
      )}

      <div className={styles.meta}>
        {pin.timestampHint !== undefined && (
          <span className={styles.metaChip}>
            ⏱ {Math.floor(pin.timestampHint / 60)}:
            {String(Math.round(pin.timestampHint % 60)).padStart(2, "0")}
          </span>
        )}
        {!pin.manuallyAdded && (
          <span className={styles.metaChip} style={{ color: confColor }}>
            AI {Math.round(conf * 100)}% confident
          </span>
        )}
        {pin.manuallyAdded && <span className={styles.metaChip}>Added manually</span>}
        {pin.city && <span className={styles.metaChip}>📍 {pin.city}</span>}
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Notes</label>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="Add personal notes, tips, or reminders…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Tags</label>
        <div className={styles.tags}>
          {tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
              <button
                className={styles.tagRemove}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            placeholder="Add tag + Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
          />
        </div>
      </div>

      {pin.placeId && (
        <a
          className={styles.mapsLink}
          href={`https://www.google.com/maps/place/?q=place_id:${pin.placeId}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Google Maps ↗
        </a>
      )}

      <div className={styles.actions}>
        {userId && (
          <button
            className={styles.saveBtn}
            onClick={() => {
              void handleSave();
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        )}
        {!confirmDelete ? (
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            Remove stop
          </button>
        ) : (
          <div className={styles.confirmRow}>
            <span className={styles.confirmText}>Remove this stop?</span>
            <button
              className={styles.confirmYes}
              onClick={() => {
                void handleDelete();
              }}
            >
              Yes, remove
            </button>
            <button className={styles.confirmNo} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
