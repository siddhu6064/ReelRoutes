import { useState } from "react";

import {
  type Reservation,
  useDeleteReservation,
  useImportReservation,
  useReservations,
} from "../api/client";

import styles from "./ReservationImport.module.css";

const TYPE_ICON: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  activity: "🎟️",
  car_rental: "🚗",
  other: "📄",
};

interface ReservationCardProps {
  reservation: Reservation;
  onDelete: () => void;
}

function ReservationCard({ reservation, onDelete }: ReservationCardProps): React.ReactElement {
  const icon = TYPE_ICON[reservation.type] ?? "📄";

  function fmt(iso: string | null): string | null {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>{icon}</span>
        <div className={styles.cardInfo}>
          <p className={styles.cardTitle}>{reservation.title}</p>
          {reservation.confirmation_number && (
            <p className={styles.cardConf}>#{reservation.confirmation_number}</p>
          )}
        </div>
        <button className={styles.deleteBtn} onClick={onDelete} title="Remove">
          ✕
        </button>
      </div>

      <div className={styles.cardDetails}>
        {reservation.flight_number && (
          <span className={styles.detail}>Flight {reservation.flight_number}</span>
        )}
        {reservation.check_in && (
          <span className={styles.detail}>
            {fmt(reservation.check_in)}
            {reservation.check_out ? ` → ${fmt(reservation.check_out)}` : ""}
          </span>
        )}
        {reservation.notes && <span className={styles.detail}>{reservation.notes}</span>}
      </div>
    </div>
  );
}

interface Props {
  tripId: string;
  userId: string;
}

export function ReservationImport({ tripId, userId }: Props): React.ReactElement {
  const [emailText, setEmailText] = useState("");
  const [showImporter, setShowImporter] = useState(false);

  const { data, isLoading } = useReservations(tripId, userId);
  const importRes = useImportReservation();
  const deleteRes = useDeleteReservation();

  const reservations = data?.reservations ?? [];

  function handleImport(): void {
    if (!emailText.trim()) return;
    importRes.mutate(
      { tripId, userId, emailText },
      {
        onSuccess: () => {
          setEmailText("");
          setShowImporter(false);
        },
      },
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Reservations</h3>
        <button className={styles.addBtn} onClick={() => setShowImporter((s) => !s)}>
          {showImporter ? "Cancel" : "+ Import email"}
        </button>
      </div>

      {showImporter && (
        <div className={styles.importer}>
          <p className={styles.importerDesc}>
            Paste the text from a flight, hotel, or activity confirmation email. GPT-4o will extract
            the details automatically.
          </p>
          <textarea
            className={styles.textarea}
            placeholder="Paste your confirmation email here…"
            rows={6}
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
          />
          <button
            className={styles.importBtn}
            onClick={handleImport}
            disabled={importRes.isPending || !emailText.trim()}
          >
            {importRes.isPending ? "Parsing…" : "Import reservation"}
          </button>
          {importRes.isError && (
            <p className={styles.error}>Something went wrong. Please try again.</p>
          )}
        </div>
      )}

      {isLoading && <p className={styles.loading}>Loading reservations…</p>}

      {!isLoading && reservations.length === 0 && !showImporter && (
        <p className={styles.empty}>
          No reservations yet. Import a confirmation email to get started.
        </p>
      )}

      <div className={styles.list}>
        {reservations.map((r) => (
          <ReservationCard
            key={r.id}
            reservation={r}
            onDelete={() => deleteRes.mutate({ tripId, userId, reservationId: r.id })}
          />
        ))}
      </div>
    </div>
  );
}
