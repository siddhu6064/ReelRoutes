import { useEffect, useState } from "react";

import { useScratchPlanStore } from "../../../stores/scratchPlanStore";
const STAGES = [
  { pct: 15, label: "Asking AI for the best spots…" },
  { pct: 35, label: "Geocoding locations…" },
  { pct: 55, label: "Sorting stops by proximity…" },
  { pct: 70, label: "Enriching with local tips…" },
  { pct: 85, label: "Finding great restaurants…" },
  { pct: 97, label: "Finishing your itinerary…" },
];

const STAGE_INTERVAL_MS = 3200;

export default function StepLoading() {
  const destination = useScratchPlanStore((s) => s.destination);
  const days = useScratchPlanStore((s) => s.days);

  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const { pct, label } = STAGES[stageIndex];

  return (
    <div className="loading-screen">
      {/* Animated globe / travel icon */}
      <div className="loading-icon" aria-hidden="true">
        <div className="loading-orbit">
          <div className="loading-planet">🌍</div>
          <div className="loading-satellite">✈️</div>
        </div>
      </div>

      <div className="loading-text">
        <h2 className="loading-title">
          Planning {days} day{days !== 1 ? "s" : ""} in{" "}
          <span className="loading-dest">{destination}</span>
        </h2>
        <p className="loading-stage">{label}</p>
      </div>

      {/* Progress bar */}
      <div className="loading-bar-track">
        <div
          className="loading-bar-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="loading-pct">{pct}%</p>

      <p className="loading-note">This usually takes 15–25 seconds. Hang tight!</p>
    </div>
  );
}
