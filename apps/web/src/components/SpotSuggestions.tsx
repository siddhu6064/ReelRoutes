import { useState } from "react";

import { useAddSuggestedPin, useSuggestSpots, type SpotSuggestion } from "../api/client";

import styles from "./SpotSuggestions.module.css";

const CAT_ICONS: Record<string, string> = {
  restaurant: "🍽️",
  museum: "🏛️",
  park: "🌳",
  landmark: "🗿",
  market: "🛒",
  gallery: "🖼️",
  cafe: "☕",
  bar: "🍸",
  other: "📍",
};

interface SpotSuggestionsProps {
  tripId: string;
  userId?: string;
}

export default function SpotSuggestions({
  tripId,
  userId,
}: SpotSuggestionsProps): React.ReactElement {
  const suggestMutation = useSuggestSpots();
  const addPinMutation = useAddSuggestedPin();
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());

  const suggestions = suggestMutation.data?.suggestions ?? [];
  const hasSuggestions = suggestMutation.isSuccess;

  function handleFetch(): void {
    setAddedNames(new Set());
    suggestMutation.mutate({ tripId, ...(userId !== undefined ? { userId } : {}) });
  }

  function handleAdd(spot: SpotSuggestion): void {
    addPinMutation.mutate({ tripId, spot, ...(userId !== undefined ? { userId } : {}) });
    setAddedNames((prev) => new Set(prev).add(spot.name));
  }

  return (
    <section className={styles.wrap} aria-label="AI spot suggestions">
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>✨ AI Spot Suggestions</h3>
          {hasSuggestions && (
            <button
              type="button"
              className={styles.refresh}
              onClick={handleFetch}
              disabled={suggestMutation.isPending}
              aria-label="Refresh suggestions"
            >
              🔄
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          Places nearby that complement your itinerary, powered by GPT-4o
        </p>
      </div>

      {!hasSuggestions && !suggestMutation.isPending && !suggestMutation.isError && (
        <button type="button" className={styles.cta} onClick={handleFetch}>
          ✨ Suggest spots I might have missed
        </button>
      )}

      {suggestMutation.isPending && (
        <div className={styles.loading} aria-busy="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <p>GPT-4o is scouting nearby gems…</p>
        </div>
      )}

      {suggestMutation.isError && (
        <div className={styles.errorBox}>
          <p>Couldn't fetch suggestions right now.</p>
          <button type="button" className={styles.btnGhost} onClick={handleFetch}>
            Try again
          </button>
        </div>
      )}

      {hasSuggestions && !suggestMutation.isPending && (
        <ul className={styles.list} role="list">
          {suggestions.map((spot) => {
            const added = addedNames.has(spot.name);
            const adding =
              addPinMutation.isPending && addPinMutation.variables?.spot.name === spot.name;
            return (
              <li key={spot.name} role="listitem">
                <div
                  className={[styles.card, added ? styles.cardAdded : ""].filter(Boolean).join(" ")}
                >
                  <span className={styles.cardIcon}>{CAT_ICONS[spot.category] ?? "📍"}</span>
                  <div className={styles.cardBody}>
                    <p className={styles.cardName}>{spot.name}</p>
                    <p className={styles.cardAddress}>{spot.address}</p>
                    <p className={styles.cardReason}>💡 {spot.reason}</p>
                  </div>
                  <button
                    type="button"
                    className={[styles.addBtn, added ? styles.addBtnAdded : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleAdd(spot)}
                    disabled={adding || added}
                    aria-label={added ? `${spot.name} added` : `Add ${spot.name} to trip`}
                  >
                    {added ? "✓" : adding ? "…" : "+"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
