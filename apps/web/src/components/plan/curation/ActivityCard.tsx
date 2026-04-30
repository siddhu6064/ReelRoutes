import type { ActivityStop } from "../../../types/scratchPlan";

interface Props {
  stop: ActivityStop;
  index: number;
  dayIndex: number;
  onRemove: () => void;
  /** Passed from DndContext for drag handle */
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}

export default function ActivityCard({
  stop,
  index,
  onRemove,
  dragHandleProps,
  isDragging,
}: Props): React.ReactElement {
  const priceLabel =
    stop.price_level != null ? (["Free", "$", "$$", "$$$", "$$$$"][stop.price_level] ?? "") : null;

  return (
    <div className={`activity-card ${isDragging ? "dragging" : ""}`} data-testid="activity-card">
      {/* Drag handle */}
      <div className="card-drag-handle" {...dragHandleProps} aria-label="Drag to reorder">
        <DragIcon />
      </div>

      {/* Photo */}
      {stop.photo_url ? (
        <img className="card-photo" src={stop.photo_url} alt={stop.name} loading="lazy" />
      ) : (
        <div className="card-photo-placeholder">
          <span>📍</span>
        </div>
      )}

      {/* Content */}
      <div className="card-content">
        <div className="card-header">
          <h3 className="card-name">{stop.name}</h3>
          <button
            className="card-remove"
            onClick={onRemove}
            aria-label={`Remove ${stop.name}`}
            title="Remove stop"
          >
            ×
          </button>
        </div>

        {/* Famous for badge */}
        {stop.famous_for && <span className="famous-badge">⭐ {stop.famous_for}</span>}

        {/* Meta row */}
        <div className="card-meta">
          {stop.best_time && <span className="meta-chip">🕐 {stop.best_time}</span>}
          {stop.rating != null && <span className="meta-chip">★ {stop.rating.toFixed(1)}</span>}
          {priceLabel && <span className="meta-chip">{priceLabel}</span>}
          {stop.distance_from_prev_km != null && index > 0 && (
            <span className="meta-chip distance">📏 {stop.distance_from_prev_km} km</span>
          )}
        </div>

        {/* Local tip */}
        {stop.local_tip && (
          <p className="card-tip">
            <span className="tip-icon">💡</span> {stop.local_tip}
          </p>
        )}

        {/* Opening hours */}
        {stop.opening_hours && (
          <p className="card-hours">🕐 {stop.opening_hours.split(" | ")[0]}</p>
        )}

        {/* Address */}
        {stop.address && <p className="card-address">📍 {stop.address}</p>}

        {/* Website link */}
        {stop.website && (
          <a className="card-link" href={stop.website} target="_blank" rel="noopener noreferrer">
            Visit website →
          </a>
        )}
      </div>
    </div>
  );
}

function DragIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="4" cy="16" r="1.5" />
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}
