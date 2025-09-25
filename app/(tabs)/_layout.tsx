// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  channel1: "home",
  channel2: "navigate",
  channel3: "chatbubbles",
  explore:  "compass",
};

function TabButton({
  routeName,
  isFocused,
  onPress,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
}) {
  const color = isFocused ? "#0B5FFF" : "#6B7280";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        opacity: pressed ? 0.85 : 1,
      })}
      android_ripple={{ color: "#E5E7EB" }}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={routeName}
    >
      <Ionicons name={ICONS[routeName] ?? "ellipse"} size={24} color={color} />
      {/* 활성 점 인디케이터 */}
      <View
        style={{
          width: 6, height: 6, borderRadius: 3, marginTop: 6,
          backgroundColor: isFocused ? "#0B5FFF" : "transparent",
        }}
      />
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 12, right: 12, bottom: Math.max(insets.bottom, 8),
        backgroundColor: "#FFFFFFCC",
        borderRadius: 18,
        flexDirection: "row",
        paddingHorizontal: 8,
        paddingVertical: 8,
        gap: 6,
        // 은은한 그림자
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
        borderWidth: 0.5,
        borderColor: "#E5E7EB",
      }}
    >
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };
        return (
          <TabButton
            key={route.key}
            routeName={route.name}
            isFocused={isFocused}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}

export default function Layout() {
  const isAndroid = Platform.OS === "android";
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" }, // 기본 탭 숨김
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="channel1" options={{}} />
      <Tabs.Screen name="channel2" options={{}} />
      <Tabs.Screen name="channel3" options={{}} />
      {/* 필요한 탭만 남기고 정리하세요 */}
    </Tabs>
  );
}
