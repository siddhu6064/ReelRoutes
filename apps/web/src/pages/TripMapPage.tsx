import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader } from "@googlemaps/js-api-loader";
import { useTrip } from "@/api/client";
import type { Pin } from "@/api/client";
import { useAppStore } from "@/stores/appStore";
import PinDetailPanel from "@/components/PinDetailPanel";
import ChatPanel from "@/components/ChatPanel";
import styles from "./TripMapPage.module.css";

const CORAL = "#D85A30";
const ACTIVE = "#a8401e";

const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a18" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9e9c94" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c29" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#38382f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function makeMarkerLabel(n: number): google.maps.MarkerLabel {
  return { text: String(n), color: "#fff", fontFamily: "'Syne', sans-serif", fontWeight: "800", fontSize: "12px" };
}

/** Haversine distance in km between two pins */
function distKm(a: Pin, b: Pin) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Build Google Maps URL with all pins as waypoints */
function googleMapsUrl(pins: Pin[]) {
  if (!pins.length) return "#";
  const origin = `${pins[0].lat},${pins[0].lng}`;
  const dest = `${pins[pins.length - 1].lat},${pins[pins.length - 1].lng}`;
  const waypoints = pins.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`;
  return waypoints ? `${base}&waypoints=${waypoints}` : base;
}

/** Group pins by city_group (or city+country fallback) */
function groupByCity(pins: Pin[]): Map<string, Pin[]> {
  const groups = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key = pin.cityGroup ?? (pin.city ? `${pin.city}${pin.countryCode ? ", " + pin.countryCode : ""}` : "Other");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pin);
  }
  return groups;
}

export default function TripMapPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { userId, chatOpen, setChatOpen } = useAppStore();
  const { data: trip, isLoading, error } = useTrip(tripId ?? null, userId ?? undefined);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());

  // Init map
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!mapRef.current || !apiKey) return;
    const loader = new Loader({ apiKey, version: "weekly", libraries: ["places"] });
    loader.load().then(() => {
      if (!mapRef.current) return;
      mapInstance.current = new google.maps.Map(mapRef.current, {
        zoom: 5,
        center: { lat: 35.6762, lng: 139.6503 },
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: "greedy",
      });
    });
  }, []);

  const sorted = useMemo(() => trip ? [...trip.pins].sort((a, b) => a.order - b.order) : [], [trip]);
  const cityGroups = useMemo(() => groupByCity(sorted), [sorted]);
  const cities = useMemo(() => Array.from(cityGroups.keys()), [cityGroups]);
  const visiblePins = useMemo(() =>
    cityFilter ? sorted.filter(p => {
      const key = p.cityGroup ?? (p.city ? `${p.city}${p.countryCode ? ", " + p.countryCode : ""}` : "Other");
      return key === cityFilter;
    }) : sorted,
    [sorted, cityFilter]
  );

  // Total route distance
  const totalKm = useMemo(() => {
    if (sorted.length < 2) return 0;
    return sorted.reduce((acc, pin, i) => i === 0 ? 0 : acc + distKm(sorted[i - 1], pin), 0);
  }, [sorted]);
  const totalMins = Math.round((totalKm / 60) * 60); // ~60 km/h avg drive

  // Update markers + polyline when trip loads or filters change
  useEffect(() => {
    if (!mapInstance.current || !sorted.length) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    const bounds = new google.maps.LatLngBounds();
    const path: google.maps.LatLngLiteral[] = [];

    sorted.forEach((pin, i) => {
      const pos = { lat: pin.lat, lng: pin.lng };
      const isFiltered = cityFilter && (pin.cityGroup ?? (pin.city ? `${pin.city}${pin.countryCode ? ", " + pin.countryCode : ""}` : "Other")) !== cityFilter;
      const marker = new google.maps.Marker({
        position: pos,
        map: mapInstance.current!,
        label: makeMarkerLabel(i + 1),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: isFiltered ? "#555" : (i === activeIndex ? ACTIVE : CORAL),
          fillOpacity: isFiltered ? 0.3 : 1,
          strokeColor: "#fff",
          strokeWeight: isFiltered ? 1 : 2,
        },
        title: pin.placeName,
        zIndex: isFiltered ? 1 : 10,
      });
      if (!isFiltered) {
        marker.addListener("click", () => { setSelectedPin(pin); setActiveIndex(i); });
      }
      markersRef.current.push(marker);
      bounds.extend(pos);
      path.push(pos);
    });

    // Draw route polyline
    if (showRoute && path.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        path,
        map: mapInstance.current,
        strokeColor: CORAL,
        strokeOpacity: 0.7,
        strokeWeight: 3,
      });
    }

    mapInstance.current.fitBounds(bounds, 60);
  }, [sorted, activeIndex, showRoute, cityFilter]);

  function selectPin(pin: Pin, index: number) {
    setSelectedPin(pin);
    setActiveIndex(index);
    const marker = markersRef.current[index];
    if (marker && mapInstance.current) {
      mapInstance.current.panTo(marker.getPosition()!);
      mapInstance.current.setZoom(14);
    }
  }

  function toggleCity(city: string) {
    setCollapsedCities(prev => {
      const next = new Set(prev);
      next.has(city) ? next.delete(city) : next.add(city);
      return next;
    });
  }

  if (isLoading) return <div className={styles.loading}>Loading trip…</div>;
  if (error || !trip) return (
    <div className={styles.loading}>
      Trip not found. <Link to="/" className={styles.backLink}>Go home</Link>
    </div>
  );

  return (
    <div className={styles.layout}>
      {/* ── Left sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          {/* Attribution header (W1t4) */}
          {(trip.videoCreator || trip.thumbnailUrl) && (
            <a
              href={trip.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.attribution}
            >
              {trip.thumbnailUrl && (
                <img src={trip.thumbnailUrl} alt="" className={styles.attrThumb} />
              )}
              <div className={styles.attrInfo}>
                <span className={styles.attrLabel}>▶ Source video</span>
                {trip.videoCreator && <span className={styles.attrCreator}>{trip.videoCreator}</span>}
                {trip.videoChannel && <span className={styles.attrChannel}>{trip.videoChannel}</span>}
              </div>
            </a>
          )}

          <div className={styles.titleRow}>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>← Back</button>
            <h1 className={styles.tripTitle}>{trip.title}</h1>
          </div>

          {/* Route stats (W3t4) */}
          <p className={styles.tripMeta}>
            {sorted.length} stops · {trip.platform}
            {totalKm > 0 && (
              <> · <span className={styles.distBadge}>🚗 {totalKm.toFixed(0)} km{totalMins > 0 ? ` · ~${totalMins >= 60 ? Math.floor(totalMins / 60) + "h " + (totalMins % 60) + "m" : totalMins + "m"}` : ""}</span></>
            )}
          </p>

          {/* Toolbar */}
          <div className={styles.toolbar}>
            {/* Route toggle (W3t2) */}
            <button
              className={`${styles.toolBtn} ${showRoute ? styles.toolBtnActive : ""}`}
              onClick={() => setShowRoute(v => !v)}
              title="Toggle route line"
            >
              {showRoute ? "— Hide route" : "— Show route"}
            </button>
            {/* Open in Google Maps (W4t5) */}
            <a
              className={styles.gmapsBtn}
              href={googleMapsUrl(sorted)}
              target="_blank"
              rel="noreferrer"
            >
              🗺 Open all in Google Maps
            </a>
            <div className={styles.sidebarActions}>
              <button className={styles.chatToggle} onClick={() => setChatOpen(!chatOpen)}>
                💬 {chatOpen ? "Close" : "AI"}
              </button>
              <Link to={`/trips/${trip.id}/edit`} className={styles.editBtn}>Edit</Link>
            </div>
          </div>

          {/* City filter chips (W4t3) */}
          {cities.length > 1 && (
            <div className={styles.cityChips}>
              <button
                className={`${styles.cityChip} ${cityFilter === null ? styles.cityChipActive : ""}`}
                onClick={() => setCityFilter(null)}
              >
                All
              </button>
              {cities.map(city => (
                <button
                  key={city}
                  className={`${styles.cityChip} ${cityFilter === city ? styles.cityChipActive : ""}`}
                  onClick={() => setCityFilter(city === cityFilter ? null : city)}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stop list — grouped by city (W4t1) */}
        <div className={styles.stopList}>
          {cities.length > 1
            ? Array.from(cityGroups.entries()).map(([city, pins]) => {
                const hidden = collapsedCities.has(city);
                const pinsToShow = cityFilter && city !== cityFilter ? [] : pins;
                if (cityFilter && city !== cityFilter) return null;
                return (
                  <div key={city}>
                    <button className={styles.cityGroupHeader} onClick={() => toggleCity(city)}>
                      <span className={styles.cityGroupLabel}>📍 {city}</span>
                      <span className={styles.cityGroupCount}>{pins.length} stops</span>
                      <span className={styles.cityGroupChev}>{hidden ? "▶" : "▼"}</span>
                    </button>
                    {!hidden && pinsToShow.map(pin => {
                      const i = sorted.indexOf(pin);
                      return (
                        <StopRow key={pin.id} pin={pin} index={i} active={activeIndex === i} onClick={() => selectPin(pin, i)} />
                      );
                    })}
                  </div>
                );
              })
            : visiblePins.map((pin, i) => (
                <StopRow key={pin.id} pin={pin} index={i} active={activeIndex === sorted.indexOf(pin)} onClick={() => selectPin(pin, sorted.indexOf(pin))} />
              ))
          }
        </div>
      </aside>

      {/* ── Map ── */}
      <main className={styles.mapWrap}>
        <div ref={mapRef} className={styles.map} />
        {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
          <div className={styles.mapPlaceholder}>
            <p>🗺 Map renders with VITE_GOOGLE_MAPS_API_KEY set</p>
            <div className={styles.mockPins}>
              {sorted.map((pin, i) => (
                <div key={pin.id} className={`${styles.mockPin} ${activeIndex === i ? styles.active : ""}`} onClick={() => selectPin(pin, i)}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Right panel ── */}
      {chatOpen ? (
        <ChatPanel tripId={trip.id} onClose={() => setChatOpen(false)} />
      ) : selectedPin ? (
        <PinDetailPanel pin={selectedPin} tripId={trip.id} onClose={() => setSelectedPin(null)} />
      ) : null}
    </div>
  );
}

function StopRow({ pin, index, active, onClick }: { pin: Pin; index: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`${styles.stop} ${active ? styles.active : ""}`} onClick={onClick}>
      <div className={styles.stopNum}>{index + 1}</div>
      <div className={styles.stopInfo}>
        <div className={styles.stopName}>{pin.placeName}</div>
        <div className={styles.stopMeta}>
          {pin.city && <span>{pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}</span>}
          {pin.openNow !== undefined && (
            <span className={pin.openNow ? styles.openNow : styles.closedNow}>
              {pin.openNow ? "● Open" : "● Closed"}
            </span>
          )}
          {pin.rating !== undefined && <span className={styles.stopRating}>★ {pin.rating.toFixed(1)}</span>}
        </div>
      </div>
      {pin.confidence < 0.5 && <span className={styles.lowConf} title="Low AI confidence">⚠</span>}
    </button>
  );
}
