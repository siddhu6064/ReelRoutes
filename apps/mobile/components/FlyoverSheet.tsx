/**
 * components/FlyoverSheet.tsx
 *
 * Generates and shares a static Mapbox flyover map preview image.
 * Mirrors web FlyoverButton.tsx — generate, preview, share via native sheet.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { API_BASE } from "@/constants/api";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const SURFACE2 = "#232320";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

interface FlyoverData {
  flyover_url: string | null;
  type: string;
  pin_count?: number;
  message?: string;
}

interface Props {
  tripId: string;
  userId?: string;
  visible: boolean;
  onClose: () => void;
}

export function FlyoverSheet({ tripId, userId, visible, onClose }: Props) {
  const [result, setResult] = useState<FlyoverData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", userId);
      const res = await fetch(`${API_BASE}/api/trips/${tripId}/flyover?${params.toString()}`, {
        method: "POST",
      });
      const json = (await res.json()) as { data: FlyoverData };
      setResult(json.data);
    } catch {
      setError("Failed to generate flyover. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    if (!result?.flyover_url) return;
    await Share.share({
      message: `Check out my trip flyover: ${result.flyover_url}`,
      url: result.flyover_url,
    });
  }

  function handleClose() {
    setResult(null);
    setError("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>🎬 Trip flyover</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        <Text style={s.sub}>
          Generate a bird's-eye map preview of your route — shareable to Instagram Stories or
          TikTok.
        </Text>

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={CORAL} />
            <Text style={s.loadingText}>Generating your flyover…</Text>
          </View>
        )}

        {error !== "" && <Text style={s.errorText}>{error}</Text>}

        {result?.flyover_url && !loading && (
          <View style={s.resultBox}>
            <Image source={{ uri: result.flyover_url }} style={s.preview} resizeMode="cover" />
            {result.pin_count && (
              <Text style={s.metaText}>{result.pin_count} stops · ready to share</Text>
            )}
            <Pressable style={s.shareBtn} onPress={handleShare}>
              <Text style={s.shareBtnText}>Share flyover ↗</Text>
            </Pressable>
            <Pressable style={s.regenBtn} onPress={generate}>
              <Text style={s.regenBtnText}>Regenerate</Text>
            </Pressable>
          </View>
        )}

        {result?.message && !result.flyover_url && <Text style={s.msgText}>{result.message}</Text>}

        {!result && !loading && (
          <Pressable style={s.generateBtn} onPress={generate}>
            <Text style={s.generateBtnText}>Generate flyover</Text>
          </Pressable>
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
    backgroundColor: BORDER,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: TEXT, fontSize: 17, fontWeight: "800" },
  close: { color: MUTED, fontSize: 16 },
  sub: { color: MUTED, fontSize: 13, lineHeight: 18 },
  loadingBox: { alignItems: "center", gap: 10, paddingVertical: 20 },
  loadingText: { color: MUTED, fontSize: 13 },
  errorText: { color: "#e05252", fontSize: 13, textAlign: "center" },
  resultBox: { gap: 10 },
  preview: { width: "100%", height: 180, borderRadius: 12 },
  metaText: { color: MUTED, fontSize: 12, textAlign: "center" },
  msgText: { color: MUTED, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  shareBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: "center",
  },
  shareBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  regenBtn: {
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: SURFACE2,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  regenBtnText: { color: MUTED, fontWeight: "600", fontSize: 13 },
  generateBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: "center",
  },
  generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
