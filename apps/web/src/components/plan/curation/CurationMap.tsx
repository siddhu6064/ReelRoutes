import { useEffect, useRef } from 'react'
import { useScratchPlanStore, selectAllActivityPins, selectChosenFoodPins } from '../../../stores/scratchPlanStore'

/**
 * CurationMap
 * -----------
 * Shows a live Google Map with pins updating in real time as the user
 * removes stops or selects food options during curation.
 *
 * Requires window.google.maps to be loaded via the Maps JS API script tag.
 * Colour coding:
 *   Blue markers  — activity stops
 *   Orange markers — chosen food stops
 */
export default function CurationMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])

  const activityPins = useScratchPlanStore(selectAllActivityPins)
  const foodPins     = useScratchPlanStore(selectChosenFoodPins)
  const destination  = useScratchPlanStore((s) => s.destination)

  // Initialise map once
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return
    if (mapInstanceRef.current) return   // already initialised

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      zoom: 12,
      center: { lat: 0, lng: 0 },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: CLEAN_MAP_STYLE,
    })
  }, [])

  // Update markers whenever pins change
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !window.google?.maps) return

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    const bounds = new window.google.maps.LatLngBounds()
    const allPins = [
      ...activityPins.map((p) => ({ lat: p.lat, lng: p.lng, type: 'activity' as const, label: p.name })),
      ...foodPins.map((p) => ({ lat: p.lat, lng: p.lng, type: 'food' as const, label: p.name })),
    ]

    if (allPins.length === 0) return

    allPins.forEach((pin, i) => {
      const pos = { lat: pin.lat, lng: pin.lng }
      const marker = new window.google.maps.Marker({
        position: pos,
        map,
        title: pin.label,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: pin.type === 'activity' ? 10 : 8,
          fillColor: pin.type === 'activity' ? '#1D6BF3' : '#F97316',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        label: {
          text: String(pin.type === 'activity' ? i + 1 : '🍽'),
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: '700',
        },
        zIndex: pin.type === 'activity' ? 10 : 5,
      })
      bounds.extend(pos)
      markersRef.current.push(marker)
    })

    map.fitBounds(bounds, 60)
  }, [activityPins, foodPins])

  return (
    <div className="curation-map-wrapper">
      <div className="map-legend">
        <span className="legend-dot activity" />
        <span className="legend-label">Activities</span>
        <span className="legend-dot food" />
        <span className="legend-label">Meals</span>
      </div>
      <div ref={mapRef} className="curation-map" aria-label={`Map of ${destination}`} />
    </div>
  )
}

// Minimal, clean map style
const CLEAN_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]
