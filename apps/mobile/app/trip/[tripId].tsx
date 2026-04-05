/**
 * apps/mobile/app/trip/[tripId].tsx
 *
 * Phase 1 + 2 — Trip map screen
 * W5t4:  Optimise route button + result toast
 * W6t4:  Day selector bottom sheet, per-day stop list, swipe between days
 * W7t5:  Category filter chips above the map
 * W8t2:  AsyncStorage offline caching
 * W8t3:  Offline mode banner
 * W8t4:  AI chat degrades gracefully when offline
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  NetInfo,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  Platform,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";
import { useTrip, useOptimiseRoute, type Pin, type ItineraryDay } from "@/api/client";
import { PinDetailSheet, type PinDetailSheetRef } from "@/components/PinDetailSheet";
import { ChatDrawer } from "@/components/ChatDrawer";

const CORAL   = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER  = "#2a2a28";
const MUTED   = "#6b6b62";
const TEXT    = "#f0ede8";
const AMBER   = "#f59e0b";
const GREEN   = "#4ade80";
const RED     = "#f87171";
const TEAL    = "#1D9E75";

const DAY_COLOURS = [
  "#D85A30","#378ADD","#1D9E75","#7F77DD","#EF9F27",
  "#D4537E","#2E9E4F","#E05252","#5DA0B5","#B07D3A",
];

const CATEGORY_ICONS: Record<string, string> = {
  restaurant: "🍜", landmark: "🏛", accommodation: "🏨",
  nature: "🌿", shopping: "🛍", transport: "✈️",
  entertainment: "🎭", other: "📍",
};

const OFFLINE_KEY = (id: string) => `rr-trip-offline-${id}`;

const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9c94" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c29" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function googleMapsUrl(pins: Pin[]) {
  if (!pins.length) return null;
  if (pins.length === 1) return `https://maps.google.com/?q=${pins[0].lat},${pins[0].lng}`;
  const o = `${pins[0].lat},${pins[0].lng}`;
  const d = `${pins[pins.length - 1].lat},${pins[pins.length - 1].lng}`;
  const wps = pins.slice(1, -1).map(p => `${p.lat},${p.lng}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}${wps ? `&waypoints=${wps}` : ""}`;
}

function buildSections(pins: Pin[]) {
  const map = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key = pin.cityGroup ?? (pin.city ? `${pin.city}${pin.countryCode ? ", " + pin.countryCode : ""}` : "Other");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(pin);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function showToast(msg: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert("", msg);
  }
}

// ─────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { data: liveTrip, isLoading } = useTrip(tripId ?? null);
  const { mutateAsync: optimiseRoute, isPending: optimising } = useOptimiseRoute();

  const [offlineTrip, setOfflineTrip] = useState<typeof liveTrip | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null); // null = all days
  const [showDaySheet, setShowDaySheet] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList>(null);
  const sheetRef = useRef<PinDetailSheetRef>(null);

  const trip = liveTrip ?? offlineTrip;

  // W8t2 — cache trip to AsyncStorage when we get live data
  useEffect(() => {
    if (liveTrip && tripId) {
      AsyncStorage.setItem(OFFLINE_KEY(tripId), JSON.stringify(liveTrip)).catch(() => {});
    }
  }, [liveTrip, tripId]);

  // W8t2 — load from cache when offline / on mount
  useEffect(() => {
    if (!liveTrip && tripId) {
      AsyncStorage.getItem(OFFLINE_KEY(tripId))
        .then(raw => { if (raw) setOfflineTrip(JSON.parse(raw)); })
        .catch(() => {});
    }
  }, [liveTrip, tripId]);

  // W8t3 — monitor network
  useEffect(() => {
    // expo-network or simple fetch check
    const check = async () => {
      try {
        const r = await fetch("https://www.google.com/favicon.ico", { method: "HEAD" });
        setIsOnline(r.ok);
      } catch { setIsOnline(false); }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  const sorted = useMemo(
    () => (trip ? [...trip.pins].sort((a, b) => a.order - b.order) : []),
    [trip]
  );

  const categories = useMemo(
    () => [...new Set(sorted.map(p => p.category).filter(Boolean))] as string[],
    [sorted]
  );

  const itinerary: ItineraryDay[] = trip?.itinerary ?? [];
  const pinDayColour = useMemo(() => {
    const map = new Map<string, string>();
    itinerary.forEach((day, i) => day.pinIds.forEach(id => map.set(id, DAY_COLOURS[i % DAY_COLOURS.length])));
    return map;
  }, [itinerary]);

  const displayedPins = useMemo(() => {
    let pins = sorted;
    if (categoryFilter) pins = pins.filter(p => p.category === categoryFilter);
    if (activeDay !== null && itinerary.length > 0) {
      const dayPinIds = new Set(itinerary[activeDay]?.pinIds ?? []);
      pins = pins.filter(p => dayPinIds.has(p.id));
    }
    return pins;
  }, [sorted, categoryFilter, activeDay, itinerary]);

  const sections = useMemo(() => buildSections(displayedPins), [displayedPins]);
  const hasMultipleCities = sections.length > 1;

  const routeCoords = useMemo(
    () => displayedPins.map(p => ({ latitude: p.lat, longitude: p.lng })),
    [displayedPins]
  );

  const selectPin = useCallback((pin: Pin, index: number) => {
    setActiveIndex(index);
    mapRef.current?.animateToRegion({ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    sheetRef.current?.open(pin, tripId ?? "");
  }, [tripId]);

  // W5t4 — optimise route with toast result
  async function handleOptimise() {
    if (!userId || !tripId) return;
    try {
      const result = await optimiseRoute({ tripId, user_id: userId });
      showToast(`Route optimised — saved ${result.savingPercent}% (${result.originalDistanceKm} → ${result.optimisedDistanceKm} km)`);
    } catch {
      showToast("Could not optimise route");
    }
  }

  function openGoogleMaps() {
    const url = googleMapsUrl(displayedPins);
    if (url) Linking.openURL(url);
  }

  if ((isLoading && !offlineTrip) || !trip) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: MUTED }}>Loading trip…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* W8t3 — Offline banner */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { paddingTop: insets.top }]}>
          <Text style={styles.offlineBannerText}>
            📴 Offline mode — showing cached data
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (isOnline ? 8 : 36) }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.headerMeta}>
            {sorted.length} stops · {trip.platform}
            {itinerary.length > 0 ? ` · ${itinerary.length} days` : ""}
          </Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={handleOptimise} disabled={optimising || !isOnline}>
          <Text style={styles.iconBtnText}>⚡</Text>
        </Pressable>
        <Pressable style={[styles.iconBtn, { backgroundColor: CORAL }]} onPress={openGoogleMaps}>
          <Text style={styles.iconBtnText}>🗺</Text>
        </Pressable>
        {/* W8t4 — Chat only available online */}
        <Pressable
          style={[styles.iconBtn, chatOpen && { backgroundColor: "#2a1a12" }]}
          onPress={() => isOnline ? setChatOpen(true) : showToast("Reconnect to use AI chat")}
        >
          <Text style={styles.iconBtnText}>💬</Text>
        </Pressable>
      </View>

      {/* W7t5 — Category filter chips */}
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          <Pressable
            style={[styles.chip, categoryFilter === null && styles.chipActive]}
            onPress={() => setCategoryFilter(null)}
          >
            <Text style={[styles.chipText, categoryFilter === null && styles.chipTextActive]}>All</Text>
          </Pressable>
          {categories.map(cat => (
            <Pressable
              key={cat}
              style={[styles.chip, categoryFilter === cat && styles.chipActive]}
              onPress={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
            >
              <Text style={[styles.chipText, categoryFilter === cat && styles.chipTextActive]}>
                {CATEGORY_ICONS[cat] ?? "📍"} {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* W6t4 — Day tabs */}
      {itinerary.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayRow}>
          <Pressable
            style={[styles.dayTab, activeDay === null && styles.dayTabActive]}
            onPress={() => setActiveDay(null)}
          >
            <Text style={[styles.dayTabText, activeDay === null && styles.dayTabTextActive]}>All</Text>
          </Pressable>
          {itinerary.map((day, i) => (
            <Pressable
              key={day.dayNumber}
              style={[styles.dayTab, activeDay === i && { backgroundColor: DAY_COLOURS[i % DAY_COLOURS.length] + "33", borderColor: DAY_COLOURS[i % DAY_COLOURS.length] }]}
              onPress={() => setActiveDay(i === activeDay ? null : i)}
            >
              <Text style={[styles.dayTabText, activeDay === i && { color: DAY_COLOURS[i % DAY_COLOURS.length] }]}>
                {day.label ?? `Day ${day.dayNumber}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE}
        initialRegion={{
          latitude: sorted[0]?.lat ?? 35.6762,
          longitude: sorted[0]?.lng ?? 139.6503,
          latitudeDelta: 2, longitudeDelta: 2,
        }}
      >
        {showRoute && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={CORAL} strokeWidth={3} />
        )}
        {displayedPins.map((pin, i) => {
          const dayColour = pinDayColour.get(pin.id);
          return (
            <Marker key={pin.id} coordinate={{ latitude: pin.lat, longitude: pin.lng }} title={pin.placeName} onPress={() => selectPin(pin, i)}>
              <View style={[styles.markerWrap, i === activeIndex && styles.markerWrapActive, dayColour ? { backgroundColor: dayColour } : {}]}>
                <Text style={styles.markerText}>{sorted.indexOf(pin) + 1}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <Pressable style={[styles.routeToggle, { bottom: insets.bottom + 220 }]} onPress={() => setShowRoute(v => !v)}>
        <Text style={styles.routeToggleText}>{showRoute ? "— Route" : "+ Route"}</Text>
      </Pressable>

      {/* Stop list */}
      <View style={[styles.listWrap, { paddingBottom: insets.bottom }]}>
        {hasMultipleCities ? (
          <SectionList
            sections={sections}
            keyExtractor={pin => pin.id}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📍 {section.title}</Text>
                <Text style={styles.sectionCount}>{section.data.length} stops</Text>
              </View>
            )}
            renderItem={({ item: pin }) => {
              const idx = sorted.indexOf(pin);
              const dayColour = pinDayColour.get(pin.id);
              return (
                <StopCard pin={pin} index={idx} isActive={activeIndex === idx} dayColour={dayColour} onPress={() => selectPin(pin, idx)} />
              );
            }}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={displayedPins}
            keyExtractor={pin => pin.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.flatListContent}
            renderItem={({ item: pin }) => {
              const idx = sorted.indexOf(pin);
              const dayColour = pinDayColour.get(pin.id);
              return (
                <StopCard pin={pin} index={idx} isActive={activeIndex === idx} dayColour={dayColour} onPress={() => selectPin(pin, idx)} />
              );
            }}
          />
        )}
      </View>

      <PinDetailSheet ref={sheetRef} />

      {/* W8t4 — Chat drawer (only renders when online) */}
      {chatOpen && isOnline && trip && (
        <ChatDrawer tripId={tripId ?? ""} onClose={() => setChatOpen(false)} />
      )}
    </View>
  );
}

function StopCard({ pin, index, isActive, dayColour, onPress }: {
  pin: Pin; index: number; isActive: boolean; dayColour?: string; onPress: () => void;
}) {
  return (
    <Pressable style={[styles.stopCard, isActive && styles.stopCardActive]} onPress={onPress}>
      <View style={[styles.stopNum, isActive && styles.stopNumActive, dayColour ? { backgroundColor: dayColour } : {}]}>
        <Text style={styles.stopNumText}>{index + 1}</Text>
      </View>
      <View style={styles.stopInfo}>
        <Text style={styles.stopName} numberOfLines={1}>{pin.placeName}</Text>
        <View style={styles.stopMeta}>
          {pin.city && <Text style={styles.stopCity} numberOfLines={1}>{pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}</Text>}
          {pin.openNow !== undefined && <Text style={{ fontSize: 10, fontWeight: "700", color: pin.openNow ? GREEN : RED }}>● {pin.openNow ? "Open" : "Closed"}</Text>}
          {pin.rating !== undefined && <Text style={styles.ratingLabel}>★ {pin.rating.toFixed(1)}</Text>}
          {pin.category && pin.category !== "other" && (
            <Text style={styles.categoryLabel}>{CATEGORY_ICONS[pin.category] ?? ""}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  offlineBanner: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 99,
    backgroundColor: "#2e2010", paddingHorizontal: 16, paddingBottom: 8,
  },
  offlineBannerText: { color: AMBER, fontSize: 12, fontWeight: "700", textAlign: "center" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingBottom: 10,
    backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: SURFACE2,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER,
  },
  backText: { color: TEXT, fontSize: 16, fontWeight: "700" },
  headerInfo: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  headerMeta: { color: MUTED, fontSize: 11, marginTop: 1 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: SURFACE2,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER,
  },
  iconBtnText: { fontSize: 16 },

  chipScroll: { maxHeight: 40, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER },
  chipRow: { paddingHorizontal: 10, paddingVertical: 6, gap: 6, alignItems: "center" },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
    borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE2,
  },
  chipActive: { backgroundColor: "#2a1a12", borderColor: CORAL },
  chipText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: CORAL },

  dayScroll: { maxHeight: 38, backgroundColor: SURFACE },
  dayRow: { paddingHorizontal: 10, paddingVertical: 5, gap: 6, alignItems: "center" },
  dayTab: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99,
    borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE2,
  },
  dayTabActive: { backgroundColor: "#2a1a12", borderColor: CORAL },
  dayTabText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  dayTabTextActive: { color: CORAL },

  map: { flex: 1 },
  routeToggle: {
    position: "absolute", right: 12, backgroundColor: SURFACE2,
    borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, paddingVertical: 6,
  },
  routeToggleText: { color: MUTED, fontSize: 11, fontWeight: "700" },

  markerWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: CORAL,
    borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  markerWrapActive: { backgroundColor: "#a8401e", transform: [{ scale: 1.15 }] },
  markerText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  listWrap: { maxHeight: 180, backgroundColor: SURFACE, borderTopWidth: 1, borderTopColor: BORDER },
  flatListContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: "#111110", borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sectionTitle: { color: MUTED, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { color: MUTED, fontSize: 10 },

  stopCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER, minWidth: 180,
  },
  stopCardActive: { backgroundColor: "#2a1a12" },
  stopNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: SURFACE2,
    borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stopNumActive: { backgroundColor: CORAL, borderColor: CORAL },
  stopNumText: { color: TEXT, fontSize: 11, fontWeight: "800" },
  stopInfo: { flex: 1, minWidth: 0 },
  stopName: { color: TEXT, fontSize: 13, fontWeight: "700" },
  stopMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  stopCity: { color: MUTED, fontSize: 10, flex: 1 },
  ratingLabel: { color: AMBER, fontSize: 10, fontWeight: "700" },
  categoryLabel: { fontSize: 12 },
});
