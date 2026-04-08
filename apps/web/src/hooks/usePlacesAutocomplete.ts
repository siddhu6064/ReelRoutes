import { useCallback, useEffect, useRef, useState } from "react";

export interface PlacePrediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

const DEBOUNCE_MS = 300;

/**
 * Lightweight Google Places Autocomplete hook.
 *
 * Requires window.google.maps.places to be loaded (add the Places library
 * to your Google Maps script tag: &libraries=places).
 *
 * Falls back gracefully if the API is not loaded.
 */
export function usePlacesAutocomplete(input: string) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Initialise service once the Maps API is available
  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.maps?.places?.AutocompleteService) {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (!input || input.length < 2) {
      setPredictions([]);
      return;
    }

    if (!serviceRef.current) {
      setPredictions([]);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(() => {
      serviceRef.current!.getPlacePredictions({ input, types: ["(cities)"] }, (results, status) => {
        setLoading(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(
            results.map((r) => ({
              place_id: r.place_id,
              description: r.description,
              main_text: r.structured_formatting.main_text,
              secondary_text: r.structured_formatting.secondary_text,
            })),
          );
        } else {
          setPredictions([]);
        }
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timerRef.current);
  }, [input]);

  const clear = useCallback(() => setPredictions([]), []);

  return { predictions, loading, clear };
}
