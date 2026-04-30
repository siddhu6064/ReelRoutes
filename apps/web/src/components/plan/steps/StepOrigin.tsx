import { useState } from "react";

import { usePlacesAutocomplete } from "../../../hooks/usePlacesAutocomplete";
import { useScratchPlanStore } from "../../../stores/scratchPlanStore";

import type { PlacePrediction } from "../../../hooks/usePlacesAutocomplete";

interface Props {
  onNext: () => void;
}

export default function StepOrigin({ onNext }: Props): React.ReactElement {
  const startingPoint = useScratchPlanStore((s) => s.startingPoint);
  const destination = useScratchPlanStore((s) => s.destination);
  const setStartingPoint = useScratchPlanStore((s) => s.setStartingPoint);
  const setDestination = useScratchPlanStore((s) => s.setDestination);

  const [originInput, setOriginInput] = useState(startingPoint);
  const [destInput, setDestInput] = useState(destination);
  const [activeField, setActiveField] = useState<"origin" | "dest" | null>(null);

  const originAC = usePlacesAutocomplete(activeField === "origin" ? originInput : "");
  const destAC = usePlacesAutocomplete(activeField === "dest" ? destInput : "");

  const selectOrigin = (p: PlacePrediction): void => {
    setOriginInput(p.description);
    setStartingPoint(p.description);
    originAC.clear();
    setActiveField(null);
  };

  const selectDest = (p: PlacePrediction): void => {
    setDestInput(p.description);
    setDestination(p.description);
    destAC.clear();
    setActiveField(null);
  };

  const canContinue = startingPoint.trim().length >= 2 && destination.trim().length >= 2;

  const handleOriginBlur = (): void => {
    // Allow click on suggestion before clearing
    setTimeout(() => setActiveField(null), 150);
  };

  const handleDestBlur = (): void => {
    setTimeout(() => setActiveField(null), 150);
  };

  return (
    <div className="step-container">
      <div className="step-header">
        <h2 className="step-title">Where are you going?</h2>
        <p className="step-subtitle">Tell us your starting point and destination.</p>
      </div>

      <div className="step-fields">
        {/* Starting point */}
        <div className="autocomplete-field">
          <label className="field-label">Starting from</label>
          <div className="autocomplete-wrap">
            <span className="field-icon">📍</span>
            <input
              className="field-input"
              type="text"
              placeholder="e.g. Austin, TX"
              value={originInput}
              onChange={(e) => {
                setOriginInput(e.target.value);
                setStartingPoint(e.target.value);
              }}
              onFocus={() => setActiveField("origin")}
              onBlur={handleOriginBlur}
              autoComplete="off"
            />
            {originInput && (
              <button
                className="field-clear"
                onClick={() => {
                  setOriginInput("");
                  setStartingPoint("");
                }}
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
          {activeField === "origin" && originAC.predictions.length > 0 && (
            <AutocompleteDropdown predictions={originAC.predictions} onSelect={selectOrigin} />
          )}
        </div>

        {/* Route arrow */}
        <div className="route-arrow" aria-hidden="true">
          ↓
        </div>

        {/* Destination */}
        <div className="autocomplete-field">
          <label className="field-label">Destination</label>
          <div className="autocomplete-wrap">
            <span className="field-icon">🗺</span>
            <input
              className="field-input"
              type="text"
              placeholder="e.g. New Orleans, LA"
              value={destInput}
              onChange={(e) => {
                setDestInput(e.target.value);
                setDestination(e.target.value);
              }}
              onFocus={() => setActiveField("dest")}
              onBlur={handleDestBlur}
              autoComplete="off"
            />
            {destInput && (
              <button
                className="field-clear"
                onClick={() => {
                  setDestInput("");
                  setDestination("");
                }}
                aria-label="Clear"
              >
                ×
              </button>
            )}
          </div>
          {activeField === "dest" && destAC.predictions.length > 0 && (
            <AutocompleteDropdown predictions={destAC.predictions} onSelect={selectDest} />
          )}
        </div>
      </div>

      <div className="step-footer">
        <button className="btn-primary" onClick={onNext} disabled={!canContinue}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function AutocompleteDropdown({
  predictions,
  onSelect,
}: {
  predictions: PlacePrediction[];
  onSelect: (p: PlacePrediction) => void;
}) {
  return (
    <ul className="autocomplete-dropdown" role="listbox">
      {predictions.map((p) => (
        <li
          key={p.place_id}
          className="autocomplete-option"
          role="option"
          onMouseDown={() => onSelect(p)}
        >
          <span className="option-main">{p.main_text}</span>
          <span className="option-secondary">{p.secondary_text}</span>
        </li>
      ))}
    </ul>
  );
}
