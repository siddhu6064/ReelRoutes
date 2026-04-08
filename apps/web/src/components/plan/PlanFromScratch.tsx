import React, { useCallback } from 'react'

import { usePlanTrip } from '../../hooks/usePlanTrip'
import { selectPlanRequest, useScratchPlanStore } from '../../stores/scratchPlanStore'
import CurationScreen from './curation/CurationScreen'
import StepDays from './steps/StepDays'
import StepLoading from './steps/StepLoading'
import StepOrigin from './steps/StepOrigin'
import StepPreferences from './steps/StepPreferences'

/**
 * PlanFromScratch
 * ---------------
 * Top-level wizard container. Manages step transitions and wires the
 * TanStack Query mutation into the Zustand store.
 *
 * Step flow:
 *   origin → days → preferences → loading → curation
 *
 * Rendered inside the existing NewTrip screen as the second creation path.
 */
export default function PlanFromScratch() {
  const step = useScratchPlanStore((s) => s.step)
  const setStep = useScratchPlanStore((s) => s.setStep)
  const setDraft = useScratchPlanStore((s) => s.setDraft)
  
  const planRequest = useScratchPlanStore(selectPlanRequest)
  const { mutate: planTrip, error } = usePlanTrip()

  const handleGenerate = useCallback(() => {
    setStep('loading')
    planTrip(planRequest, {
      onSuccess: (draft) => setDraft(draft),
      onError: () => setStep('preferences'), // return to last step on error
    })
  }, [planRequest, planTrip, setStep, setDraft])

  if (step === 'curation') return <CurationScreen />

  return (
    <div className="plan-wizard">
      {/* Step progress indicator */}
      <WizardProgress step={step} />

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
          error={error?.message}
        />
      )}
      {step === 'loading' && <StepLoading />}
    </div>
  )
}

// ─── Step progress bar ───────────────────────────────────────────────────────

const STEPS: Array<{ key: string; label: string }> = [
  { key: 'origin', label: 'Where' },
  { key: 'days', label: 'When' },
  { key: 'preferences', label: 'Vibe' },
  { key: 'loading', label: 'Planning' },
]

function WizardProgress({ step }: { step: string }) {
  const currentIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="wizard-progress">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div
            className={[
              'wizard-step-dot',
              i <= currentIndex ? 'active' : '',
              i < currentIndex ? 'complete' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="wizard-step-num">
              {i < currentIndex ? '✓' : i + 1}
            </span>
            <span className="wizard-step-label">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`wizard-connector ${i < currentIndex ? 'active' : ''}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
