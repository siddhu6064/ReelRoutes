/**
 * apps/mobile/app/trip/[tripId].tsx — Phase 1 + 2
 * W5t4: Optimise route toast · W6t4: Day tabs · W7t5: Category chips
 * W8t2: AsyncStorage offline cache · W8t3: Offline banner · W8t4: Chat degradation
 */
import { useAuth } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useTrip,
  useOptimiseRoute,
  useVisitPin,
  useUnvisitPin,
  type Pin,
  type Trip,
  type ItineraryDay,
} from "@/api/client";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import BudgetSheet from "@/components/BudgetSheet";
import ChatDrawer from "@/components/ChatDrawer";
import { CollaboratorSheet } from "@/components/CollaboratorSheet";
import DiarySheet from "@/components/DiarySheet";
import { DirectionsPanel } from "@/components/DirectionsPanel";
import { FlyoverSheet } from "@/components/FlyoverSheet";
import { useGpsTracker } from "@/components/GpsTracker";
import { PinDetailSheet, type PinDetailSheetRef } from "@/components/PinDetailSheet";
import { ReservationSheet } from "@/components/ReservationSheet";
import SpotSuggestionsSheet from "@/components/SpotSuggestionsSheet";
import { TravelBookSheet } from "@/components/TravelBookSheet";
import { UndoSheet } from "@/components/UndoSheet";
import WrappedSheet from "@/components/WrappedSheet";
import { API_BASE } from "@/constants/api";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const AMBER = "#f59e0b";
const GREEN = "#4ade80";
const RED = "#f87171";

const DAY_COLOURS = [
  "#D85A30",
  "#378ADD",
  "#1D9E75",
  "#7F77DD",
  "#EF9F27",
  "#D4537E",
  "#2E9E4F",
  "#E05252",
  "#5DA0B5",
  "#B07D3A",
];

const CATEGORY_ICONS: Record<string, string> = {
  restaurant: "🍜",
  landmark: "🏛",
  accommodation: "🏨",
  nature: "🌿",
  shopping: "🛍",
  transport: "✈️",
  entertainment: "🎭",
  other: "📍",
};

const MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9c94" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c29" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function offlineKey(id: string) {
  return `rr-trip-offline-${id}`;
}

function googleMapsUrl(pins: Pin[]): string | null {
  const first = pins[0];
  const last = pins[pins.length - 1];
  if (!first) return null;
  if (pins.length === 1) return `https://maps.google.com/?q=${first.lat},${first.lng}`;
  if (!last) return null;
  const o = `${first.lat},${first.lng}`;
  const d = `${last.lat},${last.lng}`;
  const wps = pins
    .slice(1, -1)
    .map((p) => `${p.lat},${p.lng}`)
    .join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}${wps ? `&waypoints=${wps}` : ""}`;
}

function buildSections(pins: Pin[]): Array<{ title: string; data: Pin[] }> {
  const map = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key =
      pin.cityGroup ??
      (pin.city ? `${pin.city}${pin.countryCode ? ", " + pin.countryCode : ""}` : "Other");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(pin);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

function showToast(msg: string) {
  if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert("", msg);
}

export default function TripMapScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { data: liveTrip, isLoading } = useTrip(tripId ?? null);
  const { mutateAsync: optimiseRoute, isPending: optimising } = useOptimiseRoute();
  const { mutate: visitPin } = useVisitPin();
  const { mutate: unvisitPin } = useUnvisitPin();

  // GPS tracker — toggles on when user taps the GPS button
  const { start: startGps, stop: stopGps } = useGpsTracker({
    tripId: tripId ?? "",
    userId: userId ?? "",
    onAutoVisit: () => {
      // Trigger refresh so auto-visited pins update on map immediately
      void (trip as { refetch?: () => void })?.refetch?.();
    },
  });

  const [offlineTrip, setOfflineTrip] = useState<Trip | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [spotsOpen, setSpotsOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [resvOpen, setResvOpen] = useState(false);
  const [flyoverOpen, setFlyoverOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [diaryPin, setDiaryPin] = useState<Pin | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);

  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<Pin>>(null);
  const sheetRef = useRef<PinDetailSheetRef>(null);

  const trip = liveTrip ?? offlineTrip;

  // W8t2 — cache trip to AsyncStorage on every live load
  useEffect(() => {
    if (liveTrip && tripId) {
      if (tripId)
        AsyncStorage.setItem(offlineKey(tripId), JSON.stringify(liveTrip)).catch(() => {});
    }
  }, [liveTrip, tripId]);

  // W8t2 — load from cache if no live data
  useEffect(() => {
    if (!liveTrip && tripId) {
      AsyncStorage.getItem(offlineKey(tripId ?? ""))
        .then((raw: string | null) => {
          if (raw) setOfflineTrip(JSON.parse(raw) as Trip);
        })
        .catch(() => {});
    }
  }, [liveTrip, tripId]);

  // W8t3 — poll network connectivity every 30s
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("https://www.google.com/favicon.ico", { method: "HEAD" });
        setIsOnline(r.ok);
      } catch {
        setIsOnline(false);
      }
    };
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, []);

  const sorted = useMemo(
    () => (trip ? [...trip.pins].sort((a, b) => a.order - b.order) : []),
    [trip],
  );

  const categories = useMemo(
    () => [...new Set(sorted.map((p) => p.category).filter((c): c is string => Boolean(c)))],
    [sorted],
  );

  const itinerary: ItineraryDay[] = trip?.itinerary ?? [];
  const pinDayColour = useMemo(() => {
    const map = new Map<string, string>();
    itinerary.forEach((day, i) =>
      day.pinIds.forEach((id) => {
        const col = DAY_COLOURS[i % DAY_COLOURS.length];
        if (col) map.set(id, col);
      }),
    );
    return map;
  }, [itinerary]);

  const displayedPins = useMemo(() => {
    let pins = sorted;
    if (categoryFilter) pins = pins.filter((p) => p.category === categoryFilter);
    if (activeDay !== null && itinerary.length > 0) {
      const ids = new Set(itinerary[activeDay]?.pinIds ?? []);
      pins = pins.filter((p) => ids.has(p.id));
    }
    return pins;
  }, [sorted, categoryFilter, activeDay, itinerary]);

  const sections = useMemo(() => buildSections(displayedPins), [displayedPins]);
  const routeCoords = useMemo(
    () => displayedPins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [displayedPins],
  );

  const selectPin = useCallback(
    (pin: Pin, index: number) => {
      setActiveIndex(index);
      mapRef.current?.animateToRegion(
        { latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
      sheetRef.current?.open(pin, tripId ?? "");
    },
    [tripId],
  );

  async function handleOptimise() {
    if (!userId || !tripId) return;
    try {
      const r = await optimiseRoute({ tripId, user_id: userId });
      showToast(
        `Saved ${r.savingPercent}% — ${r.originalDistanceKm} → ${r.optimisedDistanceKm} km`,
      );
    } catch {
      showToast("Could not optimise route");
    }
  }

  function openGoogleMaps() {
    const url = googleMapsUrl(displayedPins);
    if (url) Linking.openURL(url).catch(() => {});
  }

  if ((isLoading && !offlineTrip) || !trip) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: MUTED }}>Loading trip…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* W8t3 — Offline banner */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { paddingTop: insets.top }]}>
          <Text style={styles.offlineText}>📴 Offline mode — showing cached data</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (isOnline ? 8 : 36) }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.iconBtnText}>←</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {trip.title}
          </Text>
          <Text style={styles.headerMeta}>
            {sorted.length} stops · {trip.platform}
            {itinerary.length > 0 ? ` · ${itinerary.length} days` : ""}
          </Text>
        </View>
        <Pressable
          style={[styles.iconBtn, (optimising || !isOnline) && styles.iconBtnDisabled]}
          onPress={handleOptimise}
          disabled={optimising || !isOnline}
        >
          <Text style={styles.iconBtnText}>⚡</Text>
        </Pressable>
        <Pressable style={[styles.iconBtn, { backgroundColor: CORAL }]} onPress={openGoogleMaps}>
          <Text style={styles.iconBtnText}>🗺</Text>
        </Pressable>
        {/* W8t4 — Chat unavailable offline */}
        <Pressable
          style={[styles.iconBtn, chatOpen && styles.iconBtnActive]}
          onPress={() => (isOnline ? setChatOpen(true) : showToast("Reconnect to use AI chat"))}
        >
          <Text style={styles.iconBtnText}>💬</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, gpsActive && styles.iconBtnActive]}
          onPress={() => {
            if (gpsActive) {
              stopGps();
              setGpsActive(false);
            } else {
              void startGps();
              setGpsActive(true);
            }
          }}
        >
          <Text style={styles.iconBtnText}>📍</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setDirectionsOpen((v) => !v)}>
          <Text style={styles.iconBtnText}>🧭</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setSpotsOpen(true)}>
          <Text style={styles.iconBtnText}>✨</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setBudgetOpen(true)}>
          <Text style={styles.iconBtnText}>💰</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setWrappedOpen(true)}>
          <Text style={styles.iconBtnText}>🎬</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setCollabOpen(true)}>
          <Text style={styles.iconBtnText}>👥</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setResvOpen(true)}>
          <Text style={styles.iconBtnText}>📧</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setFlyoverOpen(true)}>
          <Text style={styles.iconBtnText}>🎬</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setBookOpen(true)}>
          <Text style={styles.iconBtnText}>📖</Text>
        </Pressable>
        {userId && (
          <Pressable style={styles.iconBtn} onPress={() => setUndoOpen(true)}>
            <Text style={styles.iconBtnText}>↩</Text>
          </Pressable>
        )}
      </View>

      {/* W7t5 — Category chips */}
      {categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          <Pressable
            style={[styles.chip, categoryFilter === null && styles.chipActive]}
            onPress={() => setCategoryFilter(null)}
          >
            <Text style={[styles.chipText, categoryFilter === null && styles.chipTextActive]}>
              All
            </Text>
          </Pressable>
          {categories.map((cat) => (
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayScroll}
          contentContainerStyle={styles.dayRow}
        >
          <Pressable
            style={[styles.dayTab, activeDay === null && styles.dayTabActive]}
            onPress={() => setActiveDay(null)}
          >
            <Text style={[styles.dayTabText, activeDay === null && styles.dayTabTextActive]}>
              All
            </Text>
          </Pressable>
          {itinerary.map((day, i) => {
            const col = DAY_COLOURS[i % DAY_COLOURS.length];
            return (
              <Pressable
                key={day.dayNumber}
                style={[
                  styles.dayTab,
                  activeDay === i && { backgroundColor: col + "33", borderColor: col },
                ]}
                onPress={() => setActiveDay(i === activeDay ? null : i)}
              >
                <Text style={[styles.dayTabText, activeDay === i && { color: col }]}>
                  {day.label ?? `Day ${day.dayNumber}`}
                </Text>
              </Pressable>
            );
          })}
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
          latitudeDelta: 2,
          longitudeDelta: 2,
        }}
      >
        {showRoute && routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={CORAL} strokeWidth={3} />
        )}
        {displayedPins.map((pin, i) => {
          const dayColour = pinDayColour.get(pin.id);
          return (
            <Marker
              key={pin.id}
              coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              title={pin.placeName}
              onPress={() => selectPin(pin, i)}
            >
              <View style={styles.markerContainer}>
                <View
                  style={[
                    styles.markerWrap,
                    i === activeIndex && styles.markerWrapActive,
                    dayColour ? { backgroundColor: dayColour } : undefined,
                  ]}
                >
                  <Text style={styles.markerText}>{sorted.indexOf(pin) + 1}</Text>
                </View>
                {pin.openNow !== undefined && pin.openNow !== null && (
                  <View
                    style={[
                      styles.openDot,
                      { backgroundColor: pin.openNow ? "#22c55e" : "#ef4444" },
                    ]}
                  />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <Pressable
        style={[styles.routeToggle, { bottom: insets.bottom + 220 }]}
        onPress={() => setShowRoute((v) => !v)}
      >
        <Text style={styles.routeToggleText}>{showRoute ? "— Route" : "+ Route"}</Text>
      </Pressable>

      {/* Stop list */}
      <View style={[styles.listWrap, { paddingBottom: insets.bottom }]}>
        {sections.length > 1 ? (
          <SectionList
            sections={sections}
            keyExtractor={(pin) => pin.id}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📍 {section.title}</Text>
                <Text style={styles.sectionCount}>{section.data.length}</Text>
              </View>
            )}
            renderItem={({ item: pin }) => {
              const idx = sorted.indexOf(pin);
              return (
                <StopCard
                  pin={pin}
                  index={idx}
                  isActive={activeIndex === idx}
                  {...(pinDayColour.get(pin.id)
                    ? { dayColour: pinDayColour.get(pin.id) as string }
                    : {})}
                  onPress={() => selectPin(pin, idx)}
                  onVisitToggle={() => {
                    if (pin.visitedAt) {
                      unvisitPin({ tripId: tripId ?? "", pinId: pin.id, userId: userId ?? "" });
                    } else {
                      setDiaryPin(pin); // opens DiarySheet to add note before marking visited
                    }
                  }}
                />
              );
            }}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={displayedPins}
            keyExtractor={(pin) => pin.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.flatListContent}
            renderItem={({ item: pin }) => {
              const idx = sorted.indexOf(pin);
              return (
                <StopCard
                  pin={pin}
                  index={idx}
                  isActive={activeIndex === idx}
                  {...(pinDayColour.get(pin.id)
                    ? { dayColour: pinDayColour.get(pin.id) as string }
                    : {})}
                  onPress={() => selectPin(pin, idx)}
                  onVisitToggle={() => {
                    if (pin.visitedAt) {
                      unvisitPin({ tripId: tripId ?? "", pinId: pin.id, userId: userId ?? "" });
                    } else {
                      setDiaryPin(pin); // opens DiarySheet to add note before marking visited
                    }
                  }}
                />
              );
            }}
          />
        )}
      </View>

      {/* GPS breadcrumb trail overlay on the map */}
      {gpsActive && (
        <BreadcrumbTrail tripId={tripId ?? ""} userId={userId ?? ""} apiBase={API_BASE} />
      )}

      <PinDetailSheet ref={sheetRef} />

      {chatOpen && isOnline && (
        <ChatDrawer tripId={tripId ?? ""} onClose={() => setChatOpen(false)} />
      )}

      {/* Feature sheets — rendered as modals over the map */}
      <BudgetSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={budgetOpen}
        onClose={() => setBudgetOpen(false)}
      />
      <WrappedSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={wrappedOpen}
        onClose={() => setWrappedOpen(false)}
      />
      <SpotSuggestionsSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={spotsOpen}
        onClose={() => setSpotsOpen(false)}
        onAddPin={async (spot) => {
          await fetch(`${API_BASE}/api/trips/${tripId ?? ""}/pins?user_id=${userId ?? ""}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              place_name: spot.name,
              lat: spot.lat,
              lng: spot.lng,
              category: spot.category,
            }),
          });
        }}
      />
      <CollaboratorSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        isOwner={trip?.userId === userId}
        visible={collabOpen}
        onClose={() => setCollabOpen(false)}
      />
      <ReservationSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={resvOpen}
        onClose={() => setResvOpen(false)}
      />
      {directionsOpen && (
        <DirectionsPanel tripId={tripId ?? ""} userId={userId ?? ""} apiBase={API_BASE} />
      )}
      <FlyoverSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={flyoverOpen}
        onClose={() => setFlyoverOpen(false)}
      />
      <TravelBookSheet
        tripId={tripId ?? ""}
        userId={userId ?? ""}
        visible={bookOpen}
        onClose={() => setBookOpen(false)}
      />
      {userId && (
        <UndoSheet
          tripId={tripId ?? ""}
          userId={userId}
          visible={undoOpen}
          onClose={() => setUndoOpen(false)}
        />
      )}
      {diaryPin && (
        <DiarySheet
          visible={!!diaryPin}
          placeName={diaryPin.placeName}
          initialEntry={diaryPin.diaryEntry ?? ""}
          onConfirm={(_entry) => {
            visitPin({
              tripId: tripId ?? "",
              pinId: diaryPin.id,
              userId: userId ?? "",
            });
            // TODO: persist diary entry via PATCH /api/trips/:id/pins/:pinId
            setDiaryPin(null);
          }}
          onSkip={() => {
            visitPin({
              tripId: tripId ?? "",
              pinId: diaryPin.id,
              userId: userId ?? "",
            });
            setDiaryPin(null);
          }}
          onClose={() => setDiaryPin(null)}
        />
      )}
    </View>
  );
}

function StopCard({
  pin,
  index,
  isActive,
  dayColour,
  onPress,
  onVisitToggle,
}: {
  pin: Pin;
  index: number;
  isActive: boolean;
  dayColour?: string;
  onPress: () => void;
  onVisitToggle?: () => void;
}) {
  const visited = !!pin.visitedAt;
  return (
    <Pressable style={[styles.stopCard, isActive && styles.stopCardActive]} onPress={onPress}>
      <View
        style={[
          styles.stopNum,
          isActive && styles.stopNumActive,
          visited && styles.stopNumVisited,
          dayColour ? { backgroundColor: dayColour, borderColor: dayColour } : undefined,
        ]}
      >
        {visited ? (
          <Text style={styles.stopNumText}>✓</Text>
        ) : (
          <Text style={styles.stopNumText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.stopInfo}>
        <Text style={[styles.stopName, visited && styles.stopNameVisited]} numberOfLines={1}>
          {pin.placeName}
        </Text>
        <View style={styles.stopMeta}>
          {pin.city ? (
            <Text style={styles.stopCity} numberOfLines={1}>
              {pin.city}
              {pin.countryCode ? `, ${pin.countryCode}` : ""}
            </Text>
          ) : null}
          {pin.openNow !== undefined ? (
            <Text style={{ fontSize: 10, fontWeight: "700", color: pin.openNow ? GREEN : RED }}>
              ● {pin.openNow ? "Open" : "Closed"}
            </Text>
          ) : null}
          {pin.rating !== undefined ? (
            <Text style={styles.ratingLabel}>★ {pin.rating.toFixed(1)}</Text>
          ) : null}
          {pin.category && pin.category !== "other" ? (
            <Text style={styles.categoryLabel}>{CATEGORY_ICONS[pin.category] ?? ""}</Text>
          ) : null}
        </View>
      </View>
      {onVisitToggle && (
        <Pressable
          style={[styles.visitBtn, visited && styles.visitBtnDone]}
          onPress={(e) => {
            e.stopPropagation?.();
            onVisitToggle();
          }}
          hitSlop={8}
        >
          <Text style={styles.visitBtnText}>{visited ? "✓" : "○"}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  center: { justifyContent: "center", alignItems: "center" },

  offlineBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    backgroundColor: "#2e2010",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  offlineText: { color: AMBER, fontSize: 12, fontWeight: "700", textAlign: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 14, fontWeight: "800", letterSpacing: -0.3 },
  headerMeta: { color: MUTED, fontSize: 11, marginTop: 1 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: SURFACE2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconBtnText: { fontSize: 16 },
  iconBtnDisabled: { opacity: 0.4 },
  iconBtnActive: { backgroundColor: "#2a1a12", borderColor: CORAL },

  chipScroll: {
    maxHeight: 40,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  chipRow: { paddingHorizontal: 10, paddingVertical: 6, gap: 6, alignItems: "center" },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  chipActive: { backgroundColor: "#2a1a12", borderColor: CORAL },
  chipText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: CORAL },

  dayScroll: { maxHeight: 38, backgroundColor: SURFACE },
  dayRow: { paddingHorizontal: 10, paddingVertical: 5, gap: 6, alignItems: "center" },
  dayTab: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE2,
  },
  dayTabActive: { backgroundColor: "#2a1a12", borderColor: CORAL },
  dayTabText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  dayTabTextActive: { color: CORAL },

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

  markerContainer: {
    alignItems: "center",
    position: "relative",
  },
  openDot: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  markerWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CORAL,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  markerWrapActive: { backgroundColor: "#a8401e", transform: [{ scale: 1.15 }] },
  markerText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  listWrap: { maxHeight: 180, backgroundColor: SURFACE, borderTopWidth: 1, borderTopColor: BORDER },
  flatListContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: "#111110",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionTitle: {
    color: MUTED,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionCount: { color: MUTED, fontSize: 10 },

  visitBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  visitBtnDone: {
    borderColor: GREEN,
    backgroundColor: GREEN + "22",
  },
  visitBtnText: { color: MUTED, fontSize: 13, fontWeight: "700" },
  stopNumVisited: { backgroundColor: GREEN, borderColor: GREEN },
  stopNameVisited: { color: MUTED, textDecorationLine: "line-through" },
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
