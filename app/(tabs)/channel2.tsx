// app/(tabs)/channel2.tsx
import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const API_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? "";

type Coord = { lat: number; lng: number };
type SearchItem = { id: string; title: string; lat: number; lng: number };

export default function Channel2() {
  const [start, setStart] = useState<Coord | null>(null);
  const [dest, setDest] = useState<Coord | null>(null);
  const [route, setRoute] = useState<Coord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 1) 현재 위치를 출발지로 설정
  useEffect(() => {
    (async () => {
      try {
        if (!API_KEY) throw new Error("EXPO_PUBLIC_KAKAO_JS_KEY 미설정");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("위치 권한 거부됨");

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const s = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStart(s);
      } catch (e: any) {
        setErr(e?.message ?? "현재 위치 확인 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2) 도착지 검색 (Nominatim)
  const searchDest = async () => {
    const query = q.trim();
    if (!query) return;
    setSearching(true);
    setResults([]);
    try {
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=json&limit=8&addressdetails=0&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          // Nominatim 정책상 User-Agent 권장
          "User-Agent": "smart-cane-app/1.0",
        },
      });
      if (!res.ok) throw new Error(`검색 실패 HTTP ${res.status}`);
      const arr: any[] = await res.json();
      const items: SearchItem[] = arr.map((x, i) => ({
        id: String(x.place_id ?? i),
        title: String(x.display_name ?? "Unnamed"),
        lat: Number(x.lat),
        lng: Number(x.lon),
      }));
      setResults(items);
    } catch (e: any) {
      Alert.alert("검색 오류", e?.message ?? "도착지 검색 실패");
    } finally {
      setSearching(false);
    }
  };

  // 3) 경로 계산 (OSRM)
  const fetchRoute = async (s: Coord, d: Coord) => {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${s.lng},${s.lat};${d.lng},${d.lat}` +
        `?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`경로 HTTP ${res.status}`);
      const json = await res.json();
      const coords: [number, number][] | undefined =
        json?.routes?.[0]?.geometry?.coordinates;
      if (!coords?.length) throw new Error("경로 좌표 없음");
      setRoute(coords.map(([lng, lat]) => ({ lat, lng })));
    } catch (e: any) {
      Alert.alert("경로 오류", e?.message ?? "경로 계산 실패");
      setRoute(null);
    }
  };

  // 검색 결과 선택 → 도착지 확정 및 경로 조회
  const onPickDest = (item: SearchItem) => {
    const d = { lat: item.lat, lng: item.lng };
    setDest(d);
    setResults([]);
    if (start) fetchRoute(start, d);
  };

  // 4) Kakao 지도를 그릴 HTML
  const html = useMemo(() => {
    if (!start) return null;
    const s = JSON.stringify(start);
    const d = JSON.stringify(dest);
    const r = JSON.stringify(route ?? []);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  <style>
    html, body, #map { margin:0; padding:0; width:100%; height:100%; }
    .badge {
      position:absolute; top:8px; left:8px; background:#111827; color:#fff;
      padding:6px 10px; border-radius:8px; font-family:system-ui, sans-serif; font-size:12px; opacity:.9;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="badge">경로 미리보기</div>
  <script>
    (function(){
      const API_KEY = '${API_KEY}';
      const START = ${s};
      const DEST  = ${d};
      const ROUTE = ${r};

      function loadSDK(){
        return new Promise(function(resolve, reject){
          var s = document.createElement('script');
          s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + API_KEY + '&autoload=false';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      function init(){
        var center = new kakao.maps.LatLng(START.lat, START.lng);
        var map = new kakao.maps.Map(document.getElementById('map'), { center:center, level:4 });

        // 출발 마커
        new kakao.maps.Marker({ position: center, map });

        // 도착 마커
        if (DEST) {
          new kakao.maps.Marker({
            position: new kakao.maps.LatLng(DEST.lat, DEST.lng),
            map
          });
        }

        // 경로 라인
        if (ROUTE && ROUTE.length){
          var linePath = ROUTE.map(function(p){ return new kakao.maps.LatLng(p.lat, p.lng); });
          var polyline = new kakao.maps.Polyline({
            path: linePath, strokeWeight: 5, strokeColor: '#2563EB', strokeOpacity: .9, strokeStyle: 'solid'
          });
          polyline.setMap(map);

          // 화면 맞춤
          var bounds = new kakao.maps.LatLngBounds();
          linePath.forEach(function(ll){ bounds.extend(ll); });
          map.setBounds(bounds, 32, 32, 32, 32);
        } else {
          map.setCenter(center);
        }
      }
      loadSDK().then(function(){ kakao.maps.load(init); })
               .catch(function(){ document.body.innerHTML = '<div style="padding:16px;font-family:sans-serif">Kakao SDK 로드 실패</div>'; });
    })();
  </script>
</body>
</html>`;
  }, [start, dest, route]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>현재 위치 확인 중…</Text>
      </View>
    );
  }
  if (err) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text>오류: {err}</Text>
      </View>
    );
  }
  if (!start || !html) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Text>초기화 대기 중…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      {/* 검색 UI */}
      <View
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 10,
          backgroundColor: "white",
          padding: 8,
          borderRadius: 12,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 3,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            placeholder="도착지 검색(예: 경복궁)"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={searchDest}
            style={{
              flex: 1,
              backgroundColor: "#F3F4F6",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
            }}
            returnKeyType="search"
          />
          <TouchableOpacity
            onPress={searchDest}
            style={{
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: "#2563EB",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>검색</Text>
          </TouchableOpacity>
        </View>

        {/* 검색 결과 목록 */}
        {searching ? (
          <View style={{ paddingVertical: 6 }}>
            <ActivityIndicator />
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(it) => it.id}
            style={{
              maxHeight: 260,
              borderTopWidth: 1,
              borderColor: "#E5E7EB",
              marginTop: 4,
            }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onPickDest(item)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  borderBottomWidth: 1,
                  borderColor: "#F3F4F6",
                }}
              >
                <Text numberOfLines={2} style={{ fontSize: 14 }}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            )}
          />
        ) : null}
      </View>

      {/* 지도 WebView */}
      <View style={{ flex: 1 }}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          javaScriptEnabled
          domStorageEnabled
          onHttpError={(e) =>
            Alert.alert("HTTP 오류", String(e?.nativeEvent?.statusCode ?? ""))
          }
          onError={() => Alert.alert("WebView 오류", "지도를 불러올 수 없습니다.")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
