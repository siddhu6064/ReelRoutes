/**
 * apps/mobile/components/UpgradeSheet.tsx
 *
 * Bottom sheet shown when a free user hits the trip limit or a Pro feature.
 * Opens Stripe Checkout via in-app browser (expo-web-browser).
 */
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCreateCheckout } from "@/api/client";


const SURFACE = "#1a1a18";
const BORDER  = "#2a2a28";
const MUTED   = "#6b6b62";
const TEXT    = "#f0ede8";
const BLUE    = "#1A56DB";


const PRO_FEATURES = [
  { icon: "♾", label: "Unlimited trip imports" },
  { icon: "👥", label: "Collaborate with partners" },
  { icon: "✨", label: "AI spot suggestions" },
  { icon: "📍", label: "Live GPS tracking" },
  { icon: "📤", label: "Export: KML, GeoJSON, GPX" },
  { icon: "📧", label: "Email reservation import" },
  { icon: "🏎", label: "CarPlay navigation" },
  { icon: "📖", label: "Travel book export" },
];

interface Props {
  reason: "trip_limit" | "pro_feature";
  featureName?: string;
  tripCount?: number;
  tripLimit?: number;
  onClose: () => void;
  apiBaseUrl: string;
}

export default function UpgradeSheet({
  reason,
  featureName,
  tripCount,
  tripLimit,
  onClose,
  apiBaseUrl,
}: Props) {
  const { mutateAsync: createCheckout, isPending } = useCreateCheckout();

  const heading =
    reason === "trip_limit"
      ? "Free trip limit reached"
      : `${featureName ?? "This feature"} is Pro only`;

  const body =
    reason === "trip_limit"
      ? `You have ${tripCount} of ${tripLimit} trips saved. Delete a trip or upgrade.`
      : `Upgrade to unlock ${featureName ?? "this feature"} and all Pro benefits.`;

  async function handleUpgrade() {
    try {
      const result = await createCheckout({
        successUrl: `${apiBaseUrl}/billing/success`,
        cancelUrl: `${apiBaseUrl}/billing`,
      });
      const url = (result as { checkout_url: string }).checkout_url;
      await Linking.openURL(url);
      onClose();
    } catch {
      // Silently fail — user can try again
    }
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>✈️</Text>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>

      {/* Price */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>$9.99</Text>
        <Text style={styles.priceUnit}> / month</Text>
      </View>

      {/* Feature grid */}
      <ScrollView
        style={styles.featureScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.featureGrid}>
          {PRO_FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.upgradeBtn, isPending && styles.btnDisabled]}
          onPress={handleUpgrade}
          disabled={isPending}
        >
          <Text style={styles.upgradeBtnText}>
            {isPending ? "Opening checkout…" : "Upgrade to Pro →"}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Maybe later</Text>
        </Pressable>

        <Text style={styles.fine}>Cancel anytime · No contracts</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "85%",
    backgroundColor: SURFACE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  emoji: { fontSize: 36, marginBottom: 8 },
  heading: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  body: {
    color: MUTED,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    paddingVertical: 14,
  },
  price: { color: TEXT, fontSize: 30, fontWeight: "800" },
  priceUnit: { color: MUTED, fontSize: 14 },
  featureScroll: { maxHeight: 200 },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "47%",
    gap: 6,
    marginBottom: 6,
  },
  featureIcon: { fontSize: 16 },
  featureLabel: { color: TEXT, fontSize: 12, flex: 1 },
  actions: {
    padding: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  upgradeBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  upgradeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: MUTED, fontSize: 14 },
  fine: {
    textAlign: "center",
    color: MUTED,
    fontSize: 11,
  },
});
