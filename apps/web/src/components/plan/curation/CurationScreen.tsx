import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useScratchPlanStore,
  selectTotalStops,
} from '../../../stores/scratchPlanStore'
import { useConfirmPlan, buildConfirmRequest } from '../../../hooks/useConfirmPlan'
import DayAccordion from './DayAccordion'
import CurationMap from './CurationMap'

/**
 * CurationScreen
 * ---------------
 * The main curation interface shown after the AI returns a draft itinerary.
 *
 * Layout (desktop):
 *   Left panel (60%)  — day accordion with activity cards + food slots
 *   Right panel (40%) — live map
 *
 * Layout (mobile):
 *   Single column — accordion above, map below
 */
export default function CurationScreen() {
  const navigate = useNavigate()

  // Zustand state
  const curatedDays   = useScratchPlanStore((s) => s.curatedDays)
  const startingPoint = useScratchPlanStore((s) => s.startingPoint)
  const destination   = useScratchPlanStore((s) => s.destination)
  const days          = useScratchPlanStore((s) => s.days)
  const travelMode    = useScratchPlanStore((s) => s.travelMode)
  const preferences   = useScratchPlanStore((s) => s.preferences)
  const reset         = useScratchPlanStore((s) => s.reset)
  const totalStops    = useScratchPlanStore(selectTotalStops)

  // Accordion open state — first day open by default
  const [openDay, setOpenDay] = useState<number>(0)

  // Confirm mutation
  const { mutate: confirmPlan, isPending, error } = useConfirmPlan()

  const handleSave = () => {
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
        navigate(`/trips/${res.trip_id}`)
      },
    })
  }

  return (
    <div className="curation-screen">
      {/* Header */}
      <div className="curation-header">
        <div className="curation-header-left">
          <h1 className="curation-title">{destination}</h1>
          <p className="curation-meta">
            {days} day{days !== 1 ? 's' : ''} ·{' '}
            {totalStops} stop{totalStops !== 1 ? 's' : ''} ·{' '}
            from {startingPoint}
          </p>
        </div>
        <div className="curation-header-right">
          <button
            className="btn-secondary"
            onClick={() => {
              reset()
            }}
            disabled={isPending}
          >
            ← Start over
          </button>
          <button
            className="btn-primary btn-save"
            onClick={handleSave}
            disabled={isPending || totalStops === 0}
          >
            {isPending ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <span>💾</span> Save trip
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="curation-error" role="alert">
          <span>⚠</span> {error.message} — please try again.
        </div>
      )}

      {/* No stops warning */}
      {totalStops === 0 && (
        <div className="curation-warning" role="status">
          You've removed all activity stops. Add some back or start over.
        </div>
      )}

      {/* Main layout */}
      <div className="curation-layout">
        {/* Left: day accordion list */}
        <div className="curation-days">
          <div className="curation-days-hint">
            <span className="hint-icon">↕</span> Drag to reorder stops within a day.
            Click <strong>×</strong> to remove a stop.
          </div>

          {curatedDays.map((curatedDay, dayIndex) => (
            <DayAccordion
              key={curatedDay.day}
              curatedDay={curatedDay}
              dayIndex={dayIndex}
              isOpen={openDay === dayIndex}
              onToggle={() =>
                setOpenDay(openDay === dayIndex ? -1 : dayIndex)
              }
            />
          ))}
        </div>

        {/* Right: live map */}
        <div className="curation-map-panel">
          <CurationMap />
        </div>
      </div>
    </div>
  )
}
