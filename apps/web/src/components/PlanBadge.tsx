/**
 * components/PlanBadge.tsx
 *
 * Small badge shown in the NavBar indicating Free or Pro plan.
 * Clicking on Free opens the UpgradeModal.
 */
import { useState } from "react";

import { usePlanStatus } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

import UpgradeModal from "./UpgradeModal";

export default function PlanBadge(): React.ReactElement | null {
  const { userId } = useAppStore();
  const { data } = usePlanStatus(userId ?? undefined);
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!data) return null;

  const isPro = data.plan === "pro";

  return (
    <>
      <button
        onClick={() => !isPro && setShowUpgrade(true)}
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: isPro ? "1.5px solid #0E9F6E" : "1.5px solid #D1D5DB",
          background: isPro ? "#ECFDF5" : "#F9FAFB",
          color: isPro ? "#065F46" : "#6B7280",
          fontSize: 12,
          fontWeight: 700,
          cursor: isPro ? "default" : "pointer",
          letterSpacing: "0.03em",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {isPro ? (
          <>⚡ Pro</>
        ) : (
          <>
            Free · {data.trips_remaining}/{data.trip_limit} trips
            <span style={{ fontSize: 10, marginLeft: 2 }}>↑</span>
          </>
        )}
      </button>

      {showUpgrade && (
        <UpgradeModal
          reason="trip_limit"
          tripCount={data.trip_count}
          tripLimit={data.trip_limit ?? 5}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </>
  );
}
