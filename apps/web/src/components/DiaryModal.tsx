import { useEffect, useRef, useState } from "react";

import styles from "./DiaryModal.module.css";

interface DiaryModalProps {
  placeName: string;
  initialEntry: string;
  onConfirm: (entry: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

const MAX = 2000;

export default function DiaryModal({
  placeName,
  initialEntry,
  onConfirm,
  onSkip,
  onClose,
}: DiaryModalProps): React.ReactElement {
  const [entry, setEntry] = useState(initialEntry);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const remaining = MAX - entry.length;
  const isOver = remaining < 0;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diary-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="diary-title" className={styles.title}>
            You visited {placeName}! 🎉
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className={styles.subtitle}>
          Add a note to your trip diary — or skip and just mark it visited.
        </p>

        <textarea
          ref={ref}
          className={[styles.textarea, isOver ? styles.textareaError : ""]
            .filter(Boolean)
            .join(" ")}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="What did you think? Favourite memory? Tips for others…"
          rows={5}
          maxLength={MAX + 50}
        />

        <p
          className={[styles.counter, isOver ? styles.counterError : ""].filter(Boolean).join(" ")}
        >
          {remaining < 200 ? `${remaining} characters remaining` : `${entry.length} / ${MAX}`}
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.btnSecondary} onClick={onSkip}>
            Skip note
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={isOver}
            onClick={() => onConfirm(entry)}
          >
            Save &amp; mark visited
          </button>
        </div>
      </div>
    </div>
  );
}
