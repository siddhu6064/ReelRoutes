/**
 * components/UndoSheet.tsx
 *
 * Bottom sheet for undo history and restoring previous trip snapshots.
 * Mirrors web UndoButton.tsx — shows edit history, one-tap restore.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useUndoHistory, useUndoTrip } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

interface Props {
  tripId: string;
  userId: string;
  visible: boolean;
  onClose: () => void;
}

export function UndoSheet({ tripId, userId, visible, onClose }: Props) {
  const { data } = useUndoHistory(tripId, userId);
  const undo = useUndoTrip();

  const snapshots = data?.snapshots ?? [];
  const canUndo = snapshots.length > 0 && !undo.isPending;

  function doUndo() {
    undo.mutate({ tripId, userId }, { onSuccess: () => onClose() });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Edit history</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        {snapshots.length === 0 ? (
          <Text style={s.empty}>No edit history yet.</Text>
        ) : (
          <>
            <Text style={s.sub}>
              {snapshots.length}/{data?.max_history ?? 20} snapshots saved
            </Text>
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {snapshots.map((snap, i) => (
                <View key={snap.snapshot_at} style={s.row}>
                  <View style={s.rowLeft}>
                    <Text style={s.snapTime}>
                      {new Date(snap.snapshot_at).toLocaleTimeString()}
                    </Text>
                    <Text style={s.snapDate}>
                      {new Date(snap.snapshot_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {i === 0 && (
                    <Pressable
                      style={[s.restoreBtn, !canUndo && s.btnDisabled]}
                      onPress={doUndo}
                      disabled={!canUndo}
                    >
                      <Text style={s.restoreBtnText}>
                        {undo.isPending ? "Restoring…" : "↩ Restore"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <Pressable
          style={[s.undoBtn, !canUndo && s.btnDisabled]}
          onPress={doUndo}
          disabled={!canUndo}
        >
          <Text style={s.undoBtnText}>{undo.isPending ? "Undoing…" : "↩ Undo last change"}</Text>
        </Pressable>
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
    maxHeight: "60%",
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: TEXT, fontSize: 17, fontWeight: "800" },
  close: { color: MUTED, fontSize: 16 },
  sub: { color: MUTED, fontSize: 12 },
  empty: { color: MUTED, fontSize: 14, textAlign: "center", paddingVertical: 24 },
  list: { maxHeight: 200 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowLeft: { gap: 2 },
  snapTime: { color: TEXT, fontSize: 13, fontWeight: "600" },
  snapDate: { color: MUTED, fontSize: 11 },
  restoreBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: BORDER,
  },
  restoreBtnText: { color: TEXT, fontSize: 12, fontWeight: "700" },
  undoBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.4 },
  undoBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
