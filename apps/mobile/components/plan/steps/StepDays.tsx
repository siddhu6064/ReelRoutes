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
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

const MIN_DAYS = 1
const MAX_DAYS = 14
const PRESETS  = [3, 5, 7, 10, 14]

interface Props {
  onBack: () => void
  onNext: () => void
}

export default function StepDays({ onBack, onNext }: Props) {
  const days    = useScratchPlanStore((s) => s.days)
  const setDays = useScratchPlanStore((s) => s.setDays)

  const decrement = () => {
    if (days > MIN_DAYS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setDays(days - 1)
    }
  }

  const increment = () => {
    if (days < MAX_DAYS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setDays(days + 1)
    }
  }

  const selectPreset = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setDays(n)
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>How long is your trip?</Text>
      <Text style={styles.subtitle}>
        We'll plan the right number of stops per day.
      </Text>

      {/* Stepper */}
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepBtn, days <= MIN_DAYS && styles.stepBtnDisabled]}
          onPress={decrement}
          disabled={days <= MIN_DAYS}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>

        <View style={styles.stepDisplay}>
          <Text style={styles.stepNum}>{days}</Text>
          <Text style={styles.stepUnit}>{days === 1 ? 'day' : 'days'}</Text>
        </View>

        <TouchableOpacity
          style={[styles.stepBtn, days >= MAX_DAYS && styles.stepBtnDisabled]}
          onPress={increment}
          disabled={days >= MAX_DAYS}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Quick presets */}
      <View style={styles.presets}>
        {PRESETS.map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.presetChip, days === n && styles.presetSelected]}
            onPress={() => selectPreset(n)}
            activeOpacity={0.7}
          >
            <Text style={[styles.presetText, days === n && styles.presetTextSelected]}>
              {n}d
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.hint}>
        ≈ {Math.round(days * 3.5)} stops · {days * 3} meals planned
      </Text>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.8}>
          <Text style={styles.nextText}>Continue →</Text>
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
    gap: Spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.black,
    letterSpacing: -0.5,
    alignSelf: 'flex-start',
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.gray500,
    alignSelf: 'flex-start',
    lineHeight: 22,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxl,
    marginVertical: Spacing.md,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: {
    fontSize: 24,
    color: Colors.gray700,
    lineHeight: 28,
  },
  stepDisplay: { alignItems: 'center', minWidth: 80 },
  stepNum: {
    fontSize: 56,
    fontWeight: FontWeight.black,
    color: Colors.black,
    letterSpacing: -2,
    lineHeight: 60,
  },
  stepUnit: {
    fontSize: FontSize.sm,
    color: Colors.gray500,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  presets: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  presetChip: {
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
    backgroundColor: Colors.white,
  },
  presetSelected: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blue,
  },
  presetText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray700,
  },
  presetTextSelected: { color: Colors.white },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.gray400,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.md,
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
  nextBtn: {
    flex: 2,
    backgroundColor: Colors.blue,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  nextText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})
