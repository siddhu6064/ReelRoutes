import React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { buildConfirmRequest, useConfirmPlan } from '../../../hooks/useConfirmPlan'
import { selectTotalStops, useScratchPlanStore } from '../../../stores/scratchPlanStore'

import CurationMap from './CurationMap'
import DayAccordion from './DayAccordion'

export default function CurationScreen(): React.ReactElement {
  const navigate = useNavigate()
  const curatedDays   = useScratchPlanStore((s) => s.curatedDays)
  const startingPoint = useScratchPlanStore((s) => s.startingPoint)
  const destination   = useScratchPlanStore((s) => s.destination)
  const days          = useScratchPlanStore((s) => s.days)
  const travelMode    = useScratchPlanStore((s) => s.travelMode)
  const preferences   = useScratchPlanStore((s) => s.preferences)
  const totalStops    = useScratchPlanStore(selectTotalStops)
  const reset         = useScratchPlanStore((s) => s.reset)
  const [openDay, setOpenDay] = useState<number>(0)
  const { mutate: confirmPlan, isPending, error } = useConfirmPlan()

  const handleSave = (): void => {
    const req = buildConfirmRequest({ startingPoint, destination, days, travelMode, preferences, curatedDays })
    confirmPlan(req, {
      onSuccess: (res) => { reset(); void navigate(`/trips/${res.trip_id}`) },
    })
  }

  return (
    <div className="curation-screen">
      <div className="curation-header">
        <div className="curation-header-left">
          <h1 className="curation-title">{destination}</h1>
          <p className="curation-meta">{days} day{days !== 1 ? 's' : ''} · {totalStops} stop{totalStops !== 1 ? 's' : ''} · from {startingPoint}</p>
        </div>
        <div className="curation-header-right">
          <button className="btn-secondary" onClick={reset} disabled={isPending}>← Start over</button>
          <button className="btn-primary btn-save" onClick={handleSave} disabled={isPending || totalStops === 0}>
            {isPending ? <><span className="spinner" aria-hidden="true" /> Saving…</> : <><span>💾</span> Save trip</>}
          </button>
        </div>
      </div>
      {error && <div className="curation-error" role="alert"><span>⚠</span> {error.message} — please try again.</div>}
      {totalStops === 0 && <div className="curation-warning" role="status">You&apos;ve removed all activity stops. Add some back or start over.</div>}
      <div className="curation-layout">
        <div className="curation-days">
          <div className="curation-days-hint"><span className="hint-icon">↕</span> Drag to reorder. Click <strong>×</strong> to remove.</div>
          {curatedDays.map((curatedDay, dayIndex) => (
            <DayAccordion key={curatedDay.day} curatedDay={curatedDay} dayIndex={dayIndex} isOpen={openDay === dayIndex} onToggle={() => setOpenDay(openDay === dayIndex ? -1 : dayIndex)} />
          ))}
        </div>
        <div className="curation-map-panel"><CurationMap /></div>
      </div>
    </div>
  )
}
