import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type TravelMode = "driving" | "transit" | "walking";

interface Leg {
  from: string;
  to: string;
  duration_label: string;
  distance_label: string;
}

interface DirectionsData {
  mode: TravelMode;
  total_duration_label: string;
  total_distance_label: string;
  legs: Leg[];
  stop_count: number;
}

const MODE_LABELS: Record<TravelMode, string> = {
  driving: "🚗 Drive",
  transit: "🚌 Transit",
  walking: "🚶 Walk",
};

interface Props {
  tripId: string;
  userId?: string;
  apiBase: string;
}

export function DirectionsPanel({ tripId, userId, apiBase }: Props): React.JSX.Element {
  const [mode, setMode] = useState<TravelMode>("driving");

  const { data, isLoading } = useQuery<DirectionsData>({
    queryKey: ["directions", tripId, mode],
    queryFn: async () => {
      const params = new URLSearchParams({ mode });
      if (userId) params.set("user_id", userId);
      const res = await fetch(`${apiBase}/api/trips/${tripId}/directions?${params.toString()}`);
      const json = (await res.json()) as { data: DirectionsData };
      return json.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <View style={styles.root}>
      <View style={styles.modeRow}>
        {(["driving", "transit", "walking"] as TravelMode[]).map((m) => (
          <Pressable
            key={m}
            style={mode === m ? styles.modeActive : styles.mode}
            onPress={() => setMode(m)}
          >
            <Text style={mode === m ? styles.modeActiveText : styles.modeText}>
              {MODE_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading && <ActivityIndicator color="#d85a30" style={styles.loader} />}

      {data && !isLoading && (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>🕐 {data.total_duration_label}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.summaryText}>📍 {data.total_distance_label}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.summaryText}>{data.stop_count} stops</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {data.legs.map((leg, i) => (
              <View key={i} style={styles.leg}>
                <View style={styles.legRoute}>
                  <Text style={styles.legFrom} numberOfLines={1}>
                    {leg.from}
                  </Text>
                  <Text style={styles.arrow}> → </Text>
                  <Text style={styles.legTo} numberOfLines={1}>
                    {leg.to}
                  </Text>
                </View>
                <Text style={styles.legStats}>
                  {leg.duration_label} · {leg.distance_label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  modeRow: { flexDirection: "row", gap: 8 },
  mode: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  modeActive: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d85a30",
    backgroundColor: "#fef3ee",
    alignItems: "center",
  },
  modeText: { fontSize: 11, fontWeight: "700", color: "#374151" },
  modeActiveText: { fontSize: 11, fontWeight: "700", color: "#d85a30" },
  loader: { marginVertical: 12 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 10,
  },
  summaryText: { fontSize: 12, color: "#374151", fontWeight: "600" },
  dot: { color: "#d1d5db" },
  leg: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  legRoute: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  legFrom: { flex: 1, fontSize: 13, fontWeight: "600", color: "#111827" },
  arrow: { fontSize: 11, color: "#9ca3af", paddingHorizontal: 4 },
  legTo: { flex: 1, fontSize: 13, fontWeight: "600", color: "#111827", textAlign: "right" },
  legStats: { fontSize: 11, color: "#6b7280" },
});
