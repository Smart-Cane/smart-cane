// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function Layout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="channel1" options={{ title: "채널1" }} />
      <Tabs.Screen name="channel2" options={{ title: "채널2" }} />
      <Tabs.Screen name="channel3" options={{ title: "채널3" }} />
    </Tabs>
  );
}
