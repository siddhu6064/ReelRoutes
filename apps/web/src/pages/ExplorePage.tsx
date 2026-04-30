import { useState } from "react";

import { useExplore, useTrending } from "../api/client";
import { TripCard } from "../components/TripCard";

import styles from "./ExplorePage.module.css";

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook", "twitter"];

interface Props {
  userId: string;
}

export function ExplorePage({ userId }: Props): React.ReactElement {
  const [destination, setDestination] = useState("");
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [showTrending, setShowTrending] = useState(false);

  const exploreQuery = useExplore(
    showTrending
      ? {}
      : {
          ...(destination ? { destination } : {}),
          ...(platform !== undefined ? { platform } : {}),
          page,
        },
  );
  const trendingQuery = useTrending();

  const trips = showTrending ? (trendingQuery.data?.trips ?? []) : (exploreQuery.data?.trips ?? []);

  const loading = showTrending ? trendingQuery.isLoading : exploreQuery.isLoading;

  function handleDestinationChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setDestination(e.target.value);
    setPage(1);
  }

  function handlePlatformToggle(p: string): void {
    setPlatform((prev) => (prev === p ? undefined : p));
    setPage(1);
    setShowTrending(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Explore Trips</h1>
        <p className={styles.sub}>Discover routes built from real travel videos</p>
      </header>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search destination…"
          value={destination}
          onChange={handleDestinationChange}
        />

        <div className={styles.filters}>
          <button
            className={showTrending ? styles.filterActive : styles.filter}
            onClick={() => setShowTrending((t) => !t)}
          >
            🔥 Trending
          </button>

          {PLATFORMS.map((p) => (
            <button
              key={p}
              className={platform === p ? styles.filterActive : styles.filter}
              onClick={() => handlePlatformToggle(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className={styles.loading}>Loading trips…</div>}

      {!loading && trips.length === 0 && (
        <div className={styles.empty}>
          <p>No public trips found yet.</p>
          <p className={styles.hint}>Be the first — make a trip public from its settings!</p>
        </div>
      )}

      <div className={styles.grid}>
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            userId={userId}
            onClick={(id) => window.location.assign(`/trips/${id}`)}
          />
        ))}
      </div>

      {!showTrending && trips.length > 0 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className={styles.pageNum}>Page {page}</span>
          <button className={styles.pageBtn} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
