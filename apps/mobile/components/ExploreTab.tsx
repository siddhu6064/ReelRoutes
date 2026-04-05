import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type TripCard,
  useExplore,
  useTrending,
  useDuplicateTrip,
  useIncrementView,
} from "../api/client";

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook", "twitter"];
const PLATFORM_EMOJI: Record<string, string> = {
  youtube: "▶",
  instagram: "📷",
  tiktok: "♪",
  facebook: "f",
  twitter: "𝕏",
};

interface TripCardItemProps {
  trip: TripCard;
  userId: string;
  onPress: (id: string) => void;
}

function TripCardItem({ trip, userId, onPress }: TripCardItemProps) {
  const [copied, setCopied] = useState(false);
  const incrementView = useIncrementView();
  const duplicate = useDuplicateTrip();

  function handlePress() {
    incrementView.mutate(trip.id);
    onPress(trip.id);
  }

  function handleDuplicate() {
    duplicate.mutate({ tripId: trip.id, userId }, { onSuccess: () => setCopied(true) });
  }

  return (
    <Pressable style={styles.card} onPress={handlePress}>
      <View style={styles.cardHeader}>
        <Text style={styles.platformBadge}>{PLATFORM_EMOJI[trip.platform ?? ""] ?? "🎬"}</Text>
        <Text style={styles.pinCount}>{trip.pin_count} stops</Text>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>
        {trip.title}
      </Text>

      {!!trip.video_creator && (
        <Text style={styles.creator} numberOfLines={1}>
          by {trip.video_creator}
        </Text>
      )}

      <View style={styles.statsRow}>
        <Text style={styles.stat}>👁 {trip.view_count}</Text>
        <Text style={styles.stat}>📤 {trip.share_count}</Text>
      </View>

      <Pressable
        style={copied ? styles.duplicatedBtn : styles.duplicateBtn}
        onPress={handleDuplicate}
        disabled={duplicate.isPending || copied}
      >
        <Text style={copied ? styles.duplicatedBtnText : styles.duplicateBtnText}>
          {duplicate.isPending ? "Copying…" : copied ? "✓ Added" : "Duplicate trip"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

interface Props {
  userId: string;
  onTripPress: (tripId: string) => void;
}

export function ExploreTab({ userId, onTripPress }: Props) {
  const [destination, setDestination] = useState("");
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [showTrending, setShowTrending] = useState(false);

  const exploreQuery = useExplore(
    showTrending
      ? {}
      : {
          ...(destination ? { destination } : {}),
          ...(platform !== undefined ? { platform } : {}),
          page,
        },
  );
  const trendingQuery = useTrending();

  const trips = showTrending ? (trendingQuery.data?.trips ?? []) : (exploreQuery.data?.trips ?? []);

  const loading = showTrending ? trendingQuery.isLoading : exploreQuery.isLoading;

  function togglePlatform(p: string) {
    setPlatform((prev) => (prev === p ? undefined : p));
    setPage(1);
    setShowTrending(false);
  }

  const renderItem = useCallback(
    ({ item }: { item: TripCard }) => (
      <TripCardItem trip={item} userId={userId} onPress={onTripPress} />
    ),
    [userId, onTripPress],
  );

  const keyExtractor = useCallback((item: TripCard) => item.id, []);

  return (
    <View style={styles.root}>
      {/* Search bar */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search destination…"
        value={destination}
        onChangeText={(text) => {
          setDestination(text);
          setPage(1);
          setShowTrending(false);
        }}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipContent}
      >
        <Pressable
          style={showTrending ? styles.chipActive : styles.chip}
          onPress={() => setShowTrending((t) => !t)}
        >
          <Text style={showTrending ? styles.chipActiveText : styles.chipText}>🔥 Trending</Text>
        </Pressable>

        {PLATFORMS.map((p) => (
          <Pressable
            key={p}
            style={platform === p ? styles.chipActive : styles.chip}
            onPress={() => togglePlatform(p)}
          >
            <Text style={platform === p ? styles.chipActiveText : styles.chipText}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Trip list */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#d85a30" />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No public trips found yet.</Text>
            </View>
          }
          ListFooterComponent={
            !showTrending && trips.length > 0 ? (
              <View style={styles.pagination}>
                <Pressable
                  style={page === 1 ? styles.pageBtnDisabled : styles.pageBtn}
                  onPress={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                >
                  <Text style={page === 1 ? styles.pageBtnTextDisabled : styles.pageBtnText}>
                    ← Prev
                  </Text>
                </Pressable>
                <Text style={styles.pageNum}>Page {page}</Text>
                <Pressable style={styles.pageBtn} onPress={() => setPage((p) => p + 1)}>
                  <Text style={styles.pageBtnText}>Next →</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  searchInput: {
    margin: 12,
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    fontSize: 14,
    color: "#111827",
  },
  chipRow: { maxHeight: 40, marginBottom: 8 },
  chipContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    backgroundColor: "#f3f4f6",
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  chipActive: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    backgroundColor: "#fef3ee",
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: "#d85a30",
  },
  chipText: { fontSize: 12, fontWeight: "700", color: "#374151" },
  chipActiveText: { fontSize: 12, fontWeight: "700", color: "#d85a30" },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  platformBadge: { fontSize: 18 },
  pinCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    backgroundColor: "#f3f4f6",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 99,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827", lineHeight: 21 },
  creator: { fontSize: 12, color: "#6b7280" },
  statsRow: { flexDirection: "row", gap: 12 },
  stat: { fontSize: 12, color: "#9ca3af" },
  duplicateBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d85a30",
    alignItems: "center",
  },
  duplicateBtn2: {},
  duplicatedBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#16a34a",
    backgroundColor: "#f0fdf4",
    alignItems: "center",
  },
  duplicateBtnText: { fontSize: 12, fontWeight: "700", color: "#d85a30" },
  duplicatedBtnText: { fontSize: 12, fontWeight: "700", color: "#16a34a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center" },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 16,
  },
  pageBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  pageBtnDisabled: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    opacity: 0.5,
  },
  pageBtnText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  pageBtnTextDisabled: { fontSize: 13, fontWeight: "700", color: "#9ca3af" },
  pageNum: { fontSize: 13, color: "#6b7280" },
});
