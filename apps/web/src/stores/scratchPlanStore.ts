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
} from '../types/scratchPlan'

// ─── State shape ─────────────────────────────────────────────────────────────

interface ScratchPlanState {
  step: WizardStep
  startingPoint: string
  destination: string
  days: number
  preferences: TripPreference[]
  travelMode: TravelMode
  draft: DraftItinerary | null
  curatedDays: CuratedDay[]

  setStep: (step: WizardStep) => void
  setStartingPoint: (v: string) => void
  setDestination: (v: string) => void
  setDays: (n: number) => void
  togglePreference: (p: TripPreference) => void
  setDraft: (draft: DraftItinerary) => void
  removeActivityStop: (dayIndex: number, stopIndex: number) => void
  reorderActivityStops: (dayIndex: number, fromIndex: number, toIndex: number) => void
  chooseFoodOption: (dayIndex: number, meal: MealSlot, option: RestaurantOption) => void
  skipFoodSlot: (dayIndex: number, meal: MealSlot) => void
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
      chosen: slot.options[0] ?? null,
    }))
    return { day: dayPlan.day, activityStops, foodChoices, foodSlots }
  })
}

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
      setStartingPoint: (startingPoint) => set({ startingPoint }, false, 'setStartingPoint'),
      setDestination: (destination) => set({ destination }, false, 'setDestination'),
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
        set({ draft, curatedDays: initCuratedDays(draft), step: 'curation' }, false, 'setDraft'),
      removeActivityStop: (dayIndex, stopIndex) =>
        set(
          (state) => ({
            curatedDays: state.curatedDays.map((d, di) =>
              di !== dayIndex
                ? d
                : { ...d, activityStops: d.activityStops.filter((_, si) => si !== stopIndex) }
            ),
          }),
          false,
          'removeActivityStop'
        ),
      reorderActivityStops: (dayIndex, fromIndex, toIndex) =>
        set(
          (state) => ({
            curatedDays: state.curatedDays.map((d, di) => {
              if (di !== dayIndex) return d
              const stops = [...d.activityStops]
              const [moved] = stops.splice(fromIndex, 1)
              if (moved) stops.splice(toIndex, 0, moved)
              return { ...d, activityStops: stops }
            }),
          }),
          false,
          'reorderActivityStops'
        ),
      chooseFoodOption: (dayIndex, meal, option) =>
        set(
          (state) => ({
            curatedDays: state.curatedDays.map((d, di) =>
              di !== dayIndex
                ? d
                : {
                    ...d,
                    foodChoices: d.foodChoices.map((fc) =>
                      fc.meal === meal ? { ...fc, chosen: option } : fc
                    ),
                  }
            ),
          }),
          false,
          'chooseFoodOption'
        ),
      skipFoodSlot: (dayIndex, meal) =>
        set(
          (state) => ({
            curatedDays: state.curatedDays.map((d, di) =>
              di !== dayIndex
                ? d
                : {
                    ...d,
                    foodChoices: d.foodChoices.map((fc) =>
                      fc.meal === meal ? { ...fc, chosen: null } : fc
                    ),
                  }
            ),
          }),
          false,
          'skipFoodSlot'
        ),
      reset: () => set(DEFAULT_STATE, false, 'reset'),
    }),
    { name: 'scratch-plan-store' }
  )
)

// ─── Selectors ───────────────────────────────────────────────────────────────

export function selectPlanRequest(state: ScratchPlanState): PlanRequest {
  return {
    starting_point: state.startingPoint,
    destination: state.destination,
    days: state.days,
    preferences: state.preferences,
    travel_mode: state.travelMode,
  }
}

export function selectAllActivityPins(state: ScratchPlanState): ActivityStop[] {
  return state.curatedDays.flatMap((d) => d.activityStops)
}

export function selectChosenFoodPins(state: ScratchPlanState): RestaurantOption[] {
  return state.curatedDays.flatMap((d) =>
    d.foodChoices.filter((fc) => fc.chosen !== null).map((fc) => fc.chosen!)
  )
}

export function selectTotalStops(state: ScratchPlanState): number {
  return state.curatedDays.reduce((acc, d) => acc + d.activityStops.length, 0)
}
