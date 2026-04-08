"""
Manual Integration Guide — Plan from Scratch Feature
=====================================================
This file covers all 10 manual integration tasks (Phase 9).
Each section has the exact code to paste into your existing files.
"""

# ═══════════════════════════════════════════════════════════════════════════
# m1 — Register plan router in FastAPI main.py
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/api/main.py  (or wherever you call app.include_router)
#
# ADD after your existing router registrations:
#
#   from apps.api.routers.plan import router as plan_router
#   app.include_router(plan_router)
#
# The plan router is prefixed at /trips, so new endpoints are:
#   POST /trips/plan
#   POST /trips/plan/confirm


# ═══════════════════════════════════════════════════════════════════════════
# m2 — Add ScratchTripMixin fields to TripDocument
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/api/models/trip.py
#
# PASTE these fields into your existing TripDocument class:
"""
from typing import List, Optional
from beanie import Document

class TripDocument(Document):
    # ── existing fields ───────────────────────────────────────────────
    # title: str
    # pins: List[PinDocument]
    # ... etc

    # ── ADD: Plan from Scratch fields ─────────────────────────────────
    source: str = "video"               # "video" | "scratch"
    starting_point: Optional[str] = None
    destination: Optional[str] = None
    days: Optional[int] = None
    travel_mode: Optional[str] = None
    preferences: List[str] = []

    class Settings:
        name = "trips"                  # keep existing collection name
"""


# ═══════════════════════════════════════════════════════════════════════════
# m3 — Add ScratchPinMixin fields to PinDocument
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/api/models/pin.py  (or wherever PinDocument is defined)
#
# PASTE these fields into your existing PinDocument class:
"""
from typing import Optional
from pydantic import BaseModel

class PinDocument(BaseModel):
    # ── existing fields ───────────────────────────────────────────────
    # name: str
    # lat: float
    # lng: float
    # ... etc

    # ── ADD: Plan from Scratch fields ─────────────────────────────────
    pin_type: str = "activity"          # "activity" | "food"
    meal: Optional[str] = None          # "breakfast" | "lunch" | "dinner"
    famous_for: Optional[str] = None
    best_time: Optional[str] = None
    local_tip: Optional[str] = None
    opening_hours: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    rating: Optional[float] = None
    price_level: Optional[int] = None
    day: Optional[int] = None           # 1-indexed day number
    order: int = 0                      # global stop order
"""


# ═══════════════════════════════════════════════════════════════════════════
# m4 — Add Google Maps script tag to web index.html
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/web/index.html
#
# PASTE before </head>:
"""
<script
  src="https://maps.googleapis.com/maps/api/js?key=%VITE_GOOGLE_MAPS_API_KEY%&libraries=places"
  async
  defer
></script>
"""
# Note: %VITE_GOOGLE_MAPS_API_KEY% is replaced at build time by Vite.
# Add VITE_GOOGLE_MAPS_API_KEY=your_key to apps/web/.env


# ═══════════════════════════════════════════════════════════════════════════
# m5 — Import planStyles.css into the web app
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/web/src/main.tsx  (or your app entry point)
#
# ADD:
"""
import './components/plan/planStyles.css'
"""
# Or import it directly in NewTripScreen.tsx:
"""
import '../components/plan/planStyles.css'
"""


# ═══════════════════════════════════════════════════════════════════════════
# m6 — Register PlanWizardScreen in Expo navigator
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/mobile/src/navigation/AppNavigator.tsx
#     (or wherever your Stack.Navigator is defined)
#
# ADD the import:
"""
import PlanWizardScreen from '../screens/plan/PlanWizardScreen'
"""
#
# ADD inside your Stack.Navigator:
"""
<Stack.Screen
  name="PlanWizard"
  component={PlanWizardScreen}
  options={{ headerShown: false }}
/>
"""


# ═══════════════════════════════════════════════════════════════════════════
# m7 — Add "Plan from scratch" entry point on home/trips screen
# ═══════════════════════════════════════════════════════════════════════════
#
# In: your existing HomeScreen or TripsScreen (wherever "New Trip" appears)
#
# ADD a button that navigates to the wizard:
"""
import { useNavigation } from '@react-navigation/native'

const navigation = useNavigation()

// Render somewhere on the screen:
<TouchableOpacity
  onPress={() => navigation.navigate('PlanWizard')}
  style={styles.planButton}
>
  <Text style={styles.planButtonText}>✨ Plan from scratch</Text>
</TouchableOpacity>
"""
# On web: NewTripScreen.tsx is already the combined entry point.
# On mobile: This navigates to PlanWizardScreen.


# ═══════════════════════════════════════════════════════════════════════════
# m8 — Wrap root navigator in GestureHandlerRootView
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/mobile/App.tsx  (or your root component)
#
# BEFORE (if not already wrapped):
"""
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>...</Stack.Navigator>
    </NavigationContainer>
  )
}
"""
#
# AFTER:
"""
import { GestureHandlerRootView } from 'react-native-gesture-handler'

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator>...</Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}
"""
# Required by @gorhom/bottom-sheet and react-native-draggable-flatlist.
# If already wrapped (common in Expo setups), skip this step.


# ═══════════════════════════════════════════════════════════════════════════
# m9 — Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in mobile .env
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/mobile/.env  (create if it doesn't exist, gitignored)
#
"""
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
"""
# The same Google Maps Platform key used by the backend works here.
# Required APIs: Maps SDK for Android, Maps SDK for iOS, Places API.
# Enable "Maps SDK for Android" and "Maps SDK for iOS" in Google Cloud Console
# if not already enabled (the backend only needs the web/server APIs).


# ═══════════════════════════════════════════════════════════════════════════
# m10 — Set VITE_API_URL in web .env
# ═══════════════════════════════════════════════════════════════════════════
#
# In: apps/web/.env  (create if it doesn't exist, gitignored)
#
"""
VITE_API_URL=http://localhost:8000
"""
# For production, set this to your deployed FastAPI base URL:
"""
VITE_API_URL=https://api.reelroutes.com
"""
