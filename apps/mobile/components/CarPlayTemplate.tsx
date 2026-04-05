/**
 * W19 — CarPlay integration.
 * Uses react-native-carplay for the stop list + navigation action.
 *
 * Install: pnpm --filter mobile add react-native-carplay
 *
 * EAS / app.json additions required:
 *   ios.entitlements["com.apple.developer.carplay-maps"] = true
 *   ios.entitlements["com.apple.developer.carplay-navigation"] = true
 *
 * Usage: mount <CarPlayProvider> at app root, then call
 *   CarPlayTemplate.push(tripId, pins) from your trip screen.
 */
import { useEffect } from "react";
import { Platform } from "react-native";

// react-native-carplay exports — typed loosely since the pkg
// may not be installed in the dev environment yet.
type CarPlayApp = {
  onConnect: (callback: () => void) => void;
  onDisconnect: (callback: () => void) => void;
  setRootTemplate: (template: unknown) => void;
};

declare const CarPlay: CarPlayApp | undefined;

interface Pin {
  id: string;
  place_name: string;
  lat: number;
  lng: number;
  order: number;
}

interface CarPlayTemplateOptions {
  tripTitle: string;
  pins: Pin[];
  onNavigateToPin?: (pin: Pin) => void;
}

/**
 * Build and push a CarPlay list template with trip stops.
 * Each stop has a "Navigate" action that opens Apple Maps.
 */
export function pushCarPlayTripTemplate({
  tripTitle,
  pins,
  onNavigateToPin,
}: CarPlayTemplateOptions): void {
  if (Platform.OS !== "ios" || typeof CarPlay === "undefined") return;

  const sorted = [...pins].sort((a, b) => a.order - b.order);

  // Build list items — one per stop
  const items = sorted.map((pin) => ({
    text: pin.place_name,
    detailText: `Stop ${pin.order}`,
    image: undefined,
    // Action: open Apple Maps turn-by-turn for this pin
    actions: [
      {
        title: "Navigate",
        handler: () => {
          onNavigateToPin?.(pin);
          openAppleMaps(pin.lat, pin.lng, pin.place_name);
        },
      },
    ],
  }));

  const listTemplate = {
    type: "CPListTemplate",
    title: tripTitle,
    sections: [
      {
        header: `${sorted.length} stops`,
        items,
      },
    ],
  };

  CarPlay.setRootTemplate(listTemplate);
}

/** Open Apple Maps with turn-by-turn navigation to a lat/lng. */
export function openAppleMaps(lat: number, lng: number, label: string): void {
  const encoded = encodeURIComponent(label);
  const url = `maps://?daddr=${lat},${lng}&dirflg=d&t=m&q=${encoded}`;
  // React Native Linking
  void import("react-native").then(({ Linking }) => {
    void Linking.openURL(url);
  });
}

interface CarPlayProviderProps {
  tripTitle: string;
  pins: Pin[];
}

/**
 * Mount this in your trip screen to automatically push the CarPlay
 * template when a CarPlay session connects.
 */
export function useCarPlayTrip({ tripTitle, pins }: CarPlayProviderProps): void {
  useEffect(() => {
    if (Platform.OS !== "ios" || typeof CarPlay === "undefined") return;

    const handleConnect = () => {
      pushCarPlayTripTemplate({ tripTitle, pins });
    };

    CarPlay.onConnect(handleConnect);

    // If already connected when component mounts
    pushCarPlayTripTemplate({ tripTitle, pins });

    return () => {
      CarPlay.onDisconnect(() => {
        // Cleanup when disconnected
      });
    };
  }, [tripTitle, pins]);
}
