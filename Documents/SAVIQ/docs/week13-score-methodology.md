# Week 13 Metrics Methodology

This document defines the intent and calculation boundaries for the Week 13 metrics exposed by `GET /api/dashboard/metrics`.

## Design principles
- **Deterministic**: same inputs produce same outputs.
- **Transparent**: component inputs are returned with each score.
- **Low-risk**: no opaque models, no external AI/LLM services.
- **No-data safe**: metrics return explicit null/zero-safe structures with `has_sufficient_data` flags.

## Metrics and summaries

### 1) Savings Score
- **Purpose**: quick view of current savings discipline.
- **Scale**: `0–100` (higher is better).
- **Components**:
  - `goals_progress`
  - `budget_adherence`
  - `discretionary_trend`
- **Method**: normalized component average over available inputs.

### 2) Spend Velocity
- **Purpose**: recent spending pace and cadence.
- **Scale**: `value` uses weeklyized spend pace; supporting fields are raw pace inputs.
- **Fields**:
  - `value`
  - `recent_daily_average`
  - `recent_weekly_average`
  - `transaction_cadence`
  - `has_sufficient_data`
- **Method**: recent expense-only rolling-window averages.

### 3) Financial Health Score
- **Purpose**: broad snapshot of current position.
- **Scale**: `0–100` (higher is better).
- **Components**:
  - `net_position`
  - `savings_behavior`
  - `budget_pressure` (pressure is inverted to score contribution)
  - `goal_progress`
- **Method**: normalized component average over available inputs.

### 4) Budget Confidence
- **Purpose**: confidence indicator for staying within budget.
- **Scale**: `0–100` (higher indicates stronger confidence, not certainty).
- **Components**:
  - `forecast_alignment`
  - `remaining_budget_ratio`
  - `historical_consistency`
- **Method**: normalized component average over available inputs.

### 5) Top Category summary
- **Purpose**: quick-scan dominant spend category this period.
- **Fields**:
  - `category_name`
  - `amount`
  - `share_of_expenses`
  - `has_sufficient_data`
- **Method**: aggregate expense amounts by category and apply deterministic tie-break (`amount desc`, then label asc).

### 6) Projected Savings summary
- **Purpose**: conservative month-end savings estimate for quick scan.
- **Fields**:
  - `projected_savings`
  - `basis`
  - `has_sufficient_data`
- **Method**: `current_net_total - projected_remaining_spend_from_velocity`.
- **Basis label**: deterministic short label (`net_minus_velocity_remaining_spend`).

## No-data behavior philosophy
- Metrics should never fail closed for UI consumers.
- If inputs are insufficient, return explicit safe structures with `value`/summary fields set to `null` (or zero-safe fields where defined) and `has_sufficient_data: false`.

## Caveats for future UI copy
- These are **decision-support indicators**, not guarantees.
- Not a credit score, underwriting score, or certainty estimate.
- Forecast-aligned metrics should be phrased as confidence/likelihood, not promised outcomes.

## API exposure
- Week 13 bundle is exposed additively at `GET /api/dashboard/metrics` to avoid breaking existing dashboard consumers.
