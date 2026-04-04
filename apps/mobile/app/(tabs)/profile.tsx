/**
 * apps/mobile/app/(tabs)/profile.tsx
 *
 * Task 8 — Profile screen: shows user info when signed in,
 * Google OAuth / email sign-in prompt when signed out.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth, useUser, useOAuth } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useCallback } from "react";

WebBrowser.maybeCompleteAuthSession();

const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const BORDER = "#2a2a28";
const MUTED = "#6b6b62";
const TEXT = "#f0ede8";

function SignedOutView() {
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const handleGoogleSignIn = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (e) {
      console.error("OAuth error", e);
    }
  }, [startOAuthFlow]);

  return (
    <View style={styles.centered}>
      <Text style={styles.signInIcon}>◉</Text>
      <Text style={styles.signInTitle}>Sign in to save trips</Text>
      <Text style={styles.signInSub}>
        Your trips sync across devices and you can share them with anyone.
      </Text>
      <Pressable style={styles.googleBtn} onPress={handleGoogleSignIn}>
        <Text style={styles.googleBtnText}>Continue with Google</Text>
      </Pressable>
      <Text style={styles.guestNote}>
        You can also import trips as a guest — they'll save locally until you sign in.
      </Text>
    </View>
  );
}

function SignedInView() {
  const { signOut } = useAuth();
  const { user } = useUser();

  return (
    <View style={styles.container}>
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "?"}
          </Text>
        </View>
        <Text style={styles.name}>
          {user?.firstName && user?.lastName
            ? `${user.firstName} ${user.lastName}`
            : user?.emailAddresses?.[0]?.emailAddress ?? "ReelRoutes User"}
        </Text>
        <Text style={styles.email}>
          {user?.emailAddresses?.[0]?.emailAddress ?? ""}
        </Text>
      </View>

      {/* Settings rows */}
      <View style={styles.section}>
        {[
          { label: "Rate ReelRoutes ⭐", action: () => {} },
          { label: "Share the app", action: () => {} },
          { label: "Privacy policy", action: () => {} },
          { label: "Terms of service", action: () => {} },
        ].map((row) => (
          <Pressable key={row.label} style={styles.row} onPress={row.action}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.signOutBtn} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Text style={styles.version}>ReelRoutes v0.1.0</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>
      {isSignedIn ? <SignedInView /> : <SignedOutView />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0f0d" },
  header: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { color: TEXT, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },

  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 14,
  },
  signInIcon: { fontSize: 48, color: CORAL },
  signInTitle: { color: TEXT, fontSize: 22, fontWeight: "800", textAlign: "center" },
  signInSub: { color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20 },
  googleBtn: {
    backgroundColor: "#fff", borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: 8,
  },
  googleBtnText: { color: "#1a1a18", fontWeight: "700", fontSize: 15 },
  guestNote: { color: MUTED, fontSize: 12, textAlign: "center", lineHeight: 18, marginTop: 4 },

  container: { flex: 1, paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  avatarWrap: { alignItems: "center", gap: 8, paddingVertical: 16 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: CORAL, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { color: TEXT, fontSize: 18, fontWeight: "700" },
  email: { color: MUTED, fontSize: 13 },

  section: {
    backgroundColor: SURFACE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  rowLabel: { color: TEXT, fontSize: 14 },
  rowChevron: { color: MUTED, fontSize: 18 },

  signOutBtn: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingVertical: 14, alignItems: "center",
  },
  signOutText: { color: MUTED, fontSize: 14, fontWeight: "600" },
  version: { color: BORDER, fontSize: 11, textAlign: "center", marginTop: "auto", paddingBottom: 20 },
});
