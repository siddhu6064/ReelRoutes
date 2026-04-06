/**
 * apps/mobile/app/(tabs)/explore.tsx
 *
 * Explore tab — community feed of public trips.
 * Uses ExploreTab component already built in components/.
 */
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";

import { ExploreTab } from "@/components/ExploreTab";

export default function ExploreScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  return (
    <ExploreTab userId={userId ?? ""} onTripPress={(tripId) => router.push(`/trip/${tripId}`)} />
  );
}
