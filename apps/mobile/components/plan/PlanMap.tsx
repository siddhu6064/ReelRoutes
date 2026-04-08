import React, { useEffect, useRef } from 'react'
import { StyleSheet, View, Text } from 'react-native'
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps'
import {
  useScratchPlanStore,
  selectAllActivityPins,
  selectChosenFoodPins,
} from '@/stores/scratchPlanStore'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

interface Props {
  style?: object
}

/**
 * PlanMap
 * -------
 * Renders a Google Map with two marker types:
 *   Blue numbered markers  → activity stops (in day order)
 *   Orange markers         → chosen food stops
 *
 * Fits bounds to all visible pins whenever the pin list changes.
 * Tapping a marker shows a callout with the stop name.
 */
export default function PlanMap({ style }: Props) {
  const mapRef        = useRef<MapView>(null)
  const activityPins  = useScratchPlanStore(selectAllActivityPins)
  const foodPins      = useScratchPlanStore(selectChosenFoodPins)
  const destination   = useScratchPlanStore((s) => s.destination)

  const allPins = [
    ...activityPins.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...foodPins.map((p)    => ({ lat: p.lat, lng: p.lng })),
  ]

  // Fit map to all visible pins whenever they change
  useEffect(() => {
    if (!mapRef.current || allPins.length === 0) return

    mapRef.current.fitToCoordinates(
      allPins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      }
    )
  }, [activityPins.length, foodPins.length])

  return (
    <View style={[styles.wrapper, style]}>
      {/* Legend */}
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: Colors.blue }]} />
        <Text style={styles.legendLabel}>Activities</Text>
        <View style={[styles.legendDot, { backgroundColor: Colors.orange }]} />
        <Text style={styles.legendLabel}>Meals</Text>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: 30,
          longitude: -90,
          latitudeDelta: 5,
          longitudeDelta: 5,
        }}
        showsUserLocation={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        toolbarEnabled={false}
      >
        {/* Activity markers */}
        {activityPins.map((pin, i) => (
          <Marker
            key={pin.place_id ?? `activity-${i}`}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.name}
          >
            {/* Custom numbered pin */}
            <View style={styles.activityPin}>
              <Text style={styles.activityPinNum}>{i + 1}</Text>
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{pin.name}</Text>
                {pin.famous_for ? (
                  <Text style={styles.calloutSub} numberOfLines={1}>
                    {pin.famous_for}
                  </Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Food markers */}
        {foodPins.map((pin, i) => (
          <Marker
            key={pin.place_id ?? `food-${i}`}
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            title={pin.name}
          >
            <View style={styles.foodPin}>
              <Text style={styles.foodPinEmoji}>🍽</Text>
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutName}>{pin.name}</Text>
                {pin.known_for ? (
                  <Text style={styles.calloutSub} numberOfLines={1}>
                    {pin.known_for}
                  </Text>
                ) : null}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray100,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },
  legendLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray700,
    marginRight: Spacing.sm,
  },
  map: { height: 260 },
  activityPin: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.blue,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  activityPinNum: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  foodPin: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.orange,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  foodPinEmoji: { fontSize: 14 },
  callout: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    maxWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  calloutName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.black,
  },
  calloutSub: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    marginTop: 2,
  },
})
