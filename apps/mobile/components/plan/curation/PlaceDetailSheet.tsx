import React, { useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ActivityStop } from "@/types/scratchPlan";
import { Colors, Spacing, Radius, FontSize, FontWeight } from "@/components/plan/tokens";

interface Props {
  stop: ActivityStop | null;
  onClose: () => void;
  onRemove: () => void;
}

/**
 * PlaceDetailSheet
 * ----------------
 * Full-detail bottom sheet for a tapped activity stop.
 * Uses @gorhom/bottom-sheet — must be wrapped in a GestureHandlerRootView
 * in the parent navigator/screen.
 */
export default function PlaceDetailSheet({ stop, onClose, onRemove }: Props) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["55%", "85%"], []);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  // Open/close based on stop presence
  React.useEffect(() => {
    if (stop) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [stop]);

  if (!stop) return null;

  const priceLabel =
    stop.price_level != null ? (["Free", "$", "$$", "$$$", "$$$$"][stop.price_level] ?? "") : null;

  const openWebsite = () => {
    if (stop.website) Linking.openURL(stop.website);
  };

  const openMaps = () => {
    const q = encodeURIComponent(stop.name + ", " + (stop.address ?? ""));
    Linking.openURL(`https://maps.google.com/?q=${q}`);
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleSheetChange}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {/* Photo */}
        {stop.photo_url ? (
          <Image source={{ uri: stop.photo_url }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={{ fontSize: 40 }}>📍</Text>
          </View>
        )}

        <View style={styles.body}>
          {/* Header */}
          <View style={styles.titleRow}>
            <Text style={styles.name}>{stop.name}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeX}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Address */}
          {stop.address ? <Text style={styles.address}>📍 {stop.address}</Text> : null}

          {/* Famous for */}
          {stop.famous_for ? (
            <View style={styles.famousBadge}>
              <Text style={styles.famousText}>⭐ {stop.famous_for}</Text>
            </View>
          ) : null}

          {/* Meta chips */}
          <View style={styles.metaRow}>
            {stop.rating != null && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>★ {stop.rating.toFixed(1)}</Text>
              </View>
            )}
            {priceLabel && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{priceLabel}</Text>
              </View>
            )}
            {stop.best_time && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>🕐 {stop.best_time}</Text>
              </View>
            )}
          </View>

          {/* Local tip */}
          {stop.local_tip ? (
            <View style={styles.tipBox}>
              <Text style={styles.tipLabel}>💡 Local tip</Text>
              <Text style={styles.tipText}>{stop.local_tip}</Text>
            </View>
          ) : null}

          {/* Opening hours */}
          {stop.opening_hours ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Opening hours</Text>
              <Text style={styles.sectionText}>{stop.opening_hours.replace(/ \| /g, "\n")}</Text>
            </View>
          ) : null}

          {/* Phone */}
          {stop.phone ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${stop.phone}`)}>
              <Text style={styles.phoneLink}>📞 {stop.phone}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={openMaps} activeOpacity={0.8}>
              <Text style={styles.actionText}>🗺 Open in Maps</Text>
            </TouchableOpacity>
            {stop.website && (
              <TouchableOpacity style={styles.actionBtn} onPress={openWebsite} activeOpacity={0.8}>
                <Text style={styles.actionText}>🌐 Website</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Remove button */}
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => {
              onRemove();
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.removeText}>Remove this stop</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  handle: { backgroundColor: Colors.gray200, width: 36 },
  sheetBg: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  content: { paddingBottom: 40 },
  photo: { width: "100%", height: 200 },
  photoPlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: Spacing.xl, gap: Spacing.md },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.black,
    flex: 1,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  closeX: { fontSize: 18, color: Colors.gray500, lineHeight: 20 },
  address: { fontSize: FontSize.sm, color: Colors.gray500 },
  famousBadge: {
    backgroundColor: Colors.famousBg,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignSelf: "flex-start",
  },
  famousText: {
    fontSize: FontSize.sm,
    color: Colors.famousText,
    fontWeight: FontWeight.medium,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  chip: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  chipText: { fontSize: FontSize.sm, color: Colors.gray700, fontWeight: FontWeight.medium },
  tipBox: {
    backgroundColor: Colors.blueSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  tipLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.blue },
  tipText: { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 20 },
  section: { gap: 4 },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionText: { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 20 },
  phoneLink: { fontSize: FontSize.sm, color: Colors.blue, fontWeight: FontWeight.medium },
  actions: { flexDirection: "row", gap: Spacing.md },
  actionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: "center",
  },
  actionText: { fontSize: FontSize.sm, color: Colors.gray700, fontWeight: FontWeight.medium },
  removeBtn: {
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  removeText: {
    fontSize: FontSize.md,
    color: Colors.red,
    fontWeight: FontWeight.semibold,
  },
});
