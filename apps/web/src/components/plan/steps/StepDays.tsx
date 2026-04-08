import { useScratchPlanStore } from '../../../stores/scratchPlanStore'

interface Props {
  onBack: () => void
  onNext: () => void
}

const MIN_DAYS = 1
const MAX_DAYS = 14

export default function StepDays({ onBack, onNext }: Props) {
  const days = useScratchPlanStore((s) => s.days)
  const setDays = useScratchPlanStore((s) => s.setDays)

  const decrement = () => setDays(Math.max(MIN_DAYS, days - 1))
  const increment = () => setDays(Math.min(MAX_DAYS, days + 1))

  const label = days === 1 ? '1 day' : `${days} days`

  // Quick select presets
  const PRESETS = [3, 5, 7, 10, 14]

  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-title">How long is your trip?</h2>
        <p className="step-subtitle">
          We'll plan the right number of stops per day.
        </p>
      </div>

      <div className="days-stepper">
        <button
          className="stepper-btn"
          onClick={decrement}
          disabled={days <= MIN_DAYS}
          aria-label="Decrease days"
        >
          −
        </button>

        <div className="stepper-display">
          <span className="stepper-number">{days}</span>
          <span className="stepper-unit">
            {days === 1 ? 'day' : 'days'}
          </span>
        </div>

        <button
          className="stepper-btn"
          onClick={increment}
          disabled={days >= MAX_DAYS}
          aria-label="Increase days"
        >
          +
        </button>
      </div>

      {/* Quick preset chips */}
      <div className="days-presets">
        {PRESETS.map((n) => (
          <button
            key={n}
            className={`preset-chip ${days === n ? 'selected' : ''}`}
            onClick={() => setDays(n)}
          >
            {n}d
          </button>
        ))}
      </div>

      {/* Rough itinerary hint */}
      <p className="days-hint">
        ≈ {Math.round(days * 3.5)} stops · {days * 3} meals planned
      </p>

      <div className="step-footer">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  )
}
