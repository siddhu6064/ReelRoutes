/**
 * components/DiarySheet.tsx
 *
 * Modal for adding a diary note when marking a stop as visited.
 * Mirrors web DiaryModal.tsx — same 2000-char cap, save + skip actions.
 */
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const RED = "#e05252";
const GREEN = "#22c55e";
const MAX = 2000;

interface Props {
  visible: boolean;
  placeName: string;
  initialEntry?: string;
  onConfirm: (entry: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

export default function DiarySheet({
  visible,
  placeName,
  initialEntry = "",
  onConfirm,
  onSkip,
  onClose,
}: Props) {
  const [entry, setEntry] = useState(initialEntry);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setEntry(initialEntry);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible, initialEntry]);

  const remaining = MAX - entry.length;
  const isOver = remaining < 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={s.backdrop}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav}>
        <View style={s.sheet}>
          <View style={s.handle} />

          <Text style={s.title}>You visited {placeName}! 🎉</Text>
          <Text style={s.sub}>Add a diary note — or skip and just mark it visited.</Text>

          <TextInput
            ref={inputRef}
            style={[s.input, isOver && s.inputError]}
            value={entry}
            onChangeText={setEntry}
            placeholder="What did you think? Favourite memory? Tips for others…"
            placeholderTextColor={MUTED}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={MAX + 50}
          />

          <Text style={[s.counter, isOver && s.counterError]}>
            {remaining < 200 ? `${remaining} characters remaining` : `${entry.length} / ${MAX}`}
          </Text>

          <View style={s.actions}>
            <Pressable style={s.btnGhost} onPress={onClose}>
              <Text style={s.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={s.btnSecondary} onPress={onSkip}>
              <Text style={s.btnSecondaryText}>Skip note</Text>
            </Pressable>
            <Pressable
              style={[s.btnPrimary, isOver && s.btnDisabled]}
              disabled={isOver}
              onPress={() => onConfirm(entry)}
            >
              <Text style={s.btnPrimaryText}>Save & mark visited</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  kav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
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
  title: { color: TEXT, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sub: { color: MUTED, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: SURFACE2,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    color: TEXT,
    fontSize: 14,
    minHeight: 100,
    lineHeight: 20,
  },
  inputError: { borderColor: RED },
  counter: { color: MUTED, fontSize: 11, textAlign: "right" },
  counterError: { color: RED },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  btnGhostText: { color: MUTED, fontWeight: "600", fontSize: 13 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: SURFACE2,
    alignItems: "center",
  },
  btnSecondaryText: { color: TEXT, fontWeight: "600", fontSize: 13 },
  btnPrimary: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
