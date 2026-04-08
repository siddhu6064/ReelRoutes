import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Pressable,
} from 'react-native'
import type { ActivityStop } from '@/types/scratchPlan'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

interface Props {
  stop: ActivityStop
  index: number
  onRemove: () => void
  onPress: () => void   // opens detail bottom sheet
  /** Passed from DraggableFlatList drag() call */
  drag?: () => void
  isActive?: boolean
}

export default function ActivityCardMobile({
  stop,
  index,
  onRemove,
  onPress,
  drag,
  isActive,
}: Props) {
  const priceLabel = stop.price_level != null
    ? ['Free', '$', '$$', '$$$', '$$$$'][stop.price_level] ?? ''
    : null

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, isActive && styles.cardDragging]}
    >
      {/* Drag handle — long press activates drag */}
      <TouchableOpacity
        onLongPress={drag}
        delayLongPress={150}
        style={styles.dragHandle}
        activeOpacity={0.6}
      >
        <DragIcon />
      </TouchableOpacity>

      {/* Photo */}
      {stop.photo_url ? (
        <Image
          source={{ uri: stop.photo_url }}
          style={styles.photo}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.photoEmoji}>📍</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{stop.name}</Text>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeX}>×</Text>
          </TouchableOpacity>
        </View>

        {stop.famous_for ? (
          <View style={styles.famousBadge}>
            <Text style={styles.famousText} numberOfLines={1}>
              ⭐ {stop.famous_for}
            </Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          {stop.best_time ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>🕐 {stop.best_time}</Text>
            </View>
          ) : null}
          {stop.rating != null ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>★ {stop.rating.toFixed(1)}</Text>
            </View>
          ) : null}
          {priceLabel ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>{priceLabel}</Text>
            </View>
          ) : null}
          {stop.distance_from_prev_km != null && index > 0 ? (
            <View style={[styles.metaChip, styles.distChip]}>
              <Text style={[styles.metaText, styles.distText]}>
                📏 {stop.distance_from_prev_km} km
              </Text>
            </View>
          ) : null}
        </View>

        {stop.local_tip ? (
          <Text style={styles.tip} numberOfLines={2}>
            💡 {stop.local_tip}
          </Text>
        ) : null}

        <Text style={styles.tapHint}>Tap for details →</Text>
      </View>
    </Pressable>
  )
}

function DragIcon() {
  return (
    <View style={styles.dragDots}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.dotRow}>
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  cardDragging: {
    borderColor: Colors.blue,
    shadowColor: Colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    opacity: 0.95,
  },
  dragHandle: {
    paddingTop: 2,
    paddingRight: 2,
    justifyContent: 'center',
  },
  dragDots: { gap: 4 },
  dotRow: { flexDirection: 'row', gap: 4 },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray300 ?? Colors.gray200,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    flexShrink: 0,
  },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  photoEmoji: { fontSize: 24 },
  content: { flex: 1, gap: Spacing.xs },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.black,
    flex: 1,
    lineHeight: 20,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  removeX: { fontSize: 16, color: Colors.gray400, lineHeight: 18 },
  famousBadge: {
    backgroundColor: Colors.famousBg,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  famousText: {
    fontSize: FontSize.xs,
    color: Colors.famousText,
    fontWeight: FontWeight.medium,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  metaChip: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  metaText: { fontSize: FontSize.xs, color: Colors.gray700 },
  distChip: { backgroundColor: Colors.blueSoft },
  distText: { color: Colors.blue },
  tip: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    lineHeight: 17,
  },
  tapHint: {
    fontSize: FontSize.xs,
    color: Colors.blue,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
})
