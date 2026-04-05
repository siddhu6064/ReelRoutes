import { useState } from "react";

import { type TripCard as TripCardType, useDuplicateTrip, useIncrementView } from "../api/client";

import styles from "./TripCard.module.css";

const PLATFORM_EMOJI: Record<string, string> = {
  youtube: "▶️",
  instagram: "📸",
  tiktok: "🎵",
  facebook: "👤",
  twitter: "🐦",
};

interface Props {
  trip: TripCardType;
  userId: string;
  onClick?: (tripId: string) => void;
}

export function TripCard({ trip, userId, onClick }: Props) {
  const [duplicated, setDuplicated] = useState(false);
  const incrementView = useIncrementView();
  const duplicate = useDuplicateTrip();

  function handleClick() {
    incrementView.mutate(trip.id);
    onClick?.(trip.id);
  }

  function handleDuplicate(e: React.MouseEvent) {
    e.stopPropagation();
    duplicate.mutate({ tripId: trip.id, userId }, { onSuccess: () => setDuplicated(true) });
  }

  const platformEmoji = trip.platform ? (PLATFORM_EMOJI[trip.platform] ?? "🎬") : "🎬";

  return (
    <div className={styles.card} onClick={handleClick} role="button" tabIndex={0}>
      <div className={styles.header}>
        <span className={styles.platform} title={trip.platform ?? "video"}>
          {platformEmoji}
        </span>
        <span className={styles.pinCount}>{trip.pin_count} stops</span>
      </div>

      <h3 className={styles.title}>{trip.title}</h3>

      {trip.video_creator && <p className={styles.creator}>by {trip.video_creator}</p>}

      <div className={styles.stats}>
        <span className={styles.stat}>👁 {trip.view_count}</span>
        <span className={styles.stat}>📤 {trip.share_count}</span>
      </div>

      <button
        className={duplicated ? styles.duplicatedBtn : styles.duplicateBtn}
        onClick={handleDuplicate}
        disabled={duplicate.isPending || duplicated}
      >
        {duplicate.isPending
          ? "Copying…"
          : duplicated
            ? "✓ Added to your trips"
            : "Duplicate this trip"}
      </button>
    </div>
  );
}
