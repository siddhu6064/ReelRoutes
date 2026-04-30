/**
 * components/SimilarTrips.tsx
 *
 * Shows semantically similar trips below the current trip map.
 * Uses Atlas Vector Search via GET /api/trips/:id/similar.
 *
 * Renders nothing when:
 *   - The trip has no embedding yet (loading / newly created)
 *   - The cluster doesn't support vector search (M0/staging)
 *   - No similar trips found above the similarity threshold
 */

import { useSimilarTrips } from "@/api/client";
import type { SimilarTrip } from "@/api/client";

const PLATFORM_EMOJI: Record<string, string> = {
  youtube: "▶",
  instagram: "◈",
  tiktok: "♪",
  facebook: "f",
  twitter: "✕",
  unknown: "•",
};

interface Props {
  tripId: string;
  onTripClick?: (tripId: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 90 ? "#0E9F6E" : pct >= 80 ? "#1A56DB" : "#6B7280";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: color + "18",
        borderRadius: 6,
        padding: "2px 6px",
        letterSpacing: "0.02em",
      }}
    >
      {pct}% match
    </span>
  );
}

function TripCard({ trip, onClick }: { trip: SimilarTrip; onClick: () => void }) {
  const icon = PLATFORM_EMOJI[trip.platform] ?? "•";

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "12px 14px",
        textAlign: "left",
        cursor: "pointer",
        width: 220,
        flexShrink: 0,
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          "0 4px 16px rgba(0,0,0,0.10)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        (e.currentTarget as HTMLButtonElement).style.transform = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#9CA3AF" }}>
          {icon} {trip.platform}
        </span>
        <ScoreBadge score={trip.similarity_score} />
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#111827",
          lineHeight: 1.3,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {trip.title}
      </div>

      <div
        style={{ display: "flex", gap: 8, fontSize: 12, color: "#6B7280" }}
      >
        <span>📍 {trip.pin_count} stops</span>
        {trip.view_count > 0 && <span>· {trip.view_count} views</span>}
      </div>

      {trip.video_creator && (
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>
          by {trip.video_creator}
        </div>
      )}
    </button>
  );
}

export default function SimilarTrips({ tripId, onTripClick }: Props) {
  const { data, isLoading, isError } = useSimilarTrips(tripId);

  // Don't show anything while loading or on error — keeps the UI clean
  if (isLoading || isError) return null;

  const trips = data?.data?.trips ?? [];
  if (trips.length === 0) return null;

  return (
    <section
      style={{
        padding: "20px 0",
        borderTop: "1px solid #F3F4F6",
      }}
    >
      <div
        style={{
          padding: "0 20px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>✨</span>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "#111827",
          }}
        >
          Similar trips
        </h3>
        <span
          style={{
            fontSize: 12,
            color: "#9CA3AF",
            fontWeight: 400,
          }}
        >
          Powered by AI
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          padding: "4px 20px 8px",
          scrollbarWidth: "none",
        }}
      >
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onClick={() => onTripClick?.(trip.id)}
          />
        ))}
      </div>
    </section>
  );
}
