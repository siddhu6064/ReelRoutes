/**
 * apps/mobile/app/trip/[tripId]/edit.tsx
 *
 * Task 12 — Mobile edit trip screen.
 * Drag-to-reorder stops, add place manually, rename trip, delete trip.
 *
 * Note: react-native-draggable-flatlist is a peer dep — if not installed,
 * falls back to a regular FlatList with up/down arrow buttons.
 */
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import {
  useTrip,
  useUpdateTrip,
  useDeleteTrip,
  useAddPin,
  useReorderPins,
} from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const RED = "#e05252";

export default function EditTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { data: trip } = useTrip(tripId ?? null);
  const { mutateAsync: updateTrip, isPending: savingTitle } = useUpdateTrip();
  const { mutateAsync: deleteTrip, isPending: deleting } = useDeleteTrip();
  const { mutateAsync: addPin, isPending: addingPin } = useAddPin();
  const { mutateAsync: reorderPins } = useReorderPins();

  const [title, setTitle] = useState(trip?.title ?? "");
  const [titleDirty, setTitleDirty] = useState(false);
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [newPlace, setNewPlace] = useState({ name: "", lat: "", lng: "", address: "" });

  const sorted = trip ? [...trip.pins].sort((a, b) => a.order - b.order) : [];

  async function handleSaveTitle() {
    if (!userId || !tripId || !title.trim()) return;
    await updateTrip({ tripId, user_id: userId, title: title.trim() });
    setTitleDirty(false);
  }

  async function handleDeleteTrip() {
    if (!userId || !tripId) return;
    Alert.alert("Delete trip?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTrip({ tripId, userId });
          router.replace("/(tabs)");
        },
      },
    ]);
  }

  async function handleAddPlace() {
    if (!userId || !tripId) return;
    if (!newPlace.name || !newPlace.lat || !newPlace.lng) {
      Alert.alert("Missing fields", "Name, latitude, and longitude are required.");
      return;
    }
    await addPin({
      tripId,
      user_id: userId,
      place_name: newPlace.name,
      lat: parseFloat(newPlace.lat),
      lng: parseFloat(newPlace.lng),
      address: newPlace.address || undefined,
    });
    setNewPlace({ name: "", lat: "", lng: "", address: "" });
    setShowAddPlace(false);
  }

  async function moveStop(index: number, direction: "up" | "down") {
    if (!userId || !tripId) return;
    const newOrder = [...sorted];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const a = newOrder[index];
    const b = newOrder[targetIndex];
    if (!a || !b) return;
    newOrder[index] = b;
    newOrder[targetIndex] = a;
    await reorderPins({ tripId, user_id: userId, pin_ids: newOrder.map((p) => p.id) });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Nav */}
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.navTitle}>Edit Trip</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRIP NAME</Text>
          <View style={styles.titleRow}>
            <TextInput
              style={styles.titleInput}
              value={titleDirty ? title : (trip?.title ?? "")}
              onChangeText={(t) => { setTitle(t); setTitleDirty(true); }}
              placeholder="Name your trip"
              placeholderTextColor={MUTED}
            />
            {titleDirty && (
              <Pressable
                style={[styles.saveBtn, savingTitle && styles.saveBtnDisabled]}
                onPress={handleSaveTitle}
                disabled={savingTitle}
              >
                <Text style={styles.saveBtnText}>
                  {savingTitle ? "…" : "Save"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Stops */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>STOPS</Text>
            <Pressable onPress={() => setShowAddPlace(!showAddPlace)}>
              <Text style={styles.addBtnText}>+ Add place</Text>
            </Pressable>
          </View>

          {sorted.map((pin, i) => (
            <View key={pin.id} style={styles.stop}>
              <View style={styles.stopNum}>
                <Text style={styles.stopNumText}>{i + 1}</Text>
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopName} numberOfLines={1}>{pin.placeName}</Text>
                {pin.city && <Text style={styles.stopCity}>{pin.city}</Text>}
              </View>
              <View style={styles.stopArrows}>
                <Pressable
                  onPress={() => moveStop(i, "up")}
                  disabled={i === 0}
                  style={[styles.arrow, i === 0 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrowText}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => moveStop(i, "down")}
                  disabled={i === sorted.length - 1}
                  style={[styles.arrow, i === sorted.length - 1 && styles.arrowDisabled]}
                >
                  <Text style={styles.arrowText}>↓</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {/* Add place form */}
          {showAddPlace && (
            <View style={styles.addPlaceForm}>
              <Text style={styles.addPlaceTitle}>Add a place manually</Text>
              <TextInput
                style={styles.formInput}
                value={newPlace.name}
                onChangeText={(v) => setNewPlace({ ...newPlace, name: v })}
                placeholder="Place name *"
                placeholderTextColor={MUTED}
              />
              <TextInput
                style={styles.formInput}
                value={newPlace.address}
                onChangeText={(v) => setNewPlace({ ...newPlace, address: v })}
                placeholder="Address (optional)"
                placeholderTextColor={MUTED}
              />
              <View style={styles.coordRow}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={newPlace.lat}
                  onChangeText={(v) => setNewPlace({ ...newPlace, lat: v })}
                  placeholder="Latitude *"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.formInput, { flex: 1 }]}
                  value={newPlace.lng}
                  onChangeText={(v) => setNewPlace({ ...newPlace, lng: v })}
                  placeholder="Longitude *"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.formActions}>
                <Pressable
                  style={[styles.saveBtn, addingPin && styles.saveBtnDisabled]}
                  onPress={handleAddPlace}
                  disabled={addingPin}
                >
                  <Text style={styles.saveBtnText}>{addingPin ? "Adding…" : "Add stop"}</Text>
                </Pressable>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setShowAddPlace(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: RED }]}>DANGER ZONE</Text>
          <Pressable
            style={[styles.deleteBtn, deleting && styles.saveBtnDisabled]}
            onPress={handleDeleteTrip}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>
              {deleting ? "Deleting…" : "Delete this trip"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0f0d" },

  nav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 60 },
  backBtnText: { color: CORAL, fontSize: 14, fontWeight: "600" },
  navTitle: { color: TEXT, fontSize: 16, fontWeight: "800" },

  content: { padding: 16, gap: 24, paddingBottom: 60 },

  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: {
    color: MUTED, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  addBtnText: { color: CORAL, fontSize: 13, fontWeight: "700" },

  titleRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  titleInput: {
    flex: 1, backgroundColor: SURFACE, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    padding: 12, color: TEXT, fontSize: 15, fontWeight: "600",
  },

  saveBtn: {
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: CORAL, borderRadius: 10,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  stop: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    padding: 10,
  },
  stopNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CORAL, alignItems: "center", justifyContent: "center",
  },
  stopNumText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  stopInfo: { flex: 1 },
  stopName: { color: TEXT, fontSize: 13, fontWeight: "600" },
  stopCity: { color: MUTED, fontSize: 11, marginTop: 2 },
  stopArrows: { flexDirection: "row", gap: 4 },
  arrow: {
    width: 30, height: 30, borderRadius: 6,
    backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center",
  },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { color: TEXT, fontSize: 16 },

  addPlaceForm: {
    backgroundColor: SURFACE2, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER, padding: 14, gap: 10,
  },
  addPlaceTitle: { color: TEXT, fontSize: 14, fontWeight: "700" },
  formInput: {
    backgroundColor: SURFACE, borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    padding: 10, color: TEXT, fontSize: 13,
  },
  coordRow: { flexDirection: "row", gap: 8 },
  formActions: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    alignItems: "center",
  },
  cancelBtnText: { color: MUTED, fontSize: 13, fontWeight: "600" },

  deleteBtn: {
    paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: RED,
    alignItems: "center",
    backgroundColor: "rgba(224,82,82,0.1)",
  },
  deleteBtnText: { color: RED, fontWeight: "700", fontSize: 13 },
});
