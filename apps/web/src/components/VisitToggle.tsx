import { useState } from "react";
import { useUnvisitPin, useVisitPin } from "../api/client";
import DiaryModal from "./DiaryModal";
import styles from "./VisitToggle.module.css";

interface VisitToggleProps {
  tripId: string;
  pinId: string;
  userId?: string;
  visitedAt?: string;
  diaryEntry?: string;
  placeName: string;
}

export default function VisitToggle({
  tripId,
  pinId,
  userId,
  visitedAt,
  diaryEntry,
  placeName,
}: VisitToggleProps) {
  const [showModal, setShowModal] = useState(false);
  const isVisited = !!visitedAt;

  const visitMutation = useVisitPin();
  const unvisitMutation = useUnvisitPin();
  const isPending = visitMutation.isPending || unvisitMutation.isPending;

  function handleClick() {
    if (isVisited) {
      unvisitMutation.mutate({ tripId, pinId, userId });
    } else {
      setShowModal(true);
    }
  }

  function handleConfirm(entry: string) {
    visitMutation.mutate({
      tripId,
      pinId,
      userId,
      ...(entry.trim() ? { diaryEntry: entry } : {}),
    });
    setShowModal(false);
  }

  function handleSkip() {
    visitMutation.mutate({ tripId, pinId, userId });
    setShowModal(false);
  }

  const visitedDate = visitedAt
    ? new Date(visitedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <>
      <div className={styles.wrap}>
        <button
          type="button"
          className={[
            styles.toggle,
            isVisited ? styles.visited : styles.unvisited,
            isPending ? styles.pending : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={handleClick}
          disabled={isPending}
          aria-pressed={isVisited}
          aria-label={
            isVisited
              ? `Unmark ${placeName} as visited`
              : `Mark ${placeName} as visited`
          }
        >
          <span aria-hidden="true">
            {isPending ? "⏳" : isVisited ? "✅" : "⬜"}
          </span>
          <span>{isVisited ? "Visited" : "Visit"}</span>
        </button>
        {visitedDate && (
          <span className={styles.date}>{visitedDate}</span>
        )}
      </div>

      {showModal && (
        <DiaryModal
          placeName={placeName}
          initialEntry={diaryEntry ?? ""}
          onConfirm={handleConfirm}
          onSkip={handleSkip}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
