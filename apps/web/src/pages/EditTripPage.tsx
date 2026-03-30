import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTrip, useUpdateTrip, useDeleteTrip, useReorderPins, useAddPin } from "@/api/client";
import type { Pin } from "@/api/client";
import { useAppStore } from "@/stores/appStore";
import styles from "./EditTripPage.module.css";

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

  const { mutateAsync: updateTrip, isPending: updatingTitle } = useUpdateTrip();
  const { mutateAsync: deleteTrip, isPending: deleting } = useDeleteTrip();
  const { mutateAsync: reorderPins } = useReorderPins();
  const { mutateAsync: addPin } = useAddPin();

  const currentTitle = titleDirty ? title : (trip?.title ?? "");
  const sorted = trip ? [...trip.pins].sort((a, b) => a.order - b.order) : [];

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

  // Drag and drop reordering
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
    const [moved] = newOrder.splice(dragging, 1);
    newOrder.splice(dropIndex, 0, moved);

    setDragging(null);
    setDragOver(null);

    await reorderPins({
      tripId,
      user_id: userId,
      pin_ids: newOrder.map((p) => p.id),
    });
  }

  async function handleAddPlace() {
    if (!userId || !tripId) return;
    if (!newPlace.name || !newPlace.lat || !newPlace.lng) return;
    setAddingPlace(true);
    try {
      await addPin({
        tripId,
        user_id: userId,
        place_name: newPlace.name,
        lat: parseFloat(newPlace.lat),
        lng: parseFloat(newPlace.lng),
        address: newPlace.address || undefined,
      });
      setNewPlace({ name: "", lat: "", lng: "", address: "" });
      setShowAddPlace(false);
    } finally {
      setAddingPlace(false);
    }
  }

  if (isLoading) return <div className={styles.loading}>Loading…</div>;
  if (!trip) return <div className={styles.loading}>Trip not found.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(`/trips/${tripId}`)}>
          ← Back to map
        </button>
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

      {/* Stop reorder */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <label className={styles.label}>Stops — drag to reorder</label>
          <button className={styles.addBtn} onClick={() => setShowAddPlace(!showAddPlace)}>
            + Add place
          </button>
        </div>

        <div className={styles.stops}>
          {sorted.map((pin, i) => (
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
              <div className={styles.stopNum}>{i + 1}</div>
              <div className={styles.stopInfo}>
                <div className={styles.stopName}>{pin.placeName}</div>
                {pin.city && <div className={styles.stopCity}>{pin.city}</div>}
              </div>
              {pin.manuallyAdded && <span className={styles.manualTag}>manual</span>}
            </div>
          ))}
        </div>

        {showAddPlace && (
          <div className={styles.addPlaceForm}>
            <h3 className={styles.addPlaceTitle}>Add a place manually</h3>
            <p className={styles.addPlaceHint}>
              Use Google Maps to find coordinates: right-click a location and copy lat/lng.
            </p>
            <div className={styles.formGrid}>
              <input
                className={styles.formInput}
                placeholder="Place name *"
                value={newPlace.name}
                onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })}
              />
              <input
                className={styles.formInput}
                placeholder="Address"
                value={newPlace.address}
                onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })}
              />
              <input
                className={styles.formInput}
                placeholder="Latitude *  e.g. 35.6595"
                value={newPlace.lat}
                onChange={(e) => setNewPlace({ ...newPlace, lat: e.target.value })}
              />
              <input
                className={styles.formInput}
                placeholder="Longitude *  e.g. 139.7004"
                value={newPlace.lng}
                onChange={(e) => setNewPlace({ ...newPlace, lng: e.target.value })}
              />
            </div>
            <div className={styles.formActions}>
              <button className={styles.saveBtn} onClick={handleAddPlace} disabled={addingPlace}>
                {addingPlace ? "Adding…" : "Add stop"}
              </button>
              <button className={styles.cancelBtn} onClick={() => setShowAddPlace(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className={`${styles.section} ${styles.danger}`}>
        <label className={styles.label}>Danger zone</label>
        <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete this trip"}
        </button>
      </section>
    </div>
  );
}
