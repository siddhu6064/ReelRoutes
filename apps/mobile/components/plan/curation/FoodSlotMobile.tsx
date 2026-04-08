import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import type {
  CuratedFoodChoice,
  FoodStop,
  MealSlot,
  RestaurantOption,
} from '@/types/scratchPlan'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

interface Props {
  slot: FoodStop
  choice: CuratedFoodChoice | undefined
  dayIndex: number
  onChoose: (meal: MealSlot, option: RestaurantOption) => void
  onSkip: (meal: MealSlot) => void
}

const MEAL_META: Record<MealSlot, { icon: string; label: string }> = {
  breakfast: { icon: '☕', label: 'Breakfast' },
  lunch:     { icon: '🥗', label: 'Lunch' },
  dinner:    { icon: '🌆', label: 'Dinner' },
}

export default function FoodSlotMobile({
  slot, choice, onChoose, onSkip,
}: Props) {
  const { icon, label } = MEAL_META[slot.meal]
  const isSkipped  = choice?.chosen === null
  const hasOptions = slot.options.length > 0

  const handleChoose = (option: RestaurantOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onChoose(slot.meal, option)
  }

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSkip(slot.meal)
  }

  return (
    <View style={[styles.slot, isSkipped && styles.slotSkipped]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.label}>{label}</Text>

        {choice?.chosen && !isSkipped ? (
          <View style={styles.chosenBadge}>
            <Text style={styles.chosenText}>✓ Chosen</Text>
          </View>
        ) : isSkipped ? (
          <View style={styles.skippedBadge}>
            <Text style={styles.skippedText}>Skipped</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>{isSkipped ? 'Undo' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal restaurant scroll */}
      {!isSkipped && hasOptions && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.optionsRow}
          keyboardShouldPersistTaps="handled"
        >
          {slot.options.map((option, i) => {
            const selected = choice?.chosen?.place_id === option.place_id
            return (
              <RestaurantCardMini
                key={option.place_id ?? `${slot.meal}-${i}`}
                option={option}
                selected={selected}
                onSelect={() => handleChoose(option)}
              />
            )
          })}
        </ScrollView>
      )}

      {!isSkipped && !hasOptions && (
        <Text style={styles.emptyNote}>No restaurants found nearby.</Text>
      )}
    </View>
  )
}

// ─── Inline mini restaurant card ─────────────────────────────────────────────

function RestaurantCardMini({
  option,
  selected,
  onSelect,
}: {
  option: RestaurantOption
  selected: boolean
  onSelect: () => void
}) {
  const priceLabel = option.price_level != null
    ? ['Free', '$', '$$', '$$$', '$$$$'][option.price_level] ?? ''
    : null

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      {selected && (
        <View style={styles.cardCheck}>
          <Text style={styles.cardCheckText}>✓</Text>
        </View>
      )}

      {option.photo_url ? (
        <Image
          source={{ uri: option.photo_url }}
          style={styles.cardPhoto}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.cardPhotoPlaceholder}>
          <Text style={{ fontSize: 24 }}>🍽</Text>
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{option.name}</Text>
        {option.known_for ? (
          <Text style={styles.cardKnown} numberOfLines={2}>{option.known_for}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          {option.rating != null && (
            <Text style={styles.cardMetaText}>★ {option.rating.toFixed(1)}</Text>
          )}
          {priceLabel && (
            <Text style={styles.cardMetaText}>{priceLabel}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const CARD_W = 160

const styles = StyleSheet.create({
  slot: {
    borderWidth: 1.5,
    borderColor: Colors.amberBorder,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.amberSoft,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  slotSkipped: { opacity: 0.5 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: { fontSize: 18 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.gray700,
    flex: 1,
  },
  chosenBadge: {
    backgroundColor: Colors.greenSoft,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  chosenText: {
    fontSize: FontSize.xs,
    color: '#065F46',
    fontWeight: FontWeight.semibold,
  },
  skippedBadge: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  skippedText: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    fontWeight: FontWeight.medium,
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.white,
  },
  skipText: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    fontWeight: FontWeight.medium,
  },
  optionsRow: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  emptyNote: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  // Mini card
  card: {
    width: CARD_W,
    borderWidth: 2,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    overflow: 'hidden',
    position: 'relative',
  },
  cardSelected: {
    borderColor: Colors.blue,
    shadowColor: Colors.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardCheck: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 2,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCheckText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
  cardPhoto: { width: CARD_W, height: 90 },
  cardPhotoPlaceholder: {
    width: CARD_W,
    height: 90,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing.sm,
    gap: 3,
  },
  cardName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.black,
    lineHeight: 18,
  },
  cardKnown: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    lineHeight: 16,
  },
  cardMeta: { flexDirection: 'row', gap: Spacing.sm, marginTop: 2 },
  cardMetaText: {
    fontSize: FontSize.xs,
    color: Colors.gray700,
    fontWeight: FontWeight.medium,
  },
})
