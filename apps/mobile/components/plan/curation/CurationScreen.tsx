import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  Alert,
} from 'react-native'
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useNavigation } from '@react-navigation/native'
import {
  useScratchPlanStore,
  selectTotalStops,
} from '@/stores/scratchPlanStore'
import { useConfirmPlan, buildConfirmRequest } from '@/hooks/useConfirmPlan'
import ActivityCardMobile from '@/components/plan/curation/ActivityCardMobile'
import FoodSlotMobile from '@/components/plan/curation/FoodSlotMobile'
import PlaceDetailSheet from '@/components/plan/curation/PlaceDetailSheet'
import PlanMap from '@/components/plan/PlanMap'
import type { ActivityStop, CuratedDay, MealSlot, RestaurantOption } from '@/types/scratchPlan'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../tokens'

export default function CurationScreen() {
  const navigation = useNavigation<any>()

  // Zustand
  const curatedDays      = useScratchPlanStore((s) => s.curatedDays)
  const startingPoint    = useScratchPlanStore((s) => s.startingPoint)
  const destination      = useScratchPlanStore((s) => s.destination)
  const days             = useScratchPlanStore((s) => s.days)
  const travelMode       = useScratchPlanStore((s) => s.travelMode)
  const preferences      = useScratchPlanStore((s) => s.preferences)
  const totalStops       = useScratchPlanStore(selectTotalStops)
  const reset            = useScratchPlanStore((s) => s.reset)
  const removeActivityStop    = useScratchPlanStore((s) => s.removeActivityStop)
  const reorderActivityStops  = useScratchPlanStore((s) => s.reorderActivityStops)
  const chooseFoodOption      = useScratchPlanStore((s) => s.chooseFoodOption)
  const skipFoodSlot          = useScratchPlanStore((s) => s.skipFoodSlot)

  // Bottom sheet state
  const [selectedStop, setSelectedStop] = useState<{
    stop: ActivityStop
    dayIndex: number
    stopIndex: number
  } | null>(null)

  // Confirm mutation
  const { mutate: confirmPlan, isPending } = useConfirmPlan()

  const handleSave = () => {
    if (totalStops === 0) {
      Alert.alert(
        'No stops',
        "You've removed all stops. Add some back or start over.",
        [{ text: 'OK' }]
      )
      return
    }

    const req = buildConfirmRequest({
      startingPoint,
      destination,
      days,
      travelMode,
      preferences,
      curatedDays,
    })

    confirmPlan(req, {
      onSuccess: (res) => {
        reset()
        navigation.replace('TripDetail', { tripId: res.trip_id })
      },
      onError: (err) => {
        Alert.alert(
          'Could not save trip',
          err.message ?? 'Please try again.',
          [{ text: 'OK' }]
        )
      },
    })
  }

  const handleStartOver = () => {
    Alert.alert(
      'Start over?',
      'Your current itinerary will be discarded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start over',
          style: 'destructive',
          onPress: () => {
            reset()
            navigation.goBack()
          },
        },
      ]
    )
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} numberOfLines={1}>{destination}</Text>
          <Text style={styles.headerMeta}>
            {days} day{days !== 1 ? 's' : ''} · {totalStops} stop{totalStops !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.startOverBtn}
          onPress={handleStartOver}
          disabled={isPending}
        >
          <Text style={styles.startOverText}>Start over</Text>
        </TouchableOpacity>
      </View>

      {/* ── Scrollable curation body ───────────────────────────────── */}
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        sections={[
          { title: 'map', data: ['map'] },
          { title: 'hint', data: ['hint'] },
          ...curatedDays.map((d, i) => ({
            title: `Day ${d.day}`,
            dayIndex: i,
            data: ['day'],
          })),
        ]}
        keyExtractor={(item, i) => `${item}-${i}`}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          if (section.title === 'map' || section.title === 'hint') return null
          return (
            <View style={styles.dayHeader}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{section.title}</Text>
              </View>
              <Text style={styles.dayStopCount}>
                {curatedDays[(section as any).dayIndex]?.activityStops.length} stops
              </Text>
            </View>
          )
        }}
        renderItem={({ item, section }) => {
          if (item === 'map') {
            return <PlanMap style={styles.map} />
          }

          if (item === 'hint') {
            return (
              <Text style={styles.hint}>
                Long press a stop to drag and reorder. Tap for full details.
              </Text>
            )
          }

          const dayIndex = (section as any).dayIndex
          const curatedDay = curatedDays[dayIndex]
          if (!curatedDay) return null

          return (
            <DaySectionContent
              key={`day-${curatedDay.day}`}
              dayIndex={dayIndex}
              curatedDay={curatedDay}
              onReorder={(from, to) => reorderActivityStops(dayIndex, from, to)}
              onRemove={(stopIndex) => removeActivityStop(dayIndex, stopIndex)}
              onPressStop={(stop, stopIndex) =>
                setSelectedStop({ stop, dayIndex, stopIndex })
              }
              onChooseFood={(meal, option) => chooseFoodOption(dayIndex, meal, option)}
              onSkipFood={(meal) => skipFoodSlot(dayIndex, meal)}
            />
          )
        }}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />

      {/* ── Floating save button ───────────────────────────────────── */}
      <View style={styles.saveFab}>
        <TouchableOpacity
          style={[styles.saveBtn, (isPending || totalStops === 0) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isPending || totalStops === 0}
          activeOpacity={0.85}
        >
          {isPending ? (
            <ActivityIndicator color={Colors.white} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>💾  Save trip</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Detail bottom sheet ────────────────────────────────────── */}
      <PlaceDetailSheet
        stop={selectedStop?.stop ?? null}
        onClose={() => setSelectedStop(null)}
        onRemove={() => {
          if (selectedStop) {
            removeActivityStop(selectedStop.dayIndex, selectedStop.stopIndex)
            setSelectedStop(null)
          }
        }}
      />
    </GestureHandlerRootView>
  )
}

// ─── Per-day draggable section ────────────────────────────────────────────────

interface DaySectionProps {
  dayIndex: number
  curatedDay: CuratedDay
  onReorder: (from: number, to: number) => void
  onRemove: (stopIndex: number) => void
  onPressStop: (stop: ActivityStop, stopIndex: number) => void
  onChooseFood: (meal: MealSlot, option: RestaurantOption) => void
  onSkipFood: (meal: MealSlot) => void
}

function DaySectionContent({
  dayIndex,
  curatedDay,
  onReorder,
  onRemove,
  onPressStop,
  onChooseFood,
  onSkipFood,
}: DaySectionProps) {
  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<ActivityStop>) => {
      const index = getIndex() ?? 0
      return (
        <ScaleDecorator>
          <ActivityCardMobile
            stop={item}
            index={index}
            onRemove={() => onRemove(index)}
            onPress={() => onPressStop(item, index)}
            drag={drag}
            isActive={isActive}
          />
        </ScaleDecorator>
      )
    },
    [onRemove, onPressStop]
  )

  return (
    <View style={styles.daySection}>
      {curatedDay.activityStops.length === 0 && (
        <Text style={styles.emptyDay}>All stops removed.</Text>
      )}

      <DraggableFlatList
        data={curatedDay.activityStops}
        keyExtractor={(item) => item.place_id ?? item.name}
        renderItem={renderItem}
        onDragEnd={({ from, to }) => onReorder(from, to)}
        scrollEnabled={false}
        activationDistance={10}
      />

      {/* Food slots */}
      {curatedDay.foodSlots.map((slot) => {
        const choice = curatedDay.foodChoices.find((fc) => fc.meal === slot.meal)
        return (
          <FoodSlotMobile
            key={slot.meal}
            slot={slot}
            choice={choice}
            dayIndex={dayIndex}
            onChoose={onChooseFood}
            onSkip={onSkipFood}
          />
        )
      })}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray200,
  },
  headerLeft: { flex: 1, gap: 2 },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.black,
    color: Colors.black,
    letterSpacing: -0.3,
  },
  headerMeta: { fontSize: FontSize.sm, color: Colors.gray500 },
  startOverBtn: {
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  startOverText: {
    fontSize: FontSize.sm,
    color: Colors.gray700,
    fontWeight: FontWeight.medium,
  },
  list: { flex: 1 },
  listContent: { padding: Spacing.lg, gap: Spacing.lg },
  map: { marginBottom: Spacing.sm },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.gray400,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dayBadge: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  dayBadgeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  dayStopCount: { fontSize: FontSize.sm, color: Colors.gray500 },
  daySection: { gap: Spacing.sm },
  emptyDay: {
    fontSize: FontSize.sm,
    color: Colors.gray400,
    textAlign: 'center',
    padding: Spacing.lg,
  },
  saveFab: {
    position: 'absolute',
    bottom: 32,
    left: Spacing.xl,
    right: Spacing.xl,
  },
  saveBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: Colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  saveBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  saveBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})
