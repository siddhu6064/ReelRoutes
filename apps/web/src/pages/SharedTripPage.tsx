import { useState } from "react";
import { useParams, Link } from "react-router-dom";

import styles from "./SharedTripPage.module.css";

import type { Pin } from "@/api/client";

import { useSharedTrip } from "@/api/client";

export default function SharedTripPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { data: trip, isLoading, error } = useSharedTrip(shareToken ?? null);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p>Loading trip…</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className={styles.center}>
        <div className={styles.errorIcon}>✕</div>
        <h2>Trip not found</h2>
        <p>This link may have expired or been removed.</p>
        <Link to="/" className={styles.ctaBtn}>Create your own trip →</Link>
      </div>
    );
  }

  const sorted = [...trip.pins].sort((a, b) => a.order - b.order);

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.brand}>
            <div className={styles.logo}>◈</div>
            <span>ReelRoutes</span>
          </Link>
          <div className={styles.divider} />
          <div>
            <h1 className={styles.tripTitle}>{trip.title}</h1>
            <p className={styles.tripMeta}>
              {sorted.length} stops · {trip.platform} · <em>Shared trip</em>
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.copyBtn} onClick={copyLink}>
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
          <Link to="/" className={styles.importBtn}>Import your own video →</Link>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Stop list */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarInner}>
            {sorted.map((pin, i) => (
              <button
                key={pin.id}
                className={`${styles.stop} ${selectedPin?.id === pin.id ? styles.active : ""}`}
                onClick={() => setSelectedPin(pin)}
              >
                <div className={styles.stopNum}>{i + 1}</div>
                <div className={styles.stopInfo}>
                  <div className={styles.stopName}>{pin.placeName}</div>
                  {pin.city && (
                    <div className={styles.stopCity}>
                      {pin.city}{pin.countryCode ? `, ${pin.countryCode}` : ""}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Map + detail pane */}
        <main className={styles.main}>
          {/* Map placeholder — real map uses VITE_GOOGLE_MAPS_API_KEY */}
          <div className={styles.mapPlaceholder}>
            <div className={styles.pinCloud}>
              {sorted.map((pin, i) => (
                <button
                  key={pin.id}
                  className={`${styles.mapPin} ${selectedPin?.id === pin.id ? styles.mapPinActive : ""}`}
                  onClick={() => setSelectedPin(pin)}
                  style={{
                    left: `${10 + (i * 7) % 80}%`,
                    top: `${15 + (i * 11) % 65}%`,
                  }}
                  title={pin.placeName}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <p className={styles.mapNote}>
              🗺 Interactive map — add <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable
            </p>
          </div>

          {/* Pin detail */}
          {selectedPin && (
            <div className={styles.pinDetail}>
              <div className={styles.pinDetailHeader}>
                <div className={styles.pinDetailNum}>
                  {sorted.findIndex(p => p.id === selectedPin.id) + 1}
                </div>
                <div>
                  <h3 className={styles.pinDetailName}>{selectedPin.placeName}</h3>
                  {selectedPin.address && (
                    <p className={styles.pinDetailAddr}>{selectedPin.address}</p>
                  )}
                </div>
                <button className={styles.closeDetail} onClick={() => setSelectedPin(null)}>✕</button>
              </div>
              {selectedPin.contextQuote && (
                <blockquote className={styles.quote}>"{selectedPin.contextQuote}"</blockquote>
              )}
              {selectedPin.notes && (
                <p className={styles.notes}>{selectedPin.notes}</p>
              )}
              {selectedPin.placeId && (
                <a
                  href={`https://www.google.com/maps/place/?q=place_id:${selectedPin.placeId}`}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.mapsLink}
                >
                  Open in Google Maps ↗
                </a>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Task 7 — Growth loop CTA */}
      <div className={styles.growthBanner}>
        <div className={styles.growthInner}>
          <p>
            <strong>Saw a travel video you love?</strong>{" "}
            Turn it into your own trip map in 30 seconds.
          </p>
          <Link to="/" className={styles.growthCta}>
            Import your video — it's free →
          </Link>
        </div>
      </div>
    </div>
  );
}
