import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import styles from "./DirectionsPanel.module.css";

type TravelMode = "driving" | "transit" | "walking";

interface Leg {
  from: string;
  to: string;
  duration_label: string;
  distance_label: string;
}

interface DirectionsData {
  mode: TravelMode;
  total_duration_label: string;
  total_distance_label: string;
  legs: Leg[];
  stop_count: number;
}

const MODE_LABELS: Record<TravelMode, string> = {
  driving: "🚗 Driving",
  transit: "🚌 Transit",
  walking: "🚶 Walking",
};

interface Props {
  tripId: string;
  userId?: string;
}

export function DirectionsPanel({ tripId, userId }: Props): React.ReactElement {
  const [mode, setMode] = useState<TravelMode>("driving");

  const params = new URLSearchParams({ mode });
  if (userId) params.set("user_id", userId);

  const { data, isLoading } = useQuery<DirectionsData>({
    queryKey: ["directions", tripId, mode],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/directions?${params.toString()}`);
      const json = (await res.json()) as { data: DirectionsData };
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h3 className={styles.title}>Directions</h3>
        <div className={styles.modeGroup}>
          {(["driving", "transit", "walking"] as TravelMode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? styles.modeActive : styles.mode}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className={styles.loading}>Loading directions…</p>}

      {data && !isLoading && (
        <>
          <div className={styles.summary}>
            <span className={styles.summaryItem}>
              🕐 <strong>{data.total_duration_label}</strong>
            </span>
            <span className={styles.summaryItem}>
              📍 <strong>{data.total_distance_label}</strong>
            </span>
            <span className={styles.summaryItem}>{data.stop_count} stops</span>
          </div>

          <div className={styles.legs}>
            {data.legs.map((leg, i) => (
              <div key={i} className={styles.leg}>
                <div className={styles.legRoute}>
                  <span className={styles.legFrom}>{leg.from}</span>
                  <span className={styles.legArrow}>→</span>
                  <span className={styles.legTo}>{leg.to}</span>
                </div>
                <div className={styles.legStats}>
                  <span>{leg.duration_label}</span>
                  <span className={styles.legDot}>·</span>
                  <span>{leg.distance_label}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
