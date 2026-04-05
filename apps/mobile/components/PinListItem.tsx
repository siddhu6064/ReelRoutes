/**
 * PinListItem — swipeable pin row (W9).
 * Swipe left → green ✓ (visit) or red ✗ (unvisit).
 */
import { useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

export interface Pin {
  id: string;
  placeName: string;
  address: string | null;
  lat: number;
  lng: number;
  visitedAt: string | null;
  diaryEntry: string | null;
  order: number;
}

interface Props {
  pin: Pin;
  onVisit: (pinId: string) => Promise<void>;
  onUnvisit: (pinId: string) => Promise<void>;
  onPress: (pin: Pin) => void;
}

export default function PinListItem({ pin, onVisit, onUnvisit, onPress }: Props) {
  const ref = useRef<Swipeable>(null);
  const isVisited = pin.visitedAt !== null;

  async function handleSwipe() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ref.current?.close();
    if (isVisited) {
      await onUnvisit(pin.id);
    } else {
      await onVisit(pin.id);
    }
  }

  function renderRight() {
    return (
      <TouchableOpacity
        style={[s.action, isVisited ? s.actionUnvisit : s.actionVisit]}
        onPress={handleSwipe}
        activeOpacity={0.85}
      >
        <Text style={s.actionIcon}>{isVisited ? "✗" : "✓"}</Text>
        <Text style={s.actionLabel}>{isVisited ? "UNVISIT" : "VISITED"}</Text>
      </TouchableOpacity>
    );
  }

  const date =
    pin.visitedAt !== null
      ? new Date(pin.visitedAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRight}
      rightThreshold={60}
      overshootRight={false}
      friction={2}
    >
      <TouchableOpacity
        style={[s.row, isVisited && s.rowVisited]}
        onPress={() => onPress(pin)}
        activeOpacity={0.72}
      >
        <Text style={s.check}>{isVisited ? "✅" : "⬜"}</Text>
        <View style={s.info}>
          <Text
            style={[s.name, isVisited && s.nameVisited]}
            numberOfLines={1}
          >
            {pin.placeName}
          </Text>
          {pin.address ? (
            <Text style={s.address} numberOfLines={1}>
              {pin.address}
            </Text>
          ) : null}
          {pin.diaryEntry ? (
            <Text style={s.diary} numberOfLines={2}>
              📝 {pin.diaryEntry}
            </Text>
          ) : null}
        </View>
        {date ? <Text style={s.date}>{date}</Text> : null}
      </TouchableOpacity>
    </Swipeable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    gap: 10,
  },
  rowVisited: { backgroundColor: "#f0fdf4" },
  check: { fontSize: 20, width: 28, textAlign: "center" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "600", color: "#111827" },
  nameVisited: { color: "#15803d" },
  address: { fontSize: 13, color: "#6b7280" },
  diary: { fontSize: 13, color: "#7c3aed", marginTop: 3, lineHeight: 18 },
  date: { fontSize: 12, color: "#6b7280", flexShrink: 0 },
  action: {
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  actionVisit: { backgroundColor: "#22c55e" },
  actionUnvisit: { backgroundColor: "#ef4444" },
  actionIcon: { fontSize: 22, color: "#fff", fontWeight: "700" },
  actionLabel: {
    fontSize: 10,
    color: "#fff",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
