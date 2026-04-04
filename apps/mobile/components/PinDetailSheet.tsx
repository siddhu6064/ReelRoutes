/**
 * apps/mobile/components/PinDetailSheet.tsx
 *
 * Task 10 — Pin detail bottom sheet.
 * Shows place name, address, context quote, confidence badge,
 * editable notes, and Google Maps deep link.
 * Uses @gorhom/bottom-sheet for iOS-style snap points.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { useAuth } from "@clerk/clerk-expo";
import { useUpdatePin, type Pin } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const GREEN = "#4ade80";
const YELLOW = "#facc15";

const SNAP_POINTS = ["45%", "80%"];

export interface PinDetailSheetRef {
  open: (pin: Pin, tripId: string) => void;
  close: () => void;
}

export const PinDetailSheet = forwardRef<PinDetailSheetRef>((_props, ref) => {
  const sheetRef = useRef<BottomSheet>(null);
  const { userId } = useAuth();
  const [pin, setPin] = useState<Pin | null>(null);
  const [tripId, setTripId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { mutateAsync: updatePin } = useUpdatePin();

  useImperativeHandle(ref, () => ({
    open(p: Pin, tid: string) {
      setPin(p);
      setTripId(tid);
      setNotes(p.notes ?? "");
      sheetRef.current?.snapToIndex(0);
    },
    close() {
      sheetRef.current?.close();
    },
  }));

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  async function handleSave() {
    if (!pin || !userId) return;
    setSaving(true);
    try {
      await updatePin({ tripId, pinId: pin.id, user_id: userId, notes });
    } finally {
      setSaving(false);
    }
  }

  function openMaps() {
    if (!pin) return;
    const url = pin.placeId
      ? `https://www.google.com/maps/place/?q=place_id:${pin.placeId}`
      : `https://maps.apple.com/?q=${encodeURIComponent(pin.placeName)}&ll=${pin.lat},${pin.lng}`;
    Linking.openURL(url);
  }

  const conf = pin?.confidence ?? 0;
  const confColor = conf >= 0.8 ? GREEN : conf >= 0.5 ? YELLOW : CORAL;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {pin && (
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.stopBadge}>
                <Text style={styles.stopNum}>{pin.order + 1}</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.placeName}>{pin.placeName}</Text>
                {pin.address && (
                  <Text style={styles.address} numberOfLines={1}>
                    {pin.address}
                  </Text>
                )}
              </View>
            </View>

            {/* Confidence chip */}
            <View style={styles.chips}>
              <View style={[styles.chip, { borderColor: confColor }]}>
                <Text style={[styles.chipText, { color: confColor }]}>
                  AI {Math.round(conf * 100)}% confident
                </Text>
              </View>
              {pin.timestampHint !== undefined && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    ⏱ {Math.floor(pin.timestampHint / 60)}:
                    {String(Math.round(pin.timestampHint % 60)).padStart(2, "0")}
                  </Text>
                </View>
              )}
            </View>

            {/* Context quote */}
            {pin.contextQuote && (
              <View style={styles.quoteWrap}>
                <Text style={styles.quoteGlyph}>"</Text>
                <Text style={styles.quoteText}>{pin.contextQuote}</Text>
              </View>
            )}

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTES</Text>
              <TextInput
                style={styles.textarea}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add personal notes, tips, or reminders…"
                placeholderTextColor={MUTED}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable style={styles.mapsBtn} onPress={openMaps}>
                <Text style={styles.mapsBtnText}>Open in Maps ↗</Text>
              </Pressable>
              {userId && (
                <Pressable
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? "Saving…" : "Save notes"}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

PinDetailSheet.displayName = "PinDetailSheet";

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: SURFACE },
  handle: { backgroundColor: BORDER },
  content: { padding: 20, gap: 16, paddingBottom: 40 },

  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stopBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CORAL,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  stopNum: { color: "#fff", fontSize: 14, fontWeight: "800" },
  headerText: { flex: 1 },
  placeName: { color: TEXT, fontSize: 18, fontWeight: "800", letterSpacing: -0.4 },
  address: { color: MUTED, fontSize: 12, marginTop: 3 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  chipText: { color: MUTED, fontSize: 11, fontWeight: "700" },

  quoteWrap: {
    backgroundColor: SURFACE2,
    borderLeftWidth: 3, borderLeftColor: CORAL,
    borderRadius: 8, padding: 12, flexDirection: "row", gap: 4,
  },
  quoteGlyph: { color: CORAL, fontSize: 20, fontWeight: "900", lineHeight: 22 },
  quoteText: { color: MUTED, fontSize: 13, lineHeight: 19, flex: 1, fontStyle: "italic" },

  section: { gap: 6 },
  sectionLabel: {
    color: MUTED, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  textarea: {
    backgroundColor: SURFACE2, borderRadius: 10,
    borderWidth: 1, borderColor: BORDER,
    padding: 12, color: TEXT, fontSize: 13, lineHeight: 20,
    minHeight: 80,
  },

  actions: { flexDirection: "row", gap: 10 },
  mapsBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: SURFACE2, borderWidth: 1, borderColor: BORDER,
    alignItems: "center",
  },
  mapsBtnText: { color: CORAL, fontSize: 13, fontWeight: "700" },
  saveBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: CORAL, alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
