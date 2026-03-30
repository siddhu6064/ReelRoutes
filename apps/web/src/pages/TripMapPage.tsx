import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader } from "@googlemaps/js-api-loader";
import { useTrip } from "@/api/client";
import type { Pin } from "@/api/client";
import { useAppStore } from "@/stores/appStore";
import PinDetailPanel from "@/components/PinDetailPanel";
import ChatPanel from "@/components/ChatPanel";
import styles from "./TripMapPage.module.css";

const CORAL = "#D85A30";

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
  return {
    text: String(n),
    color: "#fff",
    fontFamily: "'Syne', sans-serif",
    fontWeight: "800",
    fontSize: "12px",
  };
}

export default function TripMapPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { userId, chatOpen, setChatOpen } = useAppStore();
  const { data: trip, isLoading, error } = useTrip(tripId ?? null, userId ?? undefined);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  // Update markers when trip loads
  useEffect(() => {
    if (!mapInstance.current || !trip?.pins.length) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const sorted = [...trip.pins].sort((a, b) => a.order - b.order);
    const bounds = new google.maps.LatLngBounds();

    sorted.forEach((pin, i) => {
      const pos = { lat: pin.lat, lng: pin.lng };
      const marker = new google.maps.Marker({
        position: pos,
        map: mapInstance.current!,
        label: makeMarkerLabel(i + 1),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: i === activeIndex ? "#a8401e" : CORAL,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        title: pin.placeName,
      });
      marker.addListener("click", () => {
        setSelectedPin(pin);
        setActiveIndex(i);
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
    });

    mapInstance.current.fitBounds(bounds, 60);
  }, [trip, activeIndex]);

  function selectPin(pin: Pin, index: number) {
    setSelectedPin(pin);
    setActiveIndex(index);
    const marker = markersRef.current[index];
    if (marker && mapInstance.current) {
      mapInstance.current.panTo(marker.getPosition()!);
      mapInstance.current.setZoom(14);
    }
  }

  if (isLoading) return <div className={styles.loading}>Loading trip…</div>;
  if (error || !trip) return (
    <div className={styles.loading}>
      Trip not found. <Link to="/" className={styles.backLink}>Go home</Link>
    </div>
  );

  const sorted = [...trip.pins].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.layout}>
      {/* Left: stop list */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div>
            <button className={styles.backBtn} onClick={() => navigate(-1)}>← Back</button>
            <h1 className={styles.tripTitle}>{trip.title}</h1>
            <p className={styles.tripMeta}>
              {sorted.length} stops · {trip.platform}
            </p>
          </div>
          <div className={styles.sidebarActions}>
            <button
              className={styles.chatToggle}
              onClick={() => setChatOpen(!chatOpen)}
              title="AI Assistant"
            >
              💬 {chatOpen ? "Close chat" : "Ask AI"}
            </button>
            <Link to={`/trips/${trip.id}/edit`} className={styles.editBtn}>Edit</Link>
          </div>
        </div>

        <div className={styles.stopList}>
          {sorted.map((pin, i) => (
            <button
              key={pin.id}
              className={`${styles.stop} ${activeIndex === i ? styles.active : ""}`}
              onClick={() => selectPin(pin, i)}
            >
              <div className={styles.stopNum}>{i + 1}</div>
              <div className={styles.stopInfo}>
                <div className={styles.stopName}>{pin.placeName}</div>
                {pin.city && <div className={styles.stopCity}>{pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}</div>}
              </div>
              {pin.confidence < 0.5 && (
                <span className={styles.lowConf} title="Low AI confidence">⚠</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Center: map */}
      <main className={styles.mapWrap}>
        <div ref={mapRef} className={styles.map} />
        {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
          <div className={styles.mapPlaceholder}>
            <p>🗺 Map renders with VITE_GOOGLE_MAPS_API_KEY set</p>
            <div className={styles.mockPins}>
              {sorted.map((pin, i) => (
                <div key={pin.id} className={`${styles.mockPin} ${activeIndex === i ? styles.active : ""}`}
                  onClick={() => selectPin(pin, i)}>
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Right: pin detail or chat panel */}
      {chatOpen ? (
        <ChatPanel tripId={trip.id} onClose={() => setChatOpen(false)} />
      ) : selectedPin ? (
        <PinDetailPanel
          pin={selectedPin}
          tripId={trip.id}
          onClose={() => setSelectedPin(null)}
        />
      ) : null}
    </div>
  );
}
