/**
 * apps/mobile/app/trip/[tripId].tsx
 *
 * Phase 1 — Trip map view
 * Week 3: Polyline route line on react-native-maps
 * Week 4: City section headers in stop list, "Export to Google Maps" button
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrip, type Pin } from "@/api/client";
import { PinDetailSheet, type PinDetailSheetRef } from "@/components/PinDetailSheet";

const CORAL   = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER  = "#2a2a28";
const MUTED   = "#6b6b62";
const TEXT    = "#f0ede8";
const AMBER   = "#f59e0b";
const GREEN   = "#4ade80";
const RED     = "#f87171";

const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9c94" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c29" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/** Build Google Maps multi-stop URL for export */
function googleMapsUrl(pins: Pin[]) {
  if (!pins.length) return null;
  if (pins.length === 1) {
    return `https://maps.google.com/?q=${pins[0].lat},${pins[0].lng}`;
  }
  const origin = `${pins[0].lat},${pins[0].lng}`;
  const dest   = `${pins[pins.length - 1].lat},${pins[pins.length - 1].lng}`;
  const wps    = pins.slice(1, -1).map(p => `${p.lat},${p.lng}`).join("|");
  const base   = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
  return wps ? `${base}&waypoints=${wps}` : base;
}

/** Group sorted pins into SectionList sections by city_group */
function buildSections(pins: Pin[]): Array<{ title: string; data: Pin[] }> {
  const map = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key = pin.cityGroup ??
      (pin.city ? `${pin.city}${pin.countryCode ? ", " + pin.countryCode : ""}` : "Other");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(pin);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

// ── Sub-components ────────────────────────────────────────────

function StopCard({
  pin, index, isActive, onPress,
}: { pin: Pin; index: number; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.stopCard, isActive && styles.stopCardActive]} onPress={onPress}>
      <View style={[styles.stopNum, isActive && styles.stopNumActive]}>
        <Text style={styles.stopNumText}>{index + 1}</Text>
      </View>
      <View style={styles.stopInfo}>
        <Text style={styles.stopName} numberOfLines={1}>{pin.placeName}</Text>
        <View style={styles.stopMeta}>
          {pin.city && (
            <Text style={styles.stopCity} numberOfLines={1}>
              {pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}
            </Text>
          )}
          {pin.openNow !== undefined && (
            <Text style={[styles.openLabel, { color: pin.openNow ? GREEN : RED }]}>
              ● {pin.openNow ? "Open" : "Closed"}
            </Text>
          )}
          {pin.rating !== undefined && (
            <Text style={styles.ratingLabel}>★ {pin.rating.toFixed(1)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>📍 {title}</Text>
      <Text style={styles.sectionCount}>{count} stops</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────

export default function TripMapScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: trip, isLoading } = useTrip(tripId ?? null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList>(null);
  const sheetRef = useRef<PinDetailSheetRef>(null);

  const sorted = useMemo(
    () => (trip ? [...trip.pins].sort((a, b) => a.order - b.order) : []),
    [trip]
  );

  const sections = useMemo(() => buildSections(sorted), [sorted]);
  const hasMultipleCities = sections.length > 1;

  // Polyline coordinates for the route line
  const routeCoords = useMemo(
    () => sorted.map(p => ({ latitude: p.lat, longitude: p.lng })),
    [sorted]
  );

  const selectPin = useCallback((pin: Pin, index: number) => {
    setActiveIndex(index);
    mapRef.current?.animateToRegion({
      latitude: pin.lat,
      longitude: pin.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 400);
    if (!hasMultipleCities) {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }
    sheetRef.current?.open(pin, tripId ?? "");
  }, [tripId, hasMultipleCities]);

  function openGoogleMaps() {
    const url = googleMapsUrl(sorted);
    if (url) Linking.openURL(url);
  }

  if (isLoading || !trip) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: MUTED }}>Loading trip…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.headerMeta}>
            {sorted.length} stops · {trip.platform}
            {sections.length > 1 ? ` · ${sections.length} cities` : ""}
          </Text>
        </View>
        {/* W4t6 — Export to Google Maps */}
        <Pressable style={styles.exportBtn} onPress={openGoogleMaps}>
          <Text style={styles.exportBtnText}>🗺</Text>
        </Pressable>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE}
        initialRegion={{
          latitude: sorted[0]?.lat ?? 35.6762,
          longitude: sorted[0]?.lng ?? 139.6503,
          latitudeDelta: 2,
          longitudeDelta: 2,
        }}
      >
        {/* W3t3 — Polyline route line */}
        {showRoute && routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={CORAL}
            strokeWidth={3}
            lineDashPattern={undefined}
          />
        )}

        {sorted.map((pin, i) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.placeName}
            onPress={() => selectPin(pin, i)}
          >
            <View style={[styles.markerWrap, i === activeIndex && styles.markerWrapActive]}>
              <Text style={styles.markerText}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Route toggle */}
      <Pressable
        style={[styles.routeToggle, { bottom: insets.bottom + 220 }]}
        onPress={() => setShowRoute(v => !v)}
      >
        <Text style={styles.routeToggleText}>{showRoute ? "— Route" : "＋ Route"}</Text>
      </Pressable>

      {/* Stop list — with city sections if multiple cities (W4t2) */}
      <View style={[styles.listWrap, { paddingBottom: insets.bottom }]}>
        {hasMultipleCities ? (
          <SectionList
            sections={sections}
            keyExtractor={(pin) => pin.id}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <SectionHeader title={section.title} count={section.data.length} />
            )}
            renderItem={({ item: pin }) => {
              const idx = sorted.indexOf(pin);
              return (
                <StopCard
                  pin={pin}
                  index={idx}
                  isActive={activeIndex === idx}
                  onPress={() => selectPin(pin, idx)}
                />
              );
            }}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={sorted}
            keyExtractor={(pin) => pin.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.flatListContent}
            renderItem={({ item: pin, index: i }) => (
              <StopCard
                pin={pin}
                index={i}
                isActive={activeIndex === i}
                onPress={() => selectPin(pin, i)}
              />
            )}
          />
        )}
      </View>

      {/* Pin detail sheet */}
      <PinDetailSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: BORDER,
  },
  backText: { color: TEXT, fontSize: 16, fontWeight: "700" },
  headerInfo: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  headerMeta: { color: MUTED, fontSize: 11, marginTop: 1 },
  exportBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CORAL, alignItems: "center", justifyContent: "center",
  },
  exportBtnText: { fontSize: 17 },

  map: { flex: 1 },

  routeToggle: {
    position: "absolute",
    right: 12,
    backgroundColor: SURFACE2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  routeToggleText: { color: MUTED, fontSize: 11, fontWeight: "700" },

  markerWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: CORAL, borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  markerWrapActive: { backgroundColor: "#a8401e", transform: [{ scale: 1.15 }] },
  markerText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  listWrap: { maxHeight: 200, backgroundColor: SURFACE, borderTopWidth: 1, borderTopColor: BORDER },
  flatListContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#111110",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionTitle: { color: MUTED, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { color: MUTED, fontSize: 10 },

  stopCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    minWidth: 180,
  },
  stopCardActive: { backgroundColor: "#2a1a12" },
  stopNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: SURFACE2, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stopNumActive: { backgroundColor: CORAL, borderColor: CORAL },
  stopNumText: { color: TEXT, fontSize: 11, fontWeight: "800" },
  stopInfo: { flex: 1, minWidth: 0 },
  stopName: { color: TEXT, fontSize: 13, fontWeight: "700" },
  stopMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  stopCity: { color: MUTED, fontSize: 10, flex: 1 },
  openLabel: { fontSize: 10, fontWeight: "700" },
  ratingLabel: { color: AMBER, fontSize: 10, fontWeight: "700" },
});
