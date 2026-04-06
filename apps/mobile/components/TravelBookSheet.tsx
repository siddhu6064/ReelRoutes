/**
 * components/TravelBookSheet.tsx
 *
 * Generates a print-ready travel book layout and links to print-on-demand vendors.
 * Mirrors web TravelBookCTA.tsx.
 */
import { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { API_BASE } from "@/constants/api";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

interface PrintSpecs {
  format: string;
  color: string;
  paper: string;
  suggested_vendor: string;
  vendor_api_docs: string;
}

interface BookData {
  page_count: number;
  title: string;
  print_specs: PrintSpecs;
  preview_url: string;
}

interface Props {
  tripId: string;
  userId?: string;
  visible: boolean;
  onClose: () => void;
}

export function TravelBookSheet({ tripId, userId, visible, onClose }: Props) {
  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", userId);
      const res = await fetch(`${API_BASE}/api/trips/${tripId}/book?${params.toString()}`, {
        method: "POST",
      });
      const json = (await res.json()) as { data: BookData };
      setBook(json.data);
    } catch {
      setError("Couldn't generate book layout. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setBook(null);
    setError("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>📖 Travel book</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        {!book && !loading && (
          <>
            <Text style={s.sub}>
              Turn your trip into a beautifully formatted travel guide — day-by-day stops, diary
              notes, full-route map. Ready to print via Lulu or Blurb.
            </Text>
            {error !== "" && <Text style={s.errorText}>{error}</Text>}
            <Pressable style={s.generateBtn} onPress={generate}>
              <Text style={s.generateBtnText}>📖 Generate travel book</Text>
            </Pressable>
          </>
        )}

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={CORAL} />
            <Text style={s.loadingText}>Generating your book layout…</Text>
          </View>
        )}

        {book && !loading && (
          <View style={s.resultBox}>
            <View style={s.iconRow}>
              <Text style={s.bookIcon}>📖</Text>
              <View style={s.bookMeta}>
                <Text style={s.bookTitle}>{book.title}</Text>
                <Text style={s.bookPages}>
                  {book.page_count} pages · {book.print_specs.format}" ·{" "}
                  {book.print_specs.color.replace("_", " ")} · {book.print_specs.paper}
                </Text>
              </View>
            </View>

            <View style={s.specs}>
              {[
                ["Recommended printer", book.print_specs.suggested_vendor],
                ["Format", `${book.print_specs.format}"`],
                ["Paper", book.print_specs.paper],
              ].map(([label, value]) => (
                <View key={label} style={s.specRow}>
                  <Text style={s.specLabel}>{label}</Text>
                  <Text style={s.specValue}>{value}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={s.printBtn}
              onPress={() => void Linking.openURL(book.print_specs.vendor_api_docs)}
            >
              <Text style={s.printBtnText}>🖨 Order from {book.print_specs.suggested_vendor}</Text>
            </Pressable>
            <Pressable
              style={s.regenBtn}
              onPress={() => {
                setBook(null);
              }}
            >
              <Text style={s.regenBtnText}>Regenerate</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2a2a28",
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: TEXT, fontSize: 17, fontWeight: "800" },
  close: { color: MUTED, fontSize: 16 },
  sub: { color: MUTED, fontSize: 13, lineHeight: 19 },
  errorText: { color: "#e05252", fontSize: 13 },
  loadingBox: { alignItems: "center", gap: 10, paddingVertical: 20 },
  loadingText: { color: MUTED, fontSize: 13 },
  resultBox: { gap: 12 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bookIcon: { fontSize: 36 },
  bookMeta: { flex: 1, gap: 4 },
  bookTitle: { color: TEXT, fontSize: 15, fontWeight: "800" },
  bookPages: { color: MUTED, fontSize: 12 },
  specs: {
    backgroundColor: SURFACE2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    gap: 8,
  },
  specRow: { flexDirection: "row", justifyContent: "space-between" },
  specLabel: { color: MUTED, fontSize: 12 },
  specValue: { color: TEXT, fontSize: 12, fontWeight: "600" },
  generateBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: "center",
  },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  printBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: "center",
  },
  printBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  regenBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  regenBtnText: { color: MUTED, fontWeight: "600", fontSize: 13 },
});
