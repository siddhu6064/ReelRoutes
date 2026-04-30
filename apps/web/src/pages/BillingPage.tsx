/**
 * pages/BillingPage.tsx
 *
 * Subscription management page at /billing.
 * Shows current plan, usage, upgrade CTA, or portal link for Pro users.
 * Also handles /billing/success redirect after Stripe Checkout.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePlanStatus, useCreateCheckout, useCreatePortal } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

const PRO_FEATURES = [
  { icon: "♾", label: "Unlimited trip imports" },
  { icon: "👥", label: "Collaborate with travel partners" },
  { icon: "✨", label: "AI spot suggestions" },
  { icon: "📍", label: "Live GPS breadcrumb tracking" },
  { icon: "📤", label: "Export: KML, GeoJSON, GPX, Google Maps" },
  { icon: "📧", label: "Email reservation import" },
  { icon: "🏎", label: "CarPlay integration" },
  { icon: "📖", label: "Travel book PDF export" },
];

export default function BillingPage() {
  const { userId } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [successMsg, setSuccessMsg] = useState("");

  const { data: plan, refetch } = usePlanStatus(userId ?? undefined);
  const { mutateAsync: createCheckout, isPending: checkoutPending } = useCreateCheckout();
  const { mutateAsync: createPortal, isPending: portalPending } = useCreatePortal();

  // Handle post-Stripe success redirect
  useEffect(() => {
    if (location.pathname === "/billing/success") {
      setSuccessMsg("🎉 Welcome to Pro! Your account has been upgraded.");
      void refetch();
    }
  }, [location.pathname, refetch]);

  async function handleUpgrade() {
    try {
      const result = await createCheckout({
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing`,
      });
      const url = (result as { checkout_url: string }).checkout_url;
      window.location.href = url;
    } catch {
      alert("Could not start checkout. Please try again.");
    }
  }

  async function handlePortal() {
    try {
      const result = await createPortal({
        returnUrl: `${window.location.origin}/billing`,
      });
      const url = (result as { portal_url: string }).portal_url;
      window.location.href = url;
    } catch {
      alert("Could not open billing portal. Please try again.");
    }
  }

  const isPro = plan?.plan === "pro";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FAFAF8",
        padding: "40px 20px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            fontSize: 14,
            marginBottom: 24,
            padding: 0,
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
          Billing & Plan
        </h1>

        {/* Success message */}
        {successMsg && (
          <div
            style={{
              background: "#D1FAE5",
              color: "#065F46",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 24,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Current plan card */}
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            border: `2px solid ${isPro ? "#0E9F6E" : "#E5E7EB"}`,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 12,
                  color: "#9CA3AF",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Current Plan
              </span>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: isPro ? "#0E9F6E" : "#111827",
                  marginTop: 4,
                }}
              >
                {isPro ? "⚡ Pro" : "Free"}
              </div>
            </div>
            {isPro && (
              <div
                style={{
                  background: "#ECFDF5",
                  color: "#065F46",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Active
              </div>
            )}
          </div>

          {!isPro && plan && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#374151",
                  marginBottom: 6,
                }}
              >
                <span>Trips saved</span>
                <span>
                  <strong>{plan.trip_count}</strong> / {plan.trip_limit}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "#F3F4F6",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, ((plan.trip_count ?? 0) / (plan.trip_limit ?? 5)) * 100)}%`,
                    background:
                      (plan.trips_remaining ?? 1) === 0 ? "#DC2626" : "#1A56DB",
                    borderRadius: 4,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              {(plan.trips_remaining ?? 0) === 0 && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#DC2626",
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  Trip limit reached. Delete a trip or upgrade to Pro.
                </p>
              )}
            </div>
          )}

          {isPro && (
            <p style={{ fontSize: 14, color: "#6B7280", margin: "8px 0 0" }}>
              Unlimited trips · All Pro features unlocked
            </p>
          )}
        </div>

        {/* Pro features / upgrade */}
        {!isPro && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #E5E7EB",
              padding: 24,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "#1A56DB",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              ReelRoutes Pro
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 32, fontWeight: 800, color: "#111827" }}>
                $9.99
              </span>
              <span style={{ fontSize: 14, color: "#6B7280" }}>/ month</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 24,
              }}
            >
              {PRO_FEATURES.map((f) => (
                <div
                  key={f.label}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ fontSize: 18 }}>{f.icon}</span>
                  <span style={{ fontSize: 13, color: "#374151" }}>{f.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleUpgrade}
              disabled={checkoutPending}
              style={{
                width: "100%",
                padding: "14px 0",
                background: "#1A56DB",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                cursor: checkoutPending ? "not-allowed" : "pointer",
                opacity: checkoutPending ? 0.7 : 1,
              }}
            >
              {checkoutPending ? "Opening checkout…" : "Upgrade to Pro →"}
            </button>
            <p
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "#9CA3AF",
                marginTop: 10,
                marginBottom: 0,
              }}
            >
              Cancel anytime. No contracts.
            </p>
          </div>
        )}

        {/* Portal link for Pro users */}
        {isPro && (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #E5E7EB",
              padding: 24,
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>
              Manage subscription
            </h3>
            <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 16px" }}>
              Update payment method, view invoices, or cancel your subscription.
            </p>
            <button
              onClick={handlePortal}
              disabled={portalPending}
              style={{
                padding: "12px 20px",
                background: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: portalPending ? "not-allowed" : "pointer",
                color: "#374151",
              }}
            >
              {portalPending ? "Opening portal…" : "Open billing portal →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
