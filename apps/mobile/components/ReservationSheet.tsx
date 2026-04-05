import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  type Reservation,
  useDeleteReservation,
  useImportReservation,
  useReservations,
} from "../api/client";

const TYPE_ICON: Record<string, string> = {
  flight: "✈",
  hotel: "🏨",
  activity: "🎟",
  car_rental: "🚗",
  other: "📄",
};

function fmt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ResCardProps {
  reservation: Reservation;
  onDelete: () => void;
}

function ResCard({ reservation, onDelete }: ResCardProps) {
  const icon = TYPE_ICON[reservation.type] ?? "📄";
  const checkIn = fmt(reservation.check_in);
  const checkOut = fmt(reservation.check_out);

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {reservation.title}
          </Text>
          {!!reservation.confirmation_number && (
            <Text style={styles.cardConf}>#{reservation.confirmation_number}</Text>
          )}
          {!!reservation.flight_number && (
            <Text style={styles.cardDetail}>Flight {reservation.flight_number}</Text>
          )}
          {!!checkIn && (
            <Text style={styles.cardDetail}>
              {checkIn}
              {checkOut ? ` → ${checkOut}` : ""}
            </Text>
          )}
          {!!reservation.notes && (
            <Text style={styles.cardDetail} numberOfLines={2}>
              {reservation.notes}
            </Text>
          )}
        </View>
        <Pressable onPress={onDelete} style={styles.deleteBtn} hitSlop={8}>
          <Text style={styles.deleteBtnText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface Props {
  tripId: string;
  userId: string;
  visible: boolean;
  onClose: () => void;
}

export function ReservationSheet({ tripId, userId, visible, onClose }: Props) {
  const [emailText, setEmailText] = useState("");
  const [showImporter, setShowImporter] = useState(false);

  const { data, isLoading } = useReservations(tripId, userId);
  const importRes = useImportReservation();
  const deleteRes = useDeleteReservation();

  const reservations: Reservation[] = data?.reservations ?? [];

  function handleImport() {
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Reservations</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Import toggle */}
          <Pressable
            style={showImporter ? styles.importToggleActive : styles.importToggle}
            onPress={() => setShowImporter((s) => !s)}
          >
            <Text style={showImporter ? styles.importToggleActiveText : styles.importToggleText}>
              {showImporter ? "Cancel" : "+ Import from email"}
            </Text>
          </Pressable>

          {/* Importer */}
          {showImporter && (
            <View style={styles.importer}>
              <Text style={styles.importerDesc}>
                Paste your confirmation email. GPT-4o will extract flight, hotel, or activity
                details.
              </Text>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={5}
                placeholder="Paste confirmation email here…"
                value={emailText}
                onChangeText={setEmailText}
                textAlignVertical="top"
              />
              <Pressable
                style={
                  importRes.isPending || !emailText.trim()
                    ? styles.importBtnDisabled
                    : styles.importBtn
                }
                onPress={handleImport}
                disabled={importRes.isPending || !emailText.trim()}
              >
                {importRes.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.importBtnText}>Import reservation</Text>
                )}
              </Pressable>
              {importRes.isError && (
                <Text style={styles.errorText}>Something went wrong. Please try again.</Text>
              )}
            </View>
          )}

          {/* List */}
          {isLoading && <ActivityIndicator style={styles.loader} color="#d85a30" />}

          {!isLoading && reservations.length === 0 && !showImporter && (
            <Text style={styles.emptyText}>
              No reservations yet. Import a confirmation email to get started.
            </Text>
          )}

          {reservations.map((r) => (
            <ResCard
              key={r.id}
              reservation={r}
              onDelete={() => deleteRes.mutate({ tripId, userId, reservationId: r.id })}
            />
          ))}

          <View style={styles.bottomPad} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 99,
    alignSelf: "center",
    marginVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 16, color: "#9ca3af" },
  importToggle: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d85a30",
    alignItems: "center",
    marginBottom: 14,
  },
  importToggleActive: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#9ca3af",
    alignItems: "center",
    marginBottom: 14,
  },
  importToggleText: { fontSize: 13, fontWeight: "700", color: "#d85a30" },
  importToggleActiveText: { fontSize: 13, fontWeight: "700", color: "#9ca3af" },
  importer: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  importerDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  textarea: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: "#111827",
    minHeight: 100,
  },
  importBtn: {
    backgroundColor: "#d85a30",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  importBtnDisabled: {
    backgroundColor: "#d85a30",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    opacity: 0.5,
  },
  importBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  errorText: { fontSize: 12, color: "#dc2626", textAlign: "center" },
  loader: { marginVertical: 20 },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginVertical: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 10,
  },
  cardRow: { flexDirection: "row", gap: 10 },
  cardIcon: { fontSize: 22, marginTop: 2 },
  cardInfo: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827", lineHeight: 20 },
  cardConf: { fontSize: 11, color: "#6b7280", fontFamily: "monospace" },
  cardDetail: { fontSize: 12, color: "#6b7280" },
  deleteBtn: { paddingTop: 2 },
  deleteBtnText: { fontSize: 14, color: "#9ca3af" },
  bottomPad: { height: 40 },
});
