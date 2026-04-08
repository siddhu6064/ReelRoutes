import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useScratchPlanStore, selectPlanRequest } from '@/stores/scratchPlanStore'
import { usePlanTrip } from '@/hooks/usePlanTrip'
import StepOrigin      from '@/components/plan/steps/StepOrigin'
import StepDays        from '@/components/plan/steps/StepDays'
import StepPreferences from '@/components/plan/steps/StepPreferences'
import StepLoading     from '@/components/plan/steps/StepLoading'
import CurationScreen  from '@/components/plan/curation/CurationScreen'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'
import type { WizardStep } from '@/types/scratchPlan'

const STEPS: WizardStep[] = ['origin', 'days', 'preferences', 'loading']
const STEP_LABELS = ['Where', 'When', 'Vibe', 'Planning']

/**
 * PlanWizardScreen
 * ----------------
 * Root screen for the "Plan from Scratch" flow.
 * Registers in your Expo navigator as a stack screen:
 *
 *   <Stack.Screen name="PlanWizard" component={PlanWizardScreen} />
 *
 * After planning completes, transitions to CurationScreen (inline,
 * not a stack push, so the back button is suppressed during curation).
 */
export default function PlanWizardScreen() {
  const router = useRouter()
  const step       = useScratchPlanStore((s) => s.step)
  const setStep    = useScratchPlanStore((s) => s.setStep)
  const setDraft   = useScratchPlanStore((s) => s.setDraft)
  const reset      = useScratchPlanStore((s) => s.reset)

  const planRequest = useScratchPlanStore(selectPlanRequest)
  const { mutate: planTrip, error: planError } = usePlanTrip()

  const handleGenerate = useCallback(() => {
    setStep('loading')
    planTrip(planRequest, {
      onSuccess: (draft) => setDraft(draft),
      onError:   ()      => setStep('preferences'),
    })
  }, [planRequest, planTrip, setStep, setDraft])

  const handleClose = () => {
    reset()
    router.back()
  }

  // Curation takes over the whole screen
  if (step === 'curation') return <CurationScreen />

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <SafeAreaView style={styles.safe}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <TouchableOpacity
          style={styles.navClose}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.navCloseText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Plan from scratch</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress dots */}
      <View style={styles.progress}>
        {STEPS.filter((s) => s !== 'loading').map((s, i) => (
          <View key={s} style={styles.progressItem}>
            <View
              style={[
                styles.dot,
                i <= currentStepIndex && step !== 'loading' && styles.dotActive,
                i < currentStepIndex && styles.dotDone,
              ]}
            >
              {i < currentStepIndex ? (
                <Text style={styles.dotCheck}>✓</Text>
              ) : (
                <Text style={[styles.dotNum, i <= currentStepIndex && styles.dotNumActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.dotLabel, i <= currentStepIndex && styles.dotLabelActive]}>
              {STEP_LABELS[i]}
            </Text>
          </View>
        ))}
      </View>

      {/* Step content */}
      <View style={styles.content}>
        {step === 'origin' && (
          <StepOrigin onNext={() => setStep('days')} />
        )}
        {step === 'days' && (
          <StepDays
            onBack={() => setStep('origin')}
            onNext={() => setStep('preferences')}
          />
        )}
        {step === 'preferences' && (
          <StepPreferences
            onBack={() => setStep('days')}
            onGenerate={handleGenerate}
            {...(planError?.message !== undefined && { error: planError.message })}
          />
        )}
        {step === 'loading' && <StepLoading />}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray200,
  },
  navClose: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCloseText: { fontSize: FontSize.md, color: Colors.gray500 },
  navTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.black,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.gray100,
  },
  progressItem: { alignItems: 'center', gap: Spacing.xs },
  dot: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
  dotDone: { borderColor: Colors.green, backgroundColor: Colors.green },
  dotNum: { fontSize: FontSize.sm, color: Colors.gray400, fontWeight: FontWeight.bold },
  dotNumActive: { color: Colors.blue },
  dotCheck: { fontSize: FontSize.sm, color: Colors.white, fontWeight: FontWeight.bold },
  dotLabel: { fontSize: FontSize.xs, color: Colors.gray400, fontWeight: FontWeight.medium },
  dotLabelActive: { color: Colors.blue },
  content: { flex: 1 },
})
