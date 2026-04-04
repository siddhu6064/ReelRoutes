/**
 * apps/mobile/components/AddToTripSheet.tsx
 *
 * Task 13 — "Add to existing trip" bottom sheet.
 * Shown after processing completes when the user has saved trips.
 * Lets the user merge new pins into an existing trip instead of
 * creating a new one.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useAuth } from "@clerk/clerk-expo";
import { useUserTrips } from "@/api/client";
import type { Trip } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

export interface AddToTripSheetRef {
  open: (newTripId: string) => void;
  close: () => void;
}

interface Props {
  onMerge: (targetTripId: string, sourceTripId: string) => Promise<void>;
  onKeepSeparate: () => void;
}

export const AddToTripSheet = forwardRef<AddToTripSheetRef, Props>(
  ({ onMerge, onKeepSeparate }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    const { userId } = useAuth();
    const { data } = useUserTrips(userId ?? null);
    const [sourceTripId, setSourceTripId] = useState("");
    const [mergingId, setMergingId] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      open(newTripId: string) {
        setSourceTripId(newTripId);
        sheetRef.current?.snapToIndex(0);
      },
      close() {
        sheetRef.current?.close();
      },
    }));

    const existingTrips = (data?.items ?? []).filter((t) => t.id !== sourceTripId);

    async function handleMerge(targetTrip: Trip) {
      setMergingId(targetTrip.id);
      try {
        await onMerge(targetTrip.id, sourceTripId);
        sheetRef.current?.close();
      } finally {
        setMergingId(null);
      }
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={["50%", "75%"]}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={{ backgroundColor: SURFACE }}
        handleIndicatorStyle={{ backgroundColor: BORDER }}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Add to an existing trip?</Text>
          <Text style={styles.sub}>
            Merge these stops into one of your saved trips, or keep as a new trip.
          </Text>

          {existingTrips.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No other trips to merge into yet.</Text>
            </View>
          ) : (
            <FlatList
              data={existingTrips.slice(0, 10)}
              keyExtractor={(t) => t.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.tripRow}
                  onPress={() => handleMerge(item)}
                  disabled={mergingId === item.id}
                >
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripName} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.tripMeta}>
                      {item.pinCount} stops · {item.platform}
                    </Text>
                  </View>
                  {mergingId === item.id ? (
                    <ActivityIndicator size="small" color={CORAL} />
                  ) : (
                    <Text style={styles.mergeText}>Merge →</Text>
                  )}
                </Pressable>
              )}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}

          <Pressable style={styles.keepBtn} onPress={onKeepSeparate}>
            <Text style={styles.keepBtnText}>Keep as a new trip</Text>
          </Pressable>
        </View>
      </BottomSheet>
    );
  }
);

AddToTripSheet.displayName = "AddToTripSheet";

const styles = StyleSheet.create({
  content: { flex: 1, padding: 20, gap: 12 },
  title: { color: TEXT, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  sub: { color: MUTED, fontSize: 13, lineHeight: 19 },

  empty: { alignItems: "center", paddingVertical: 20 },
  emptyText: { color: MUTED, fontSize: 13 },

  list: { flex: 1 },
  tripRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: SURFACE2, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, marginBottom: 8,
  },
  tripInfo: { flex: 1 },
  tripName: { color: TEXT, fontSize: 13, fontWeight: "700" },
  tripMeta: { color: MUTED, fontSize: 11, marginTop: 2 },
  mergeText: { color: CORAL, fontSize: 13, fontWeight: "700" },

  keepBtn: {
    paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE2, alignItems: "center",
  },
  keepBtnText: { color: MUTED, fontSize: 14, fontWeight: "600" },
});
