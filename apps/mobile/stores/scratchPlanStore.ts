import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  ActivityStop,
  CuratedDay,
  CuratedFoodChoice,
  DraftItinerary,
  FoodStop,
  MealSlot,
  PlanRequest,
  RestaurantOption,
  TravelMode,
  TripPreference,
  WizardStep,
} from '@/types/scratchPlan'

// ─── State shape ─────────────────────────────────────────────────────────────

interface ScratchPlanState {
  // Wizard navigation
  step: WizardStep

  // Step 1 — origin inputs
  startingPoint: string
  destination: string

  // Step 2 — days
  days: number

  // Step 3 — preferences
  preferences: TripPreference[]

  // Travel mode (carried from request defaults)
  travelMode: TravelMode

  // Raw draft from the API (Step 4 loads this)
  draft: DraftItinerary | null

  // Curated state — what the user edits in curation screen
  curatedDays: CuratedDay[]

  // ── Actions ────────────────────────────────────────────────────────────────

  setStep: (step: WizardStep) => void

  // Step 1
  setStartingPoint: (v: string) => void
  setDestination: (v: string) => void

  // Step 2
  setDays: (n: number) => void

  // Step 3
  togglePreference: (p: TripPreference) => void

  // Step 4 — store draft and initialise curated state
  setDraft: (draft: DraftItinerary) => void

  // Curation — activity stops
  removeActivityStop: (dayIndex: number, stopIndex: number) => void
  reorderActivityStops: (dayIndex: number, fromIndex: number, toIndex: number) => void

  // Curation — food choices
  chooseFoodOption: (dayIndex: number, meal: MealSlot, option: RestaurantOption) => void
  skipFoodSlot: (dayIndex: number, meal: MealSlot) => void

  // Reset everything
  reset: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initCuratedDays(draft: DraftItinerary): CuratedDay[] {
  return draft.days_plan.map((dayPlan) => {
    const activityStops: ActivityStop[] = dayPlan.stops.filter(
      (s): s is ActivityStop => s.type === 'activity'
    )
    const foodSlots: FoodStop[] = dayPlan.stops.filter(
      (s): s is FoodStop => s.type === 'food'
    )
    const foodChoices: CuratedFoodChoice[] = foodSlots.map((slot) => ({
      meal: slot.meal,
      chosen: slot.options[0] ?? null, // pre-select first option
    }))

    return {
      day: dayPlan.day,
      activityStops,
      foodChoices,
      foodSlots,
    }
  })
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  step: 'origin' as WizardStep,
  startingPoint: '',
  destination: '',
  days: 3,
  preferences: [] as TripPreference[],
  travelMode: 'driving' as TravelMode,
  draft: null,
  curatedDays: [] as CuratedDay[],
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useScratchPlanStore = create<ScratchPlanState>()(
  devtools(
    (set) => ({
      ...DEFAULT_STATE,

      setStep: (step) => set({ step }, false, 'setStep'),

      setStartingPoint: (startingPoint) =>
        set({ startingPoint }, false, 'setStartingPoint'),

      setDestination: (destination) =>
        set({ destination }, false, 'setDestination'),

      setDays: (days) => set({ days }, false, 'setDays'),

      togglePreference: (p) =>
        set(
          (state) => ({
            preferences: state.preferences.includes(p)
              ? state.preferences.filter((x) => x !== p)
              : [...state.preferences, p],
          }),
          false,
          'togglePreference'
        ),

      setDraft: (draft) =>
        set(
          { draft, curatedDays: initCuratedDays(draft), step: 'curation' },
          false,
          'setDraft'
        ),

      removeActivityStop: (dayIndex, stopIndex) =>
        set(
          (state) => {
            const days = state.curatedDays.map((d, di) => {
              if (di !== dayIndex) return d
              return {
                ...d,
                activityStops: d.activityStops.filter((_, si) => si !== stopIndex),
              }
            })
            return { curatedDays: days }
          },
          false,
          'removeActivityStop'
        ),

      reorderActivityStops: (dayIndex, fromIndex, toIndex) =>
        set(
          (state) => {
            const days = state.curatedDays.map((d, di) => {
              if (di !== dayIndex) return d
              const stops = [...d.activityStops]
              const [moved] = stops.splice(fromIndex, 1)
              if (moved) stops.splice(toIndex, 0, moved)
              return { ...d, activityStops: stops }
            })
            return { curatedDays: days }
          },
          false,
          'reorderActivityStops'
        ),

      chooseFoodOption: (dayIndex, meal, option) =>
        set(
          (state) => {
            const days = state.curatedDays.map((d, di) => {
              if (di !== dayIndex) return d
              return {
                ...d,
                foodChoices: d.foodChoices.map((fc) =>
                  fc.meal === meal ? { ...fc, chosen: option } : fc
                ),
              }
            })
            return { curatedDays: days }
          },
          false,
          'chooseFoodOption'
        ),

      skipFoodSlot: (dayIndex, meal) =>
        set(
          (state) => {
            const days = state.curatedDays.map((d, di) => {
              if (di !== dayIndex) return d
              return {
                ...d,
                foodChoices: d.foodChoices.map((fc) =>
                  fc.meal === meal ? { ...fc, chosen: null } : fc
                ),
              }
            })
            return { curatedDays: days }
          },
          false,
          'skipFoodSlot'
        ),

      reset: () => set(DEFAULT_STATE, false, 'reset'),
    }),
    { name: 'scratch-plan-store' }
  )
)

// ─── Selectors ───────────────────────────────────────────────────────────────

/** Build the PlanRequest body from wizard state */
export function selectPlanRequest(state: ScratchPlanState): import('../types/scratchPlan').PlanRequest {
  return {
    starting_point: state.startingPoint,
    destination: state.destination,
    days: state.days,
    preferences: state.preferences,
    travel_mode: state.travelMode,
  }
}

/** All activity stop pins across all curated days (for the map) */
export function selectAllActivityPins(
  state: ScratchPlanState
): ActivityStop[] {
  return state.curatedDays.flatMap((d) => d.activityStops)
}

/** All chosen food pins across all curated days (for the map) */
export function selectChosenFoodPins(
  state: ScratchPlanState
): RestaurantOption[] {
  return state.curatedDays.flatMap((d) =>
    d.foodChoices.filter((fc) => fc.chosen !== null).map((fc) => fc.chosen!)
  )
}

/** Total stop count across all days (used to disable Save when 0) */
export function selectTotalStops(state: ScratchPlanState): number {
  return state.curatedDays.reduce(
    (acc, d) => acc + d.activityStops.length,
    0
  )
}
