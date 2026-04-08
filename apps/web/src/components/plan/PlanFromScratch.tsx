import React, { useCallback } from 'react'

import { usePlanTrip } from '../../hooks/usePlanTrip'
import { selectPlanRequest, useScratchPlanStore } from '../../stores/scratchPlanStore'

import CurationScreen from './curation/CurationScreen'
import StepDays from './steps/StepDays'
import StepLoading from './steps/StepLoading'
import StepOrigin from './steps/StepOrigin'
import StepPreferences from './steps/StepPreferences'

export default function PlanFromScratch(): React.ReactElement {
  const step = useScratchPlanStore((s) => s.step)
  const setStep = useScratchPlanStore((s) => s.setStep)
  const setDraft = useScratchPlanStore((s) => s.setDraft)
  const planRequest = useScratchPlanStore(selectPlanRequest)
  const { mutate: planTrip, error } = usePlanTrip()

  const handleGenerate = useCallback(() => {
    setStep('loading')
    planTrip(planRequest, {
      onSuccess: (draft) => setDraft(draft),
      onError: () => setStep('preferences'),
    })
  }, [planRequest, planTrip, setStep, setDraft])

  if (step === 'curation') return <CurationScreen />

  return (
    <div className="plan-wizard">
      <WizardProgress step={step} />
      {step === 'origin' && <StepOrigin onNext={() => setStep('days')} />}
      {step === 'days' && <StepDays onBack={() => setStep('origin')} onNext={() => setStep('preferences')} />}
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

const STEPS = [
  { key: 'origin', label: 'Where' },
  { key: 'days', label: 'When' },
  { key: 'preferences', label: 'Vibe' },
  { key: 'loading', label: 'Planning' },
]

function WizardProgress({ step }: { step: string }): React.ReactElement {
  const currentIndex = STEPS.findIndex((s) => s.key === step)
  return (
    <div className="wizard-progress">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className={['wizard-step-dot', i <= currentIndex ? 'active' : '', i < currentIndex ? 'complete' : ''].filter(Boolean).join(' ')}>
            <span className="wizard-step-num">{i < currentIndex ? '✓' : i + 1}</span>
            <span className="wizard-step-label">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`wizard-connector ${i < currentIndex ? 'active' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  )
}
