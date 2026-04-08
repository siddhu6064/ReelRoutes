import { useState } from 'react'

import PlanFromScratch from '../components/plan/PlanFromScratch'
/**
 * NewTripScreen
 * -------------
 * Drop-in replacement / update for the existing NewTrip screen.
 * Adds the "Plan from Scratch" path alongside the existing "Import from Video".
 *
 * INTEGRATION INSTRUCTIONS
 * -------------------------
 * 1. Import PlanFromScratch and the CSS into your existing NewTrip screen file.
 * 2. Add the `mode` state to toggle between the two paths.
 * 3. Render <PlanFromScratch /> when mode === 'scratch'.
 *
 * The existing video import flow is untouched — this wraps around it.
 */

// import VideoImport from './VideoImport'  ← your existing component

type CreationMode = 'choose' | 'video' | 'scratch'

export default function NewTripScreen() {
  const [mode, setMode] = useState<CreationMode>('choose')

  // ── Mode selector ─────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <div className="new-trip-screen">
        <div className="new-trip-header">
          <h1 className="new-trip-title">Start a new trip</h1>
          <p className="new-trip-subtitle">
            Import a travel video or let AI plan one from scratch.
          </p>
        </div>

        <div className="new-trip-options">
          {/* Option 1: Import from video */}
          <button
            className="trip-option-card"
            onClick={() => setMode('video')}
          >
            <div className="option-icon">🎬</div>
            <div className="option-content">
              <h2 className="option-title">Import from video</h2>
              <p className="option-desc">
                Paste a YouTube, Instagram, TikTok, or Facebook URL.
                We'll extract every location automatically.
              </p>
            </div>
            <span className="option-arrow">→</span>
          </button>

          {/* Option 2: Plan from scratch */}
          <button
            className="trip-option-card trip-option-card--featured"
            onClick={() => setMode('scratch')}
          >
            <div className="option-icon">✨</div>
            <div className="option-content">
              <h2 className="option-title">Plan from scratch</h2>
              <p className="option-desc">
                Tell us where you're going and for how long.
                Our AI builds a day-by-day itinerary, with restaurants on the way.
              </p>
            </div>
            <span className="option-arrow">→</span>
          </button>
        </div>

        {/* Inline styles for the chooser — append to planStyles.css if preferred */}
        <style>{`
          .new-trip-screen {
            max-width: 600px;
            margin: 0 auto;
            padding: 2.5rem 1.25rem;
          }
          .new-trip-header {
            text-align: center;
            margin-bottom: 2rem;
          }
          .new-trip-title {
            font-size: 1.875rem;
            font-weight: 800;
            color: #111827;
            letter-spacing: -0.03em;
            margin: 0 0 0.5rem;
          }
          .new-trip-subtitle {
            font-size: 1rem;
            color: #6B7280;
            margin: 0;
          }
          .new-trip-options {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .trip-option-card {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.25rem 1.375rem;
            border: 2px solid #E5E7EB;
            border-radius: 16px;
            background: #fff;
            cursor: pointer;
            text-align: left;
            transition: all 0.2s;
            width: 100%;
          }
          .trip-option-card:hover {
            border-color: #1D6BF3;
            box-shadow: 0 4px 16px rgba(29,107,243,0.1);
            transform: translateY(-1px);
          }
          .trip-option-card--featured {
            border-color: #BFDBFE;
            background: linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%);
          }
          .trip-option-card--featured:hover {
            border-color: #1D6BF3;
          }
          .option-icon {
            font-size: 2rem;
            flex-shrink: 0;
          }
          .option-content { flex: 1; }
          .option-title {
            font-size: 1.0625rem;
            font-weight: 700;
            color: #111827;
            margin: 0 0 0.25rem;
          }
          .option-desc {
            font-size: 0.875rem;
            color: #4B5563;
            margin: 0;
            line-height: 1.5;
          }
          .option-arrow {
            font-size: 1.25rem;
            color: #9CA3AF;
            flex-shrink: 0;
          }
        `}</style>
      </div>
    )
  }

  // ── Plan from scratch ─────────────────────────────────────────────────────
  if (mode === 'scratch') {
    return <PlanFromScratch />
  }

  // ── Video import (existing flow) ──────────────────────────────────────────
  // return <VideoImport onBack={() => setMode('choose')} />
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
      {/* Replace this with your existing VideoImport component */}
      <p>← Video import flow goes here</p>
      <button onClick={() => setMode('choose')}>Back</button>
    </div>
  )
}
