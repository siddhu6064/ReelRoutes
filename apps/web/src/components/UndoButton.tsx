import { useEffect, useRef, useState } from "react";

import { useUndoHistory, useUndoTrip } from "../api/client";

import styles from "./UndoButton.module.css";

interface Props {
  tripId: string;
  userId: string;
}

export function UndoButton({ tripId, userId }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [lastRestored, setLastRestored] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: historyData } = useUndoHistory(tripId, userId);
  const undo = useUndoTrip();

  const canUndo = (historyData?.snapshots?.length ?? 0) > 0 && !undo.isPending;

  function doUndo() {
    undo.mutate(
      { tripId, userId },
      {
        onSuccess: (data) => {
          if ("restored_at" in data) {
            setLastRestored(data.restored_at);
            setTimeout(() => setLastRestored(null), 3000);
          }
          setShowHistory(false);
        },
      },
    );
  }

  // Cmd+Z / Ctrl+Z keyboard shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) doUndo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, tripId, userId]);

  // Close popover when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className={styles.root} ref={containerRef}>
      <div className={styles.group}>
        <button
          className={canUndo ? styles.btn : styles.btnDisabled}
          onClick={doUndo}
          disabled={!canUndo}
          title="Undo last change (⌘Z)"
        >
          {undo.isPending ? "↩ Undoing…" : "↩ Undo"}
        </button>

        <button
          className={styles.historyToggle}
          onClick={() => setShowHistory((s) => !s)}
          title="View edit history"
          disabled={!canUndo}
        >
          ▾
        </button>
      </div>

      {lastRestored && (
        <div className={styles.toast}>
          ✓ Restored to {new Date(lastRestored).toLocaleTimeString()}
        </div>
      )}

      {showHistory && historyData && (
        <div className={styles.popover}>
          <p className={styles.popoverTitle}>
            Edit history ({historyData.snapshots.length}/{historyData.max_history})
          </p>
          <div className={styles.snapshots}>
            {historyData.snapshots.map((snap, i) => (
              <div key={snap.snapshot_at} className={styles.snap}>
                <span className={styles.snapTime}>
                  {new Date(snap.snapshot_at).toLocaleTimeString()}
                </span>
                {i === 0 && (
                  <button className={styles.restoreBtn} onClick={doUndo}>
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className={styles.shortcutHint}>Tip: use ⌘Z / Ctrl+Z</p>
        </div>
      )}
    </div>
  );
}
