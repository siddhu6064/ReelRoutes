/**
 * apps/mobile/app/sign-in.tsx
 *
 * Modal sign-in screen — presented when a guest tries to save a trip.
 * Google OAuth via Clerk Expo SDK.
 */
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useOAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.back();
      }
    } catch (e) {
      console.error("Sign in error:", e);
    }
  }, [startOAuthFlow, router]);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 20 }]}>
      <Pressable style={styles.dismiss} onPress={() => router.back()}>
        <View style={styles.dismissBar} />
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.logo}>◈</Text>
        <Text style={styles.title}>Sign in to ReelRoutes</Text>
        <Text style={styles.sub}>
          Save your trips, sync across devices, and share with friends.
        </Text>

        <Pressable style={styles.googleBtn} onPress={handleGoogleSignIn}>
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleBtnText}>Continue with Google</Text>
        </Pressable>

        <Text style={styles.terms}>
          By continuing, you agree to our{" "}
          <Text style={{ color: CORAL }}>Terms of Service</Text>
          {" "}and{" "}
          <Text style={{ color: CORAL }}>Privacy Policy</Text>.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 12,
  },
  dismiss: { alignItems: "center", paddingVertical: 12 },
  dismissBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER },

  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  logo: { fontSize: 48, color: CORAL },
  title: { color: TEXT, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  sub: { color: MUTED, fontSize: 15, textAlign: "center", lineHeight: 22 },

  googleBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 32,
    marginTop: 8, width: "100%", justifyContent: "center",
  },
  googleIcon: { fontSize: 18, fontWeight: "900", color: "#4285F4" },
  googleBtnText: { color: "#1a1a18", fontWeight: "700", fontSize: 16 },

  terms: { color: MUTED, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 8 },
});
