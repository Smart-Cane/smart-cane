// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function Layout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="channel1" options={{ title: "내위치" }} />
      <Tabs.Screen name="channel2" options={{ title: "경로" }} />
    </Tabs>
  );
}
