import { useState } from "react";

import styles from "./LowConfidenceSuggestions.module.css";

import type { Pin } from "@/api/client";

import { useAddPin } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

interface Props {
  tripId: string;
  pins: Pin[];
}

/**
 * "Did we miss anything?" panel.
 *
 * Shows up to 3 pins with confidence < 0.6 that weren't geocoded,
 * letting the user tap to confirm and add them to the trip, or dismiss.
 */
export default function LowConfidenceSuggestions({
  tripId,
  pins,
}: Props): React.ReactElement | null {
  const { userId } = useAppStore();
  const { mutateAsync: addPin } = useAddPin();

  // Only show unresolved / low-confidence pins not manually added
  const suggestions = pins
    .filter((p) => !p.manuallyAdded && p.confidence < 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const visible = suggestions.filter((s) => !dismissed.has(s.id) && !added.has(s.id));

  if (visible.length === 0) return null;

  async function handleAdd(pin: Pin): Promise<void> {
    if (!userId) return;
    setAdding(pin.id);
    try {
      await addPin({
        tripId,
        user_id: userId,
        place_name: pin.placeName,
        lat: pin.lat,
        lng: pin.lng,
        address: pin.address,
      });
      setAdded((prev) => new Set([...prev, pin.id]));
    } finally {
      setAdding(null);
    }
  }

  function dismiss(pinId: string): void {
    setDismissed((prev) => new Set([...prev, pinId]));
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.icon}>🔍</span>
        <div>
          <h3 className={styles.title}>Did we miss anything?</h3>
          <p className={styles.subtitle}>
            {visible.length} low-confidence location{visible.length !== 1 ? "s" : ""} detected — tap
            to confirm or dismiss
          </p>
        </div>
      </div>

      <div className={styles.suggestions}>
        {visible.map((pin) => (
          <div key={pin.id} className={styles.suggestion}>
            <div className={styles.suggestionInfo}>
              <span className={styles.placeName}>{pin.placeName}</span>
              {pin.contextQuote && (
                <span className={styles.quote}>"{pin.contextQuote.slice(0, 70)}"</span>
              )}
              <div className={styles.confBar}>
                <div className={styles.confFill} style={{ width: `${pin.confidence * 100}%` }} />
              </div>
              <span className={styles.confLabel}>
                {Math.round(pin.confidence * 100)}% confident
              </span>
            </div>
            <div className={styles.actions}>
              {userId && (
                <button
                  className={styles.addBtn}
                  onClick={() => handleAdd(pin)}
                  disabled={adding === pin.id}
                >
                  {adding === pin.id ? "Adding…" : "+ Add"}
                </button>
              )}
              <button className={styles.dismissBtn} onClick={() => dismiss(pin.id)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
