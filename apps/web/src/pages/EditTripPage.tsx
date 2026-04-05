import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import styles from "./EditTripPage.module.css";

import type { Pin, OptimiseResult, ItineraryDay } from "@/api/client";

import {
  useTrip, useUpdateTrip, useDeleteTrip, useReorderPins, useAddPin,
  useOptimiseRoute, useGenerateItinerary,
} from "@/api/client";
import { useAppStore } from "@/stores/appStore";


// Day colours for itinerary view
const DAY_COLOURS = [
  "#D85A30","#378ADD","#1D9E75","#7F77DD","#EF9F27",
  "#D4537E","#2E9E4F","#E05252","#5DA0B5","#B07D3A",
];

export default function EditTripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { userId } = useAppStore();
  const { data: trip, isLoading } = useTrip(tripId ?? null, userId ?? undefined);

  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  // New place form
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [newPlace, setNewPlace] = useState({ name: "", lat: "", lng: "", address: "" });
  const [addingPlace, setAddingPlace] = useState(false);

  // Route optimisation state
  const [showOptimise, setShowOptimise] = useState(false);
  const [startAddress, setStartAddress] = useState("");
  const [optimiseResult, setOptimiseResult] = useState<OptimiseResult | null>(null);

  // Itinerary state
  const [showItinerary, setShowItinerary] = useState(false);
  const [tripDays, setTripDays] = useState(3);
  const [itinerary, setItinerary] = useState<ItineraryDay[] | null>(
    trip?.itinerary?.length ? trip.itinerary : null
  );

  const { mutateAsync: updateTrip, isPending: updatingTitle } = useUpdateTrip();
  const { mutateAsync: deleteTrip, isPending: deleting } = useDeleteTrip();
  const { mutateAsync: reorderPins } = useReorderPins();
  const { mutateAsync: addPin } = useAddPin();
  const { mutateAsync: optimiseRoute, isPending: optimising } = useOptimiseRoute();
  const { mutateAsync: generateItinerary, isPending: generatingItinerary } = useGenerateItinerary();

  const currentTitle = titleDirty ? title : (trip?.title ?? "");
  const sorted = trip ? [...trip.pins].sort((a, b) => a.order - b.order) : [];

  // Build a pin→day colour map
  const pinDayColour = new Map<string, string>();
  const activeDays = itinerary ?? trip?.itinerary ?? [];
  activeDays.forEach((day, i) => {
    const col = DAY_COLOURS[i % DAY_COLOURS.length];
    if (col) day.pinIds.forEach((id) => pinDayColour.set(id, col));
  });

  async function handleSaveTitle() {
    if (!userId || !tripId || !title.trim()) return;
    await updateTrip({ tripId, user_id: userId, title: title.trim() });
    setTitleDirty(false);
  }

  async function handleDelete() {
    if (!userId || !tripId) return;
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    await deleteTrip({ tripId, userId });
    navigate("/");
  }

  function onDragStart(e: React.DragEvent, index: number) {
    setDragging(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  async function onDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragging === null || dragging === dropIndex || !userId || !tripId) return;
    const newOrder = [...sorted];
    const spliced = newOrder.splice(dragging, 1);
    const moved = spliced[0];
    if (!moved) return;
    newOrder.splice(dropIndex, 0, moved);
    setDragging(null);
    setDragOver(null);
    await reorderPins({ tripId, user_id: userId, pin_ids: newOrder.map((p) => p.id) });
  }

  async function handleAddPlace() {
    if (!userId || !tripId || !newPlace.name || !newPlace.lat || !newPlace.lng) return;
    setAddingPlace(true);
    try {
      await addPin({
        tripId, user_id: userId, place_name: newPlace.name,
        lat: parseFloat(newPlace.lat), lng: parseFloat(newPlace.lng),
        address: newPlace.address || undefined,
      });
      setNewPlace({ name: "", lat: "", lng: "", address: "" });
      setShowAddPlace(false);
    } finally { setAddingPlace(false); }
  }

  async function handleOptimise() {
    if (!userId || !tripId) return;
    const result = await optimiseRoute({ tripId, user_id: userId });
    setOptimiseResult(result);
  }

  async function handleGenerateItinerary() {
    if (!userId || !tripId) return;
    const result = await generateItinerary({ tripId, user_id: userId, trip_length_days: tripDays });
    setItinerary(result.days);
  }

  function copyItineraryText() {
    if (!itinerary) return;
    const lines = itinerary.map((day) => {
      const pins = day.pinIds.map((id) => sorted.find((p) => p.id === id)?.placeName ?? id);
      return `${day.label ?? `Day ${day.dayNumber}`}\n${pins.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}${day.notes ? `\n  Note: ${day.notes}` : ""}`;
    });
    navigator.clipboard.writeText(lines.join("\n\n"));
  }

  function openDayInMaps(day: ItineraryDay) {
    const pins = day.pinIds.map((id) => sorted.find((p) => p.id === id)).filter(Boolean) as Pin[];
    const first = pins[0];
    const last = pins[pins.length - 1];
    if (!first || !last) return;
    const origin = `${first.lat},${first.lng}`;
    const dest = `${last.lat},${last.lng}`;
    const wps = pins.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wps ? `&waypoints=${wps}` : ""}`;
    window.open(url, "_blank");
  }

  if (isLoading) return <div className={styles.loading}>Loading…</div>;
  if (!trip) return <div className={styles.loading}>Trip not found.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/trips/${tripId}`)}>← Back to map</button>
        <h1 className={styles.pageTitle}>Edit Trip</h1>
      </div>

      {/* Title */}
      <section className={styles.section}>
        <label className={styles.label}>Trip name</label>
        <div className={styles.titleRow}>
          <input
            className={styles.titleInput}
            value={currentTitle}
            onChange={(e) => { setTitle(e.target.value); setTitleDirty(true); }}
            placeholder="Name your trip"
          />
          {titleDirty && (
            <button className={styles.saveBtn} onClick={handleSaveTitle} disabled={updatingTitle}>
              {updatingTitle ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </section>

      {/* ── W5: Route Optimisation ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <label className={styles.label}>Route optimisation</label>
          <button className={styles.toolBtn} onClick={() => setShowOptimise(!showOptimise)}>
            {showOptimise ? "Hide" : "Optimise route"}
          </button>
        </div>
        {showOptimise && (
          <div className={styles.optimisePanel}>
            <p className={styles.hint}>
              Reorders stops to minimise total travel distance using nearest-neighbour routing.
            </p>
            {/* W5t5 — optional start location */}
            <div className={styles.startRow}>
              <input
                className={styles.formInput}
                placeholder="Start from (optional) — hotel, airport, address…"
                value={startAddress}
                onChange={(e) => setStartAddress(e.target.value)}
              />
            </div>
            <button
              className={styles.actionBtn}
              onClick={handleOptimise}
              disabled={optimising || !userId}
            >
              {optimising ? "Optimising…" : "⚡ Optimise route"}
            </button>

            {optimiseResult && (
              <div className={styles.optimiseResult}>
                <div className={styles.resultGrid}>
                  <div className={styles.resultBox}>
                    <span className={styles.resultLabel}>Before</span>
                    <span className={styles.resultValue}>{optimiseResult.originalDistanceKm} km</span>
                  </div>
                  <div className={styles.resultArrow}>→</div>
                  <div className={styles.resultBox}>
                    <span className={styles.resultLabel}>After</span>
                    <span className={styles.resultValue} style={{ color: "var(--green)" }}>
                      {optimiseResult.optimisedDistanceKm} km
                    </span>
                  </div>
                  <div className={styles.resultSaving}>
                    Saved {optimiseResult.savingPercent}%
                  </div>
                </div>
                <p className={styles.hint}>Stop order updated. View the new route on the map.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── W6: Itinerary Planner ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <label className={styles.label}>Day-by-day itinerary</label>
          <button className={styles.toolBtn} onClick={() => setShowItinerary(!showItinerary)}>
            {showItinerary ? "Hide" : "Plan my trip"}
          </button>
        </div>
        {showItinerary && (
          <div className={styles.itineraryPanel}>
            <div className={styles.daysRow}>
              <label className={styles.daysLabel}>Number of days:</label>
              <div className={styles.daysStepper}>
                <button onClick={() => setTripDays(Math.max(1, tripDays - 1))}>−</button>
                <span>{tripDays}</span>
                <button onClick={() => setTripDays(Math.min(30, tripDays + 1))}>+</button>
              </div>
              <button
                className={styles.actionBtn}
                onClick={handleGenerateItinerary}
                disabled={generatingItinerary || !userId}
              >
                {generatingItinerary ? "Planning…" : "✨ Generate plan"}
              </button>
            </div>

            {activeDays.length > 0 && (
              <>
                <div className={styles.itineraryDays}>
                  {activeDays.map((day, i) => {
                    const dayPins = day.pinIds
                      .map((id) => sorted.find((p) => p.id === id))
                      .filter(Boolean) as Pin[];
                    const colour = DAY_COLOURS[i % DAY_COLOURS.length];
                    return (
                      <div key={day.dayNumber} className={styles.dayBlock}>
                        <div className={styles.dayHeader} style={{ borderLeftColor: colour }}>
                          <span className={styles.dayLabel}>
                            {day.label ?? `Day ${day.dayNumber}`}
                          </span>
                          <button
                            className={styles.dayMapsBtn}
                            onClick={() => openDayInMaps(day)}
                            title="Open day in Google Maps"
                          >
                            🗺 Maps
                          </button>
                        </div>
                        {day.notes && <p className={styles.dayNote}>{day.notes}</p>}
                        <ol className={styles.dayPins}>
                          {dayPins.map((pin) => (
                            <li key={pin.id}>{pin.placeName}</li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
                {/* W6t5 — export actions */}
                <div className={styles.itineraryActions}>
                  <button className={styles.exportBtn} onClick={copyItineraryText}>
                    📋 Copy as text
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Stops — drag to reorder */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <label className={styles.label}>Stops — drag to reorder</label>
          <button className={styles.addBtn} onClick={() => setShowAddPlace(!showAddPlace)}>
            + Add place
          </button>
        </div>
        <div className={styles.stops}>
          {sorted.map((pin, i) => {
            const dayColour = pinDayColour.get(pin.id);
            return (
              <div
                key={pin.id}
                className={`${styles.stop} ${dragging === i ? styles.dragging : ""} ${dragOver === i ? styles.dragOver : ""}`}
                draggable
                onDragStart={(e) => onDragStart(e, i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
              >
                <span className={styles.handle}>⠿</span>
                {dayColour && (
                  <span className={styles.dayDot} style={{ background: dayColour }} />
                )}
                <div className={styles.stopNum}>{i + 1}</div>
                <div className={styles.stopInfo}>
                  <div className={styles.stopName}>{pin.placeName}</div>
                  {pin.city && <div className={styles.stopCity}>{pin.city}</div>}
                </div>
                {pin.manuallyAdded && <span className={styles.manualTag}>manual</span>}
                {pin.category && <span className={styles.categoryTag}>{pin.category}</span>}
              </div>
            );
          })}
        </div>

        {showAddPlace && (
          <div className={styles.addPlaceForm}>
            <h3 className={styles.addPlaceTitle}>Add a place manually</h3>
            <div className={styles.formGrid}>
              <input className={styles.formInput} placeholder="Place name *" value={newPlace.name}
                onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })} />
              <input className={styles.formInput} placeholder="Address" value={newPlace.address}
                onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })} />
              <input className={styles.formInput} placeholder="Latitude *  e.g. 35.6595" value={newPlace.lat}
                onChange={(e) => setNewPlace({ ...newPlace, lat: e.target.value })} />
              <input className={styles.formInput} placeholder="Longitude *  e.g. 139.7004" value={newPlace.lng}
                onChange={(e) => setNewPlace({ ...newPlace, lng: e.target.value })} />
            </div>
            <div className={styles.formActions}>
              <button className={styles.saveBtn} onClick={handleAddPlace} disabled={addingPlace}>
                {addingPlace ? "Adding…" : "Add stop"}
              </button>
              <button className={styles.cancelBtn} onClick={() => setShowAddPlace(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Danger */}
      <section className={`${styles.section} ${styles.danger}`}>
        <label className={styles.label}>Danger zone</label>
        <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete this trip"}
        </button>
      </section>
    </div>
  );
}
