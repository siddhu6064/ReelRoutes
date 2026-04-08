import type { TripPreference } from '../../../types/scratchPlan'
import { useScratchPlanStore } from '../../../stores/scratchPlanStore'

interface Props {
  onBack: () => void
  onGenerate: () => void
  error?: string
}

const PREFERENCES: Array<{ value: TripPreference; label: string; emoji: string; desc: string }> = [
  { value: 'food',      label: 'Food & Drink', emoji: '🍜', desc: 'Local cuisine, cafes, restaurants' },
  { value: 'history',  label: 'History',      emoji: '🏛',  desc: 'Museums, landmarks, heritage sites' },
  { value: 'nature',   label: 'Nature',       emoji: '🌿', desc: 'Parks, hikes, scenic spots' },
  { value: 'art',      label: 'Art & Culture',emoji: '🎨', desc: 'Galleries, street art, live music' },
  { value: 'adventure',label: 'Adventure',    emoji: '🧗', desc: 'Outdoor activities, thrills' },
  { value: 'shopping', label: 'Shopping',     emoji: '🛍',  desc: 'Markets, boutiques, local crafts' },
  { value: 'nightlife',label: 'Nightlife',    emoji: '🌙', desc: 'Bars, clubs, evening entertainment' },
]

export default function StepPreferences({ onBack, onGenerate, error }: Props) {
  const preferences = useScratchPlanStore((s) => s.preferences)
  const togglePreference = useScratchPlanStore((s) => s.togglePreference)
  const destination = useScratchPlanStore((s) => s.destination)

  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-title">What's your vibe?</h2>
        <p className="step-subtitle">
          Select what matters to you in {destination || 'your destination'}.
          Skip this to get a balanced mix.
        </p>
      </div>

      <div className="preference-grid">
        {PREFERENCES.map((pref) => {
          const selected = preferences.includes(pref.value)
          return (
            <button
              key={pref.value}
              className={`preference-chip ${selected ? 'selected' : ''}`}
              onClick={() => togglePreference(pref.value)}
              aria-pressed={selected}
            >
              <span className="pref-emoji">{pref.emoji}</span>
              <span className="pref-label">{pref.label}</span>
              <span className="pref-desc">{pref.desc}</span>
              {selected && <span className="pref-check">✓</span>}
            </button>
          )
        })}
      </div>

      {preferences.length > 0 && (
        <p className="pref-count">
          {preferences.length} interest{preferences.length !== 1 ? 's' : ''} selected
        </p>
      )}

      {error && (
        <div className="step-error" role="alert">
          <span>⚠</span> {error}
          <p className="error-hint">Check your connection and try again.</p>
        </div>
      )}

      <div className="step-footer">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary btn-generate" onClick={onGenerate}>
          <span className="btn-icon">✨</span>
          Plan my trip
        </button>
      </div>
    </div>
  )
}
