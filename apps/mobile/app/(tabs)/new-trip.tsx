/**
 * apps/mobile/app/(tabs)/new-trip.tsx
 *
 * Import screen — handles three entry paths:
 *
 *   1. Manual paste: user types/pastes a URL directly
 *   2. iOS Share Sheet: user taps Share → ReelRoutes from YouTube/Instagram/TikTok etc.
 *      The native Share Extension (expo-share-intent) captures the URL and
 *      passes it here via useShareIntentContext — no user action needed
 *   3. Android Share Intent: same hook, same code — expo-share-intent
 *      unifies both platforms
 *
 * When a share intent arrives, the URL auto-populates and import begins
 * automatically after 600ms (gives the user a moment to see it).
 */
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useProcessVideo } from "@/api/client";
import { useShareIntent, SUPPORTED_PLATFORMS, detectPlatform } from "@/hooks/useShareIntent";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const ERROR = "#e05252";
const GREEN = "#4ade80";

// Platform detection and SUPPORTED_PLATFORMS live in @/hooks/useShareIntent

export default function NewTripScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAuth();
  const { incomingUrl, sourceName, hasIntent, clearIntent } = useShareIntent();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [sharedFrom, setSharedFrom] = useState<string | null>(null);
  const { mutateAsync: processVideo, isPending } = useProcessVideo();

  // ── Handle incoming share intent (iOS Share Sheet + Android intent) ──
  // useShareIntent extracts and normalises the URL from expo-share-intent.
  // Auto-start fires 600ms after arrival so the user sees the populated field.
  useEffect(() => {
    if (!hasIntent || !incomingUrl) return;

    setUrl(incomingUrl);
    setSharedFrom(sourceName);

    const timer = setTimeout(() => {
      void handleImport(incomingUrl);
    }, 600);

    return () => clearTimeout(timer);
  }, [hasIntent, incomingUrl]);

  const platform = url.trim() ? detectPlatform(url.trim()) : null;

  async function handleImport(importUrl?: string) {
    const trimmed = (importUrl ?? url).trim();
    if (!trimmed) {
      setError("Please paste a video URL.");
      return;
    }
    if (!detectPlatform(trimmed)) {
      setError("URL must be from YouTube, Instagram, TikTok, Facebook, or X.");
      return;
    }
    setError("");
    try {
      const result = await processVideo({ url: trimmed, ...(userId ? { userId } : {}) });
      clearIntent();
      router.push(`/processing/${result.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Import a video</Text>
        <Text style={styles.sub}>
          Paste any travel video URL — or share directly from YouTube, Instagram, TikTok, and more.
        </Text>

        {/* Shared-from confirmation banner */}
        {sharedFrom && url && (
          <View style={styles.sharedBanner}>
            <Text style={styles.sharedIcon}>✓</Text>
            <Text style={styles.sharedText}>
              Shared from {sharedFrom}
              {isPending ? " — importing…" : " — tap Import to continue"}
            </Text>
          </View>
        )}

        {/* URL input */}
        <View style={[styles.inputWrap, platform ? styles.inputActive : null]}>
          <Text style={styles.inputIcon}>🔗</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(t) => {
              setUrl(t);
              setError("");
              setSharedFrom(null);
            }}
            placeholder="Paste video URL here…"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => handleImport()}
            selectTextOnFocus
          />
          {url.trim() !== "" && (
            <Pressable
              onPress={() => {
                setUrl("");
                setSharedFrom(null);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>

        {platform && (
          <View style={styles.detectedRow}>
            <View style={styles.detectedDot} />
            <Text style={styles.detectedText}>{platform} detected</Text>
          </View>
        )}

        {error !== "" && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.btn, (!url.trim() || isPending) && styles.btnDisabled]}
          onPress={() => handleImport()}
          disabled={!url.trim() || isPending}
        >
          <Text style={styles.btnText}>{isPending ? "Extracting trip…" : "Extract Trip →"}</Text>
        </Pressable>

        {/* Platform chips */}
        <View style={styles.platforms}>
          {SUPPORTED_PLATFORMS.map((p) => (
            <View key={p.label} style={[styles.chip, platform === p.label && styles.chipActive]}>
              <Text style={[styles.chipText, platform === p.label && styles.chipTextActive]}>
                {p.label}
              </Text>
            </View>
          ))}
        </View>


        {/* Plan from Scratch */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
        <Pressable
          style={styles.planBtn}
          onPress={() => router.push("/plan-wizard")}
        >
          <Text style={styles.planBtnText}>✨  Plan from scratch with AI</Text>
          <Text style={styles.planBtnSub}>Tell us where you're going — AI builds the itinerary</Text>
        </Pressable>

        {/* Native share tip */}
        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>💡 Use the native Share button</Text>
          <Text style={styles.tipText}>
            In YouTube, Instagram, TikTok, or any browser — tap the{" "}
            <Text style={styles.tipBold}>Share</Text> button and choose{" "}
            <Text style={styles.tipBold}>ReelRoutes</Text>. Import starts automatically.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0f0d" },
  content: { paddingHorizontal: 20, gap: 16 },

  title: { color: TEXT, fontSize: 28, fontWeight: "800", letterSpacing: -0.8 },
  sub: { color: MUTED, fontSize: 15, lineHeight: 22 },

  sharedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
    borderRadius: 10,
    padding: 12,
  },
  sharedIcon: { color: GREEN, fontSize: 16, fontWeight: "800" },
  sharedText: { color: GREEN, fontSize: 13, fontWeight: "600", flex: 1 },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  inputActive: { borderColor: CORAL },
  inputIcon: { paddingLeft: 14, fontSize: 18 },
  input: { flex: 1, paddingHorizontal: 10, paddingVertical: 16, color: TEXT, fontSize: 15 },
  clearBtn: { paddingRight: 14, padding: 8 },
  clearBtnText: { color: MUTED, fontSize: 14 },

  detectedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detectedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: CORAL },
  detectedText: { color: CORAL, fontSize: 12, fontWeight: "700" },

  error: { color: ERROR, fontSize: 13 },

  btn: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: CORAL,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },

  platforms: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { borderColor: CORAL },
  chipText: { color: MUTED, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: CORAL },


  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { color: MUTED, fontSize: 12, fontWeight: "600" },
  planBtn: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#3a3a38",
    padding: 18,
    gap: 4,
  },
  planBtnText: { color: TEXT, fontWeight: "800", fontSize: 16 },
  planBtnSub: { color: MUTED, fontSize: 13, lineHeight: 18 },
  tipBox: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 6,
    marginTop: 4,
  },
  tipTitle: { color: TEXT, fontSize: 13, fontWeight: "700" },
  tipText: { color: MUTED, fontSize: 12, lineHeight: 18 },
  tipBold: { color: TEXT, fontWeight: "700" },
});
