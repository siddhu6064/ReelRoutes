import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import NavBar from "@/components/NavBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import StagingBanner from "@/components/StagingBanner";

const ImportPage = lazy(() => import("@/pages/ImportPage"));
const ProcessingPage = lazy(() => import("@/pages/ProcessingPage"));
const TripMapPage = lazy(() => import("@/pages/TripMapPage"));
const EditTripPage = lazy(() => import("@/pages/EditTripPage"));
const SharedTripPage = lazy(() => import("@/pages/SharedTripPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
      }}
    >
      Loading…
    </div>
  );
}

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <StagingBanner />
        <NavBar />
        <OfflineBanner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<ImportPage />} />
            <Route path="/processing/:jobId" element={<ProcessingPage />} />
            <Route path="/trips/:tripId" element={<TripMapPage />} />
            <Route path="/trips/:tripId/edit" element={<EditTripPage />} />
            <Route path="/share/:shareToken" element={<SharedTripPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/billing/success" element={<BillingPage />} />
            <Route
              path="*"
              element={
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <h1
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 48,
                      fontWeight: 800,
                      color: "var(--text-faint)",
                    }}
                  >
                    404
                  </h1>
                  <a href="/" style={{ color: "var(--coral)", textDecoration: "underline" }}>
                    Go home
                  </a>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
