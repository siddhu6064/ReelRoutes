// ─── Enums ──────────────────────────────────────────────────────────────────

export type TravelMode = "driving" | "walking" | "transit" | "cycling";
export type TripPreference =
  | "food"
  | "history"
  | "nature"
  | "art"
  | "adventure"
  | "shopping"
  | "nightlife";
export type MealSlot = "breakfast" | "lunch" | "dinner";

// ─── Plan request ────────────────────────────────────────────────────────────

export interface PlanRequest {
  starting_point: string;
  destination: string;
  days: number;
  preferences: TripPreference[];
  travel_mode: TravelMode;
}

// ─── Draft itinerary (returned by POST /trips/plan) ─────────────────────────

export interface ActivityStop {
  type: "activity";
  name: string;
  address?: string;
  lat: number;
  lng: number;
  place_id?: string;
  famous_for: string;
  best_time?: string;
  local_tip?: string;
  photo_url?: string;
  distance_from_prev_km?: number;
  opening_hours?: string;
  website?: string;
  phone?: string;
  rating?: number;
  price_level?: number;
}

export interface RestaurantOption {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  place_id?: string;
  known_for?: string;
  photo_url?: string;
  rating?: number;
  price_level?: number;
}

export interface FoodStop {
  type: "food";
  meal: MealSlot;
  options: RestaurantOption[];
}

export type Stop = ActivityStop | FoodStop;

export interface DayPlan {
  day: number;
  stops: Stop[];
}

export interface DraftItinerary {
  draft: true;
  starting_point: string;
  destination: string;
  days: number;
  travel_mode: TravelMode;
  days_plan: DayPlan[];
}

// ─── Confirm request (POST /trips/plan/confirm) ──────────────────────────────

export interface ConfirmActivityStop {
  name: string;
  lat: number;
  lng: number;
  place_id?: string | undefined;
  address?: string | undefined;
  famous_for?: string | undefined;
  best_time?: string | undefined;
  local_tip?: string | undefined;
  photo_url?: string | undefined;
}

export interface ConfirmFoodStop {
  name: string;
  lat: number;
  lng: number;
  place_id?: string | undefined;
  address?: string | undefined;
  known_for?: string | undefined;
  meal: MealSlot;
}

export interface ConfirmDayPlan {
  day: number;
  activity_stops: ConfirmActivityStop[];
  food_stops: ConfirmFoodStop[];
}

export interface PlanConfirmRequest {
  starting_point: string;
  destination: string;
  days: number;
  travel_mode: TravelMode;
  preferences: TripPreference[];
  days_plan: ConfirmDayPlan[];
}

export interface PlanConfirmResponse {
  trip_id: string;
  message: string;
  pin_count: number;
  day_count: number;
}

// ─── Wizard state ────────────────────────────────────────────────────────────

export type WizardStep = "origin" | "days" | "preferences" | "loading" | "curation";

// ─── Curated state (what user edits during curation) ────────────────────────

export interface CuratedFoodChoice {
  meal: MealSlot;
  /** null means the user skipped this meal slot */
  chosen: RestaurantOption | null;
}

export interface CuratedDay {
  day: number;
  /** Ordered activity stops after user removes/reorders */
  activityStops: ActivityStop[];
  /** One chosen restaurant per meal slot (or skipped) */
  foodChoices: CuratedFoodChoice[];
  /** Original food options for each slot (for switching) */
  foodSlots: FoodStop[];
}
