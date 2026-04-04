/**
 * apps/mobile/app/trip/[tripId].tsx
 *
 * Task 2 — Trip map view with react-native-maps.
 * Dark Google Maps style, numbered coral pin markers.
 * Tap a marker → highlights the synchronized FlatList stop below.
 * Bottom sheet opens for pin detail (built in Week 14).
 */
import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrip, type Pin } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

// Dark map style matching the web app
const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9c94" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c29" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function StopCard({ pin, index, isActive, onPress }: {
  pin: Pin; index: number; isActive: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.stopCard, isActive && styles.stopCardActive]}
      onPress={onPress}
    >
      <View style={[styles.stopNum, isActive && styles.stopNumActive]}>
        <Text style={styles.stopNumText}>{index + 1}</Text>
      </View>
      <View style={styles.stopInfo}>
        <Text style={styles.stopName} numberOfLines={1}>{pin.placeName}</Text>
        {pin.city && (
          <Text style={styles.stopCity} numberOfLines={1}>
            {pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function TripMapScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: trip, isLoading } = useTrip(tripId ?? null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList>(null);

  const sorted = trip ? [...trip.pins].sort((a, b) => a.order - b.order) : [];

  const selectPin = useCallback((pin: Pin, index: number) => {
    setActiveIndex(index);
    // Pan map to pin
    mapRef.current?.animateToRegion({
      latitude: pin.lat,
      longitude: pin.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 400);
    // Scroll list to card
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }, []);

  if (isLoading || !trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading trip…</Text>
      </View>
    );
  }

  // Initial map region centered on first pin
  const firstPin = sorted[0];
  const initialRegion = firstPin
    ? { latitude: firstPin.lat, longitude: firstPin.lng, latitudeDelta: 0.5, longitudeDelta: 0.5 }
    : { latitude: 35.6762, longitude: 139.6503, latitudeDelta: 10, longitudeDelta: 10 };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.title}</Text>
          <Text style={styles.headerMeta}>{sorted.length} stops · {trip.platform}</Text>
        </View>
        <Pressable
          style={styles.editBtn}
          onPress={() => router.push(`/trip/${tripId}/edit`)}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {sorted.map((pin, i) => (
          <Marker
            key={pin.id}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            onPress={() => selectPin(pin, i)}
          >
            <View style={[styles.markerWrap, activeIndex === i && styles.markerWrapActive]}>
              <Text style={styles.markerText}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Stop list */}
      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          data={sorted}
          keyExtractor={(p) => p.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <StopCard
              pin={item}
              index={index}
              isActive={activeIndex === index}
              onPress={() => selectPin(item, index)}
            />
          )}
          onScrollToIndexFailed={() => {}}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0f0d" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0f0f0d",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 8,
  },
  backBtn: { padding: 6 },
  backBtnText: { color: TEXT, fontSize: 28, lineHeight: 32 },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 15, fontWeight: "800" },
  headerMeta: { color: MUTED, fontSize: 11, marginTop: 1 },
  editBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: CORAL, borderRadius: 8,
  },
  editBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  map: { flex: 1 },

  markerWrap: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CORAL,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 5,
  },
  markerWrapActive: { backgroundColor: "#a8401e", width: 40, height: 40, borderRadius: 20 },
  markerText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  listWrap: { backgroundColor: "#0f0f0d", paddingVertical: 12 },
  listContent: { paddingHorizontal: 16, gap: 8 },

  stopCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: SURFACE, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: BORDER, width: 200,
  },
  stopCardActive: { borderColor: CORAL, backgroundColor: "#2a1a10" },
  stopNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: CORAL, alignItems: "center", justifyContent: "center",
  },
  stopNumActive: { backgroundColor: "#a8401e" },
  stopNumText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  stopInfo: { flex: 1, minWidth: 0 },
  stopName: { color: TEXT, fontSize: 13, fontWeight: "700" },
  stopCity: { color: MUTED, fontSize: 11, marginTop: 2 },

  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f0f0d" },
  loadingText: { color: MUTED, fontSize: 15 },
});
