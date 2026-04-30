/**
 * apps/mobile/components/SimilarTripsSheet.tsx
 *
 * Bottom sheet showing AI-powered similar trips.
 * Triggered by the "Similar trips" button on the trip detail screen.
 * Uses Atlas Vector Search via GET /api/trips/:id/similar.
 *
 * Renders nothing when vector search is unavailable (M0 cluster / no embedding).
 */
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { SimilarTrip } from "@/api/client";
import { useSimilarTrips } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";

const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const GREEN = "#0E9F6E";
const BLUE = "#1A56DB";

const PLATFORM_ICON: Record<string, string> = {
  youtube: "▶",
  instagram: "◈",
  tiktok: "♪",
  facebook: "f",
  twitter: "✕",
  unknown: "•",
};

interface Props {
  tripId: string;
  onClose: () => void;
  onTripPress: (tripId: string) => void;
}

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? GREEN : pct >= 80 ? BLUE : MUTED;
  return (
    <View style={[styles.scorePill, { borderColor: color }]}>
      <Text style={[styles.scoreText, { color }]}>{pct}% match</Text>
    </View>
  );
}

function TripRow({ trip, onPress }: { trip: SimilarTrip; onPress: () => void }) {
  const icon = PLATFORM_ICON[trip.platform] ?? "•";
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowPlatform}>
          {icon} {trip.platform}
        </Text>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {trip.title}
        </Text>
        <Text style={styles.rowMeta}>
          📍 {trip.pin_count} stops
          {trip.view_count > 0 ? `  ·  ${trip.view_count} views` : ""}
          {trip.video_creator ? `  ·  ${trip.video_creator}` : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <ScorePill score={trip.similarity_score} />
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

export default function SimilarTripsSheet({ tripId, onClose, onTripPress }: Props) {
  const { data, isLoading } = useSimilarTrips(tripId);
  const trips: SimilarTrip[] = data?.trips ?? [];

  return (
    <View style={styles.sheet}>
      {/* Handle */}
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>✨</Text>
          <View>
            <Text style={styles.headerTitle}>Similar Trips</Text>
            <Text style={styles.headerSub}>Powered by AI · Vector Search</Text>
          </View>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>
      </View>

      {/* Body */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={CORAL} />
          <Text style={styles.loadingText}>Finding similar trips…</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🗺</Text>
          <Text style={styles.emptyTitle}>No similar trips yet</Text>
          <Text style={styles.emptyBody}>
            This trip doesn't have a semantic embedding yet, or no similar public trips exist. Check
            back after more trips are imported.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TripRow trip={item} onPress={() => onTripPress(item.id)} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "70%",
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { fontSize: 22 },
  headerTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  headerSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  closeBtn: { padding: 6 },
  closeTxt: { color: MUTED, fontSize: 16 },
  list: { paddingVertical: 8 },
  separator: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: { flex: 1, gap: 3 },
  rowPlatform: { fontSize: 11, color: MUTED, textTransform: "capitalize" },
  rowTitle: { fontSize: 14, fontWeight: "600", color: TEXT, lineHeight: 19 },
  rowMeta: { fontSize: 12, color: MUTED },
  rowRight: { alignItems: "flex-end", gap: 6 },
  scorePill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scoreText: { fontSize: 11, fontWeight: "700" },
  chevron: { color: MUTED, fontSize: 18 },
  center: {
    padding: 40,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { color: MUTED, fontSize: 13, marginTop: 8 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  emptyBody: {
    color: MUTED,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
});
