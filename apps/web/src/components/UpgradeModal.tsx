/**
 * components/UpgradeModal.tsx
 *
 * Modal shown when a free user hits a billing limit (trip cap or Pro feature).
 * Triggers Stripe Checkout and handles the redirect.
 */
import { useCreateCheckout } from "@/api/client";

interface Props {
  reason: "trip_limit" | "pro_feature";
  featureName?: string;
  tripCount?: number;
  tripLimit?: number;
  onClose: () => void;
}

const PRO_FEATURES = [
  "✓ Unlimited trip imports",
  "✓ Collaboration — invite travel partners",
  "✓ AI spot suggestions",
  "✓ GPS breadcrumb tracking",
  "✓ Export: KML, GeoJSON, GPX, Google Maps",
  "✓ Email reservation import",
  "✓ CarPlay navigation",
  "✓ Travel book export",
];

export default function UpgradeModal({
  reason,
  featureName,
  tripCount,
  tripLimit,
  onClose,
}: Props) {
  const { mutateAsync: createCheckout, isPending } = useCreateCheckout();

  async function handleUpgrade() {
    try {
      const result = await createCheckout({
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: window.location.href,
      });
      window.location.href = (result as { checkout_url: string }).checkout_url;
    } catch {
      alert("Could not start checkout. Please try again.");
    }
  }

  const heading =
    reason === "trip_limit"
      ? "You've reached the free trip limit"
      : `${featureName ?? "This feature"} requires Pro`;

  const body =
    reason === "trip_limit"
      ? `You have ${tripCount} of ${tripLimit} trips saved. Delete a trip to free up a slot, or upgrade to Pro for unlimited trips.`
      : `Unlock ${featureName ?? "this feature"} and everything else Pro has to offer.`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: 32,
          width: "100%",
          maxWidth: 460,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✈️</div>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#111827",
              lineHeight: 1.3,
            }}
          >
            {heading}
          </h2>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              color: "#6B7280",
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
        </div>

        {/* Pro feature list */}
        <div
          style={{
            background: "#F0F9FF",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#1A56DB",
              letterSpacing: "0.05em",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            ReelRoutes Pro — $9.99/month
          </div>
          {PRO_FEATURES.map((f) => (
            <div
              key={f}
              style={{
                fontSize: 13,
                color: "#374151",
                lineHeight: 1.8,
              }}
            >
              {f}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleUpgrade}
            disabled={isPending}
            style={{
              padding: "14px 0",
              background: "#1A56DB",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {isPending ? "Opening checkout…" : "Upgrade to Pro →"}
          </button>

          <button
            onClick={onClose}
            style={{
              padding: "12px 0",
              background: "transparent",
              color: "#6B7280",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Maybe later
          </button>
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#9CA3AF",
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          Cancel anytime from your billing dashboard.
        </p>
      </div>
    </div>
  );
}
