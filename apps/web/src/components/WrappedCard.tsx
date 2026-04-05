import { useWrapped, type WrappedStats } from "../api/client";

import styles from "./WrappedCard.module.css";

interface WrappedCardProps {
  tripId: string;
  userId?: string;
}

async function shareStats(stats: WrappedStats) {
  const text =
    `🗺️ ${stats.title} — Trip Wrapped\n` +
    `✅ ${stats.visitedPins}/${stats.totalPins} spots visited\n` +
    `📍 ${stats.distanceKm} km explored\n` +
    `📝 ${stats.diaryCount} diary entries\n` +
    `#ReelRoutes`;
  if (navigator.share) {
    await navigator.share({ title: stats.title, text });
  } else {
    await navigator.clipboard.writeText(text);
    alert("Stats copied to clipboard!");
  }
}

function ProgressRing({ rate, size = 96 }: { rate: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - rate);
  return (
    <svg width={size} height={size} className={styles.ring} aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={8}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="#fff"
        fontSize={size * 0.22}
        fontWeight="700"
      >
        {Math.round(rate * 100)}%
      </text>
    </svg>
  );
}

export default function WrappedCard({ tripId, userId }: WrappedCardProps) {
  const { data, isLoading, isError } = useWrapped(tripId, userId);

  if (isLoading) {
    return (
      <div className={`${styles.card} ${styles.loading}`} aria-busy="true">
        <div className={styles.spinner} />
        <p>Crunching your trip stats…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`${styles.card} ${styles.error}`}>
        <p>Could not load stats. Try again later.</p>
      </div>
    );
  }

  const topCat = data.topCategories[0];
  const dateRange =
    data.firstVisit && data.lastVisit
      ? `${new Date(data.firstVisit).toLocaleDateString()} – ${new Date(data.lastVisit).toLocaleDateString()}`
      : "Not started yet";

  return (
    <section className={styles.card} aria-label="Trip Wrapped stats">
      <div className={styles.header}>
        <span className={styles.badge}>✈️ Trip Wrapped</span>
        <h2 className={styles.title}>{data.title}</h2>
        <p className={styles.dates}>{dateRange}</p>
      </div>

      <div className={styles.hero}>
        <ProgressRing rate={data.visitRate} size={120} />
        <p className={styles.heroLabel}>
          {data.visitedPins} of {data.totalPins} spots visited
        </p>
      </div>

      <div className={styles.chips}>
        {[
          { icon: "📍", value: String(data.distanceKm), label: "km explored" },
          { icon: "📝", value: String(data.diaryCount), label: "diary entries" },
          {
            icon: "📅",
            value: String(data.daysActive),
            label: data.daysActive === 1 ? "day active" : "days active",
          },
          ...(topCat ? [{ icon: "🏆", value: topCat.category, label: "top category" }] : []),
        ].map((c) => (
          <div key={c.label} className={styles.chip}>
            <span aria-hidden="true">{c.icon}</span>
            <span className={styles.chipValue}>{c.value}</span>
            <span className={styles.chipLabel}>{c.label}</span>
          </div>
        ))}
      </div>

      {data.topCategories.length > 0 && (
        <div className={styles.cats}>
          <p className={styles.catsLabel}>Top spot types</p>
          {data.topCategories.map((c) => {
            const pct = (c.count / (data.topCategories[0]?.count ?? 1)) * 100;
            return (
              <div key={c.category} className={styles.catRow}>
                <span className={styles.catName}>{c.category}</span>
                <div className={styles.catBarWrap}>
                  <div className={styles.catBar} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.catCount}>{c.count}</span>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className={styles.shareBtn} onClick={() => shareStats(data)}>
        Share my stats 🔗
      </button>
    </section>
  );
}
