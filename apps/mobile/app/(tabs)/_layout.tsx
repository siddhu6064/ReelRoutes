/**
 * apps/mobile/app/(tabs)/_layout.tsx
 *
 * Task 3 — Bottom tab navigator with 3 tabs:
 *   Home     — trip dashboard
 *   New Trip — centre + button (jumps to import flow)
 *   Profile  — user account
 */
import { Tabs } from "expo-router";
import { StyleSheet, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Coral accent matching web brand
const CORAL = "#D85A30";
const SURFACE = "#1a1a18";
const MUTED = "#6b6b62";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index: "🗺",
    "new-trip": "+",
    profile: "◉",
  };
  const color = focused ? CORAL : MUTED;
  const icon = icons[name] ?? "○";

  if (name === "new-trip") {
    return (
      <View style={styles.plusWrap}>
        <View style={styles.plusBtn}>
          <Text style={styles.plusText}>+</Text>
        </View>
      </View>
    );
  }

  return <Text style={[styles.tabIcon, { color }]}>{icon}</Text>;
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, { color: focused ? CORAL : MUTED }]}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: SURFACE,
          borderTopColor: "#2a2a28",
          borderTopWidth: 1,
          paddingBottom: insets.bottom,
          height: 56 + insets.bottom,
        },
        tabBarActiveTintColor: CORAL,
        tabBarInactiveTintColor: MUTED,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "My Trips",
          tabBarIcon: ({ focused }) => <TabIcon name="index" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="My Trips" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="new-trip"
        options={{
          title: "Import",
          tabBarIcon: ({ focused }) => <TabIcon name="new-trip" focused={focused} />,
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  plusWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  plusBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CORAL,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: CORAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  plusText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: -2,
  },
});
