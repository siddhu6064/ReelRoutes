/**
 * WrappedSheet — Trip Wrapped stats bottom sheet (W10).
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView, Share,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";

interface CategoryCount { category: string; count: number; }
interface WrappedStats {
  tripId: string; title: string; totalPins: number; visitedPins: number;
  visitRate: number; diaryCount: number; distanceKm: number; daysActive: number;
  topCategories: CategoryCount[]; firstVisit: string | null; lastVisit: string | null;
}

function fmt(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WrappedSheet({
  tripId, userId, visible, onClose,
}: { tripId: string; userId?: string; visible: boolean; onClose: () => void }) {
  const [data, setData] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true); setError(null);
    fetch(`/api/trips/${tripId}/wrapped${userId ? `?user_id=${userId}` : ""}`)
      .then(r => r.json()).then(j => { if (j.ok) setData(j.data); else setError("Failed"); })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [visible, tripId, userId]);

  async function share() {
    if (!data) return;
    await Share.share({ message: `✈️ ${data.title} — Trip Wrapped\n✅ ${data.visitedPins}/${data.totalPins} spots\n📍 ${data.distanceKm}km\n#ReelRoutes` });
  }

  const dateRange = data?.firstVisit && data?.lastVisit
    ? `${fmt(data.firstVisit)} – ${fmt(data.lastVisit)}` : "Not started yet";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.hdr}>
            <Text style={s.title}>✈️ Trip Wrapped</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.x}>✕</Text></TouchableOpacity>
          </View>
          {loading && <View style={s.center}><ActivityIndicator color="#6366f1" size="large" /></View>}
          {error && <View style={s.center}><Text style={s.errTxt}>{error}</Text></View>}
          {data && !loading && (
            <ScrollView contentContainerStyle={s.body}>
              <Text style={s.tripTitle}>{data.title}</Text>
              <Text style={s.dates}>{dateRange}</Text>
              <View style={s.ring}>
                <Text style={s.ringPct}>{Math.round(data.visitRate * 100)}%</Text>
                <Text style={s.ringLbl}>visited</Text>
              </View>
              <Text style={s.sub}>{data.visitedPins} of {data.totalPins} spots</Text>
              <View style={s.chips}>
                {[
                  { icon: "📍", v: `${data.distanceKm}`, l: "km" },
                  { icon: "📝", v: `${data.diaryCount}`, l: "notes" },
                  { icon: "📅", v: `${data.daysActive}`, l: "days" },
                ].map(c => (
                  <View key={c.l} style={s.chip}>
                    <Text style={s.chipIcon}>{c.icon}</Text>
                    <Text style={s.chipVal}>{c.v}</Text>
                    <Text style={s.chipLbl}>{c.l}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.shareBtn} onPress={share} activeOpacity={0.85}>
                <Text style={s.shareTxt}>Share my stats 🔗</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#d1d5db", alignSelf: "center", marginTop: 10 },
  hdr: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  x: { fontSize: 18, color: "#9ca3af" },
  center: { alignItems: "center", paddingVertical: 40 },
  errTxt: { color: "#dc2626", fontSize: 14 },
  body: { padding: 20, alignItems: "center", gap: 12 },
  tripTitle: { fontSize: 20, fontWeight: "800", color: "#111827", textAlign: "center" },
  dates: { fontSize: 13, color: "#6b7280" },
  ring: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  ringPct: { fontSize: 26, fontWeight: "800", color: "#6d28d9" },
  ringLbl: { fontSize: 11, color: "#7c3aed", fontWeight: "600" },
  sub: { fontSize: 14, color: "#374151", fontWeight: "500" },
  chips: { flexDirection: "row", gap: 10 },
  chip: { backgroundColor: "#f5f3ff", borderRadius: 12, padding: 12, alignItems: "center", minWidth: 80 },
  chipIcon: { fontSize: 18 },
  chipVal: { fontSize: 20, fontWeight: "800", color: "#111827" },
  chipLbl: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  shareBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 4 },
  shareTxt: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
