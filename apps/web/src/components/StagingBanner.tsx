/**
 * components/StagingBanner.tsx
 *
 * Fixed top banner shown only when VITE_ENV=staging.
 * Gives QA testers an unmistakable visual signal that they
 * are NOT on production. Zero cost in production builds —
 * the component renders null when VITE_ENV !== "staging".
 */

const IS_STAGING = import.meta.env.VITE_ENV === "staging";

export default function StagingBanner(): React.ReactElement | null {
  if (!IS_STAGING) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background:
          "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 10px, #fbbf24 10px, #fbbf24 20px)",
        color: "#1c1917",
        textAlign: "center",
        fontSize: "12px",
        fontWeight: "800",
        letterSpacing: "0.1em",
        padding: "4px 0",
        userSelect: "none",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      ⚠ STAGING ENVIRONMENT — Not production · Data may be wiped at any time ⚠
    </div>
  );
}
