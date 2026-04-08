import type { RestaurantOption } from "../../../types/scratchPlan";

interface Props {
  option: RestaurantOption;
  selected: boolean;
  onSelect: () => void;
}

export default function RestaurantCard({ option, selected, onSelect }: Props) {
  const priceLabel =
    option.price_level != null
      ? (["Free", "$", "$$", "$$$", "$$$$"][option.price_level] ?? "")
      : null;

  return (
    <button
      className={`restaurant-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="restaurant-card"
    >
      {/* Selection indicator */}
      <div className="restaurant-select-indicator">
        {selected ? <span className="check-mark">✓</span> : null}
      </div>

      {/* Photo */}
      {option.photo_url ? (
        <img className="restaurant-photo" src={option.photo_url} alt={option.name} loading="lazy" />
      ) : (
        <div className="restaurant-photo-placeholder">🍽</div>
      )}

      <div className="restaurant-content">
        <h4 className="restaurant-name">{option.name}</h4>

        {option.known_for && <p className="restaurant-known-for">{option.known_for}</p>}

        <div className="restaurant-meta">
          {option.rating != null && <span className="r-meta">★ {option.rating.toFixed(1)}</span>}
          {priceLabel && <span className="r-meta">{priceLabel}</span>}
        </div>

        {option.address && <p className="restaurant-address">📍 {option.address}</p>}
      </div>
    </button>
  );
}
