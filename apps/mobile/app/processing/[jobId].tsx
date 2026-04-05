/**
 * apps/mobile/app/processing/[jobId].tsx
 *
 * Task 7 — Processing screen: 5-step animated progress bar
 * polling GET /api/jobs/:jobId every 3 seconds.
 * Redirects to trip map when completed.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useJobStatus } from "@/api/client";

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";
const ERROR = "#e05252";

const STEPS = [
  { key: "fetching_video", label: "Fetching video" },
  { key: "transcribing", label: "Transcribing audio" },
  { key: "extracting_locations", label: "Finding locations" },
  { key: "geocoding", label: "Geocoding places" },
  { key: "finalizing", label: "Building trip" },
];

export default function ProcessingScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: status } = useJobStatus(jobId ?? null);

  // Redirect when complete
  useEffect(() => {
    if (status?.status === "completed") {
      const tripId = (status as any).tripId ?? "demo";
      setTimeout(() => router.replace(`/trip/${tripId}`), 600);
    }
  }, [status]);

  const progress = status?.progress ?? 0;
  const failed = status?.status === "failed";
  const activeStep = STEPS.findIndex((s) => s.key === status?.currentStep);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      {/* Animated icon */}
      <View style={styles.iconWrap}>
        <View style={[styles.icon, failed && styles.iconFailed]}>
          <Text style={styles.iconText}>{failed ? "✕" : "◈"}</Text>
        </View>
      </View>

      <Text style={styles.title}>
        {failed ? "Processing failed" : "Extracting your trip…"}
      </Text>

      {failed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{status?.error ?? "An unexpected error occurred."}</Text>
          <Pressable style={styles.retryBtn} onPress={() => router.replace("/new-trip")}>
            <Text style={styles.retryBtnText}>Try a different URL</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.pct}>{progress}%</Text>

          {/* Step list */}
          <View style={styles.steps}>
            {STEPS.map((step, i) => {
              const done = i < activeStep || progress === 100;
              const active = i === activeStep && progress < 100;
              return (
                <View
                  key={step.key}
                  style={[
                    styles.step,
                    done && styles.stepDone,
                    active && styles.stepActive,
                  ]}
                >
                  <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                    {done && <Text style={styles.stepCheck}>✓</Text>}
                  </View>
                  <Text style={[styles.stepLabel, (done || active) && styles.stepLabelVisible]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {status?.progressMessage && (
            <Text style={styles.message}>{status.progressMessage}</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0f0d",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 20,
  },

  iconWrap: { marginTop: 20 },
  icon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: CORAL,
    alignItems: "center", justifyContent: "center",
    shadowColor: CORAL, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
  },
  iconFailed: { backgroundColor: ERROR },
  iconText: { color: "#fff", fontSize: 28, fontWeight: "900" },

  title: {
    color: TEXT, fontSize: 22, fontWeight: "800",
    letterSpacing: -0.5, textAlign: "center",
  },

  progressTrack: {
    width: "100%", height: 6,
    backgroundColor: SURFACE, borderRadius: 999, overflow: "hidden",
  },
  progressFill: {
    height: "100%", backgroundColor: CORAL,
    borderRadius: 999,
  },
  pct: { color: CORAL, fontSize: 13, fontWeight: "700" },

  steps: { width: "100%", gap: 8 },
  step: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 12,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER,
  },
  stepDone: { borderColor: BORDER },
  stepActive: { borderColor: CORAL, backgroundColor: "#2a1a10" },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
  },
  stepDotDone: { borderColor: "#4caf50", backgroundColor: "#4caf5020" },
  stepDotActive: { borderColor: CORAL, backgroundColor: "#D85A3020" },
  stepCheck: { color: "#4caf50", fontSize: 12, fontWeight: "800" },
  stepLabel: { color: MUTED, fontSize: 13, fontWeight: "500" },
  stepLabelVisible: { color: TEXT },

  message: { color: MUTED, fontSize: 12, fontStyle: "italic", textAlign: "center" },

  errorBox: {
    backgroundColor: "#2a0f0f", borderRadius: 14,
    borderWidth: 1, borderColor: ERROR,
    padding: 20, width: "100%", gap: 16, alignItems: "center",
  },
  errorText: { color: ERROR, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    backgroundColor: SURFACE, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 24,
  },
  retryBtnText: { color: TEXT, fontWeight: "700", fontSize: 13 },
});
