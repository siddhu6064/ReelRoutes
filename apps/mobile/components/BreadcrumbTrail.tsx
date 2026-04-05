/**
 * W18 — Fading breadcrumb trail overlay for react-native-maps.
 * Renders the visited_path as a polyline that fades from coral (recent)
 * to transparent (older) to show the user's travel history.
 *
 * Usage:
 *   <MapView>
 *     <BreadcrumbTrail tripId={id} userId={userId} apiBase={base} />
 *   </MapView>
 */

import { useQuery } from "@tanstack/react-query";
import { Polyline } from "react-native-maps";

interface PathPoint {
  lat: number;
  lng: number;
  recorded_at: string;
}

interface Props {
  tripId: string;
  userId: string;
  apiBase: string;
  /** Refresh interval in ms — defaults to 15s */
  refetchInterval?: number;
}

export function BreadcrumbTrail({
  tripId,
  userId,
  apiBase,
  refetchInterval = 15_000,
}: Props): React.JSX.Element | null {
  const { data } = useQuery<PathPoint[]>({
    queryKey: ["breadcrumb", tripId],
    queryFn: async () => {
      const params = new URLSearchParams({
        user_id: userId,
        last_n: "200", // last 200 points for trail
      });
      const res = await fetch(`${apiBase}/api/trips/${tripId}/path?${params.toString()}`);
      const json = (await res.json()) as { data: { path: PathPoint[] } };
      return json.data.path;
    },
    refetchInterval,
    staleTime: refetchInterval / 2,
  });

  if (!data || data.length < 2) return null;

  // Build segments with decreasing opacity for a fading trail effect
  const segments = buildFadingSegments(data);

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={i}
          coordinates={seg.coords}
          strokeColor={`rgba(216, 90, 48, ${seg.opacity})`}
          strokeWidth={3}
        />
      ))}
    </>
  );
}

interface Segment {
  coords: { latitude: number; longitude: number }[];
  opacity: number;
}

/**
 * Split the path into segments with decreasing opacity.
 * The most recent segment is fully opaque; older ones fade out.
 */
function buildFadingSegments(path: PathPoint[], steps = 8): Segment[] {
  if (path.length < 2) return [];

  const chunkSize = Math.ceil(path.length / steps);
  const segments: Segment[] = [];

  for (let i = 0; i < steps; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize + 1, path.length); // +1 for overlap
    const slice = path.slice(start, end);
    if (slice.length < 2) continue;

    const opacity = 0.15 + (i / steps) * 0.85; // 0.15 → 1.0

    segments.push({
      coords: slice.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      opacity: Math.round(opacity * 100) / 100,
    });
  }

  return segments;
}
