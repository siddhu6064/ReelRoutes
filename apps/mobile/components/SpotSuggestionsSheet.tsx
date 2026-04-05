/**
 * SpotSuggestionsSheet — AI spot suggestions bottom sheet (W11).
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";

interface Spot {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  reason: string;
}

const ICONS: Record<string, string> = {
  restaurant: "🍽️",
  museum: "🏛️",
  park: "🌳",
  landmark: "🗿",
  market: "🛒",
  gallery: "🖼️",
  cafe: "☕",
  bar: "🍸",
  other: "📍",
};

export default function SpotSuggestionsSheet({
  tripId,
  userId,
  visible,
  onClose,
  onAddPin,
}: {
  tripId: string;
  userId?: string;
  visible: boolean;
  onClose: () => void;
  onAddPin: (s: Spot) => Promise<void>;
}) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const [addingName, setAddingName] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/trips/${tripId}/suggest-spots${userId ? `?user_id=${userId}` : ""}`,
        { method: "POST" },
      );
      const j = await r.json();
      if (j.ok) {
        setSpots(j.data.suggestions);
        setAddedNames(new Set());
      } else setError("Request failed");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(spot: Spot) {
    if (addedNames.has(spot.name)) return;
    setAddingName(spot.name);
    Vibration.vibrate(30);
    try {
      await onAddPin(spot);
      setAddedNames((p) => new Set(p).add(spot.name));
    } finally {
      setAddingName(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.hdr}>
            <View>
              <Text style={s.title}>✨ AI Spot Suggestions</Text>
              <Text style={s.sub}>GPT-4o picks nearby gems</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.x}>✕</Text>
            </TouchableOpacity>
          </View>
          {!spots.length && !loading && !error && (
            <View style={s.ctaWrap}>
              <TouchableOpacity style={s.cta} onPress={load} activeOpacity={0.86}>
                <Text style={s.ctaTxt}>✨ Suggest spots I might have missed</Text>
              </TouchableOpacity>
            </View>
          )}
          {loading && (
            <View style={s.center}>
              <ActivityIndicator color="#6366f1" size="large" />
              <Text style={s.loadTxt}>Scouting nearby gems…</Text>
            </View>
          )}
          {error && (
            <View style={s.center}>
              <Text style={s.errTxt}>{error}</Text>
              <TouchableOpacity style={s.retry} onPress={load}>
                <Text style={s.retryTxt}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          {spots.length > 0 && !loading && (
            <ScrollView contentContainerStyle={s.list}>
              <TouchableOpacity style={s.refresh} onPress={load}>
                <Text style={s.refreshTxt}>🔄 New suggestions</Text>
              </TouchableOpacity>
              {spots.map((spot) => {
                const added = addedNames.has(spot.name);
                return (
                  <View key={spot.name} style={[s.card, added && s.cardAdded]}>
                    <Text style={s.cardIcon}>{ICONS[spot.category] ?? "📍"}</Text>
                    <View style={s.cardBody}>
                      <Text style={s.cardName} numberOfLines={1}>
                        {spot.name}
                      </Text>
                      <Text style={s.cardAddr} numberOfLines={1}>
                        {spot.address}
                      </Text>
                      <Text style={s.cardReason} numberOfLines={2}>
                        💡 {spot.reason}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.addBtn, added && s.addBtnAdded]}
                      onPress={() => handleAdd(spot)}
                      disabled={added || addingName === spot.name}
                    >
                      <Text style={[s.addTxt, added && s.addTxtAdded]}>
                        {added ? "✓" : addingName === spot.name ? "…" : "+"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingBottom: 32,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
  },
  hdr: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  sub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  x: { fontSize: 18, color: "#9ca3af" },
  ctaWrap: { paddingHorizontal: 20, paddingVertical: 12 },
  cta: { backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  ctaTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
  center: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadTxt: { fontSize: 14, color: "#6b7280" },
  errTxt: { color: "#dc2626", fontSize: 14 },
  retry: { backgroundColor: "#f3f4f6", borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 },
  retryTxt: { color: "#374151", fontWeight: "600", fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  refresh: { alignItems: "flex-end", paddingVertical: 6 },
  refreshTxt: { fontSize: 13, color: "#6366f1", fontWeight: "600" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardAdded: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  cardIcon: { fontSize: 24, marginTop: 1 },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  cardAddr: { fontSize: 12, color: "#6b7280" },
  cardReason: { fontSize: 12, color: "#4f46e5", marginTop: 4, lineHeight: 17 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  addBtnAdded: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  addTxt: { fontSize: 20, fontWeight: "700", color: "#6366f1", lineHeight: 24 },
  addTxtAdded: { color: "#fff" },
});
