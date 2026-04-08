import RestaurantCard from './RestaurantCard'
import type { CuratedFoodChoice, FoodStop, MealSlot, RestaurantOption } from '../../../types/scratchPlan'

interface Props {
  slot: FoodStop
  choice: CuratedFoodChoice | undefined
  dayIndex: number
  onChoose: (meal: MealSlot, option: RestaurantOption) => void
  onSkip: (meal: MealSlot) => void
}

const MEAL_LABELS: Record<MealSlot, { icon: string; label: string }> = {
  breakfast: { icon: '☕', label: 'Breakfast' },
  lunch:     { icon: '🥗', label: 'Lunch' },
  dinner:    { icon: '🌆', label: 'Dinner' },
}

export default function FoodSlot({ slot, choice, onChoose, onSkip }: Props) {
  const { icon, label } = MEAL_LABELS[slot.meal]
  const isSkipped = choice?.chosen === null
  const hasOptions = slot.options.length > 0

  return (
    <div className={`food-slot ${isSkipped ? 'skipped' : ''}`}>
      {/* Meal header */}
      <div className="food-slot-header">
        <span className="food-slot-icon">{icon}</span>
        <span className="food-slot-label">{label}</span>
        {isSkipped ? (
          <span className="food-slot-status skipped-badge">Skipped</span>
        ) : choice?.chosen ? (
          <span className="food-slot-status chosen-badge">✓ Chosen</span>
        ) : null}
        <button
          className="food-slot-skip"
          onClick={() => onSkip(slot.meal)}
          aria-label={isSkipped ? `Undo skip ${label}` : `Skip ${label}`}
        >
          {isSkipped ? 'Undo skip' : 'Skip'}
        </button>
      </div>

      {/* Options */}
      {!isSkipped && hasOptions && (
        <div className="restaurant-options">
          {slot.options.map((option, i) => (
            <RestaurantCard
              key={option.place_id ?? `${slot.meal}-${i}`}
              option={option}
              selected={choice?.chosen?.place_id === option.place_id}
              onSelect={() => onChoose(slot.meal, option)}
            />
          ))}
        </div>
      )}

      {!isSkipped && !hasOptions && (
        <p className="food-slot-empty">
          No restaurant options found nearby — try skipping this slot.
        </p>
      )}
    </div>
  )
}
