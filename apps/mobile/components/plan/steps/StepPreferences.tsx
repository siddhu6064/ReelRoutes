import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { useScratchPlanStore } from '@/stores/scratchPlanStore'
import type { TripPreference } from '@/types/scratchPlan'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

const PREFERENCES: Array<{
  value: TripPreference
  label: string
  emoji: string
  desc: string
}> = [
  { value: 'food',       label: 'Food & Drink', emoji: '🍜', desc: 'Local cuisine & restaurants' },
  { value: 'history',   label: 'History',       emoji: '🏛',  desc: 'Museums & heritage sites' },
  { value: 'nature',    label: 'Nature',        emoji: '🌿', desc: 'Parks, hikes & scenic spots' },
  { value: 'art',       label: 'Art & Culture', emoji: '🎨', desc: 'Galleries & live music' },
  { value: 'adventure', label: 'Adventure',     emoji: '🧗', desc: 'Outdoor activities' },
  { value: 'shopping',  label: 'Shopping',      emoji: '🛍',  desc: 'Markets & boutiques' },
  { value: 'nightlife', label: 'Nightlife',     emoji: '🌙', desc: 'Bars & evening entertainment' },
]

interface Props {
  onBack: () => void
  onGenerate: () => void
  error?: string
}

export default function StepPreferences({ onBack, onGenerate, error }: Props) {
  const preferences      = useScratchPlanStore((s) => s.preferences)
  const togglePreference = useScratchPlanStore((s) => s.togglePreference)
  const destination      = useScratchPlanStore((s) => s.destination)

  const toggle = (p: TripPreference) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    togglePreference(p)
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>What's your vibe?</Text>
      <Text style={styles.subtitle}>
        Choose what matters in{' '}
        <Text style={styles.destHighlight}>{destination || 'your destination'}</Text>.
        {'\n'}Skip to get a balanced mix.
      </Text>

      {/* 2-column chip grid */}
      <View style={styles.grid}>
        {PREFERENCES.map((pref) => {
          const selected = preferences.includes(pref.value)
          return (
            <TouchableOpacity
              key={pref.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggle(pref.value)}
              activeOpacity={0.75}
            >
              <Text style={styles.chipEmoji}>{pref.emoji}</Text>
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {pref.label}
              </Text>
              <Text style={styles.chipDesc}>{pref.desc}</Text>
              {selected && (
                <View style={styles.checkBadge}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {preferences.length > 0 && (
        <Text style={styles.count}>
          {preferences.length} interest{preferences.length !== 1 ? 's' : ''} selected
        </Text>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <Text style={styles.errorHint}>Check your connection and try again.</Text>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.generateBtn} onPress={onGenerate} activeOpacity={0.8}>
          <Text style={styles.generateText}>✨  Plan my trip</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    gap: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.black,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.gray500,
    lineHeight: 22,
  },
  destHighlight: { color: Colors.blue, fontWeight: FontWeight.semibold },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  chip: {
    width: '47%',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    gap: Spacing.xs,
  },
  chipSelected: {
    borderColor: Colors.blue,
    backgroundColor: Colors.blueSoft,
  },
  chipEmoji: { fontSize: 22 },
  chipLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.black,
  },
  chipLabelSelected: { color: Colors.blue },
  chipDesc: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    lineHeight: 15,
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: FontWeight.bold,
  },
  count: {
    fontSize: FontSize.sm,
    color: Colors.blue,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: '#B91C1C',
    fontWeight: FontWeight.medium,
  },
  errorHint: { fontSize: FontSize.xs, color: '#DC2626' },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  backBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  backText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.gray700,
  },
  generateBtn: {
    flex: 2,
    backgroundColor: Colors.blue,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  generateText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})
