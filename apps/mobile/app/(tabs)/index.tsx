/**
 * apps/mobile/app/(tabs)/index.tsx
 *
 * Task 6 — Trip dashboard: FlatList of trip cards with thumbnail,
 * title, platform badge, stop count, and relative date.
 */
import { FlatList, Image, Pressable, StyleSheet, Text, View, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUserTrips, type Trip } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  instagram: "#E1306C",
  tiktok: "#010101",
  facebook: "#1877F2",
  twitter: "#000",
  unknown: "#6b6b62",
};

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const platformColor = PLATFORM_COLORS[trip.platform] ?? MUTED;

  return (
    <Pressable style={styles.card} onPress={onPress} android_ripple={{ color: "#ffffff10" }}>
      {/* Thumbnail */}
      <View style={styles.thumb}>
        {trip.thumbnailUrl ? (
          <Image source={{ uri: trip.thumbnailUrl }} style={styles.thumbImg} />
        ) : (
          <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
            <Text style={styles.thumbIcon}>◈</Text>
          </View>
        )}
        <View style={[styles.platformBadge, { backgroundColor: platformColor }]}>
          <Text style={styles.platformText}>{trip.platform}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {trip.title}
        </Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>
            {trip.pinCount} stop{trip.pinCount !== 1 ? "s" : ""}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.cardMetaText}>{relativeDate(trip.createdAt)}</Text>
          {trip.isShared && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={[styles.cardMetaText, { color: CORAL }]}>Shared</Text>
            </>
          )}
        </View>
      </View>

      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>◈</Text>
      <Text style={styles.emptyTitle}>No trips yet</Text>
      <Text style={styles.emptySub}>
        Paste any travel video URL and we'll extract every location into a map.
      </Text>
      <Pressable style={styles.emptyBtn} onPress={onImport}>
        <Text style={styles.emptyBtnText}>Import your first video →</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useUserTrips(userId ?? null);

  const trips = data?.items ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <Text style={styles.brandIcon}>◈</Text>
          <Text style={styles.brandName}>ReelRoutes</Text>
        </View>
        {userId && (
          <Text style={styles.tripCount}>
            {data?.total ?? 0} trip{(data?.total ?? 0) !== 1 ? "s" : ""}
          </Text>
        )}
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TripCard trip={item} onPress={() => router.push(`/trip/${item.id}`)} />
        )}
        contentContainerStyle={trips.length === 0 ? styles.listEmpty : styles.list}
        ListEmptyComponent={
          !isLoading ? <EmptyState onImport={() => router.push("/new-trip")} /> : null
        }
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={CORAL} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0f0d" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandIcon: { color: CORAL, fontSize: 18, fontWeight: "900" },
  brandName: { color: TEXT, fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },
  tripCount: { color: MUTED, fontSize: 13 },

  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  listEmpty: { flex: 1 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
  },

  thumb: { width: 88, height: 72, position: "relative" },
  thumbImg: { width: 88, height: 72 },
  thumbPlaceholder: {
    backgroundColor: SURFACE2,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbIcon: { color: CORAL, fontSize: 24 },

  platformBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  platformText: { color: "#fff", fontSize: 9, fontWeight: "700", textTransform: "capitalize" },

  cardBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: "700", lineHeight: 18, marginBottom: 4 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { color: MUTED, fontSize: 11 },
  dot: { color: BORDER, fontSize: 11 },

  chevron: { color: MUTED, fontSize: 22, paddingRight: 12 },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
    paddingTop: 80,
  },
  emptyIcon: { fontSize: 48, color: CORAL },
  emptyTitle: { color: TEXT, fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  emptySub: { color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: CORAL,
    borderRadius: 999,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
