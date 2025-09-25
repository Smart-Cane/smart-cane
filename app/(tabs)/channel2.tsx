// app/(tabs)/channel2.tsx
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

const API_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? ""; // Kakao JS 지도 표시용

type Coord = { lat: number; lng: number };
type SearchItem = { id: string; title: string; lat: number; lng: number };

type OsrmStep = {
  distance: number;
  duration: number;
  name: string;
  geometry?: any;
  intersections?: any[];
  maneuver: {
    type:
      | "depart"
      | "arrive"
      | "turn"
      | "new name"
      | "merge"
      | "on ramp"
      | "off ramp"
      | "fork"
      | "roundabout"
      | "rotary"
      | "end of road"
      | "continue"
      | "use lane";
    modifier?:
      | "uturn"
      | "sharp right"
      | "right"
      | "slight right"
      | "straight"
      | "slight left"
      | "left"
      | "sharp left";
    location: [number, number]; // [lon, lat]
    exit?: number; // roundabout
  };
};

function haversine(a: Coord, b: Coord) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function speakKo(s: string) {
  try {
    Speech.stop();
    Speech.speak(s, { language: "ko-KR", pitch: 1.0, rate: 1.0 });
  } catch {}
}

function phraseFromStep(step: OsrmStep, when: "ahead" | "now") {
  const m = step.maneuver;
  const distM = Math.max(0, Math.round(step.distance)); // fallback
  const ahead = when === "ahead";
  const baseAhead = (txt: string) => `${distM >= 20 ? `${Math.min(distM, 200)}미터 앞 ` : ""}${txt}`;
  const baseNow = (txt: string) => `지금 ${txt}`;
  const turnWord = (mod?: string) => {
    switch (mod) {
      case "left":
      case "sharp left":
      case "slight left":
        return "좌회전하세요";
      case "right":
      case "sharp right":
      case "slight right":
        return "우회전하세요";
      case "uturn":
        return "유턴하세요";
      case "straight":
      default:
        return "직진하세요";
    }
  };

  switch (m.type) {
    case "depart":
      return ahead ? "안내를 시작합니다. 출발합니다." : "출발합니다.";
    case "arrive":
      return ahead ? "곧 목적지입니다." : "목적지에 도착했습니다.";
    case "turn":
    case "end of road":
    case "continue":
      return ahead ? baseAhead(turnWord(m.modifier)) : baseNow(turnWord(m.modifier));
    case "on ramp":
      return ahead ? baseAhead("램프로 진입하세요") : baseNow("램프로 진입하세요");
    case "off ramp":
      return ahead ? baseAhead("램프에서 빠져나가세요") : baseNow("램프에서 빠져나가세요");
    case "fork":
      return ahead ? baseAhead("갈림길에서 안내에 따라 진행하세요") : baseNow("갈림길 진행");
    case "merge":
      return ahead ? baseAhead("차로를 합류하세요") : baseNow("차로 합류");
    case "roundabout":
    case "rotary":
      if (typeof m.exit === "number") {
        const nth = `${m.exit}번째 출구`;
        return ahead ? baseAhead(`로터리에서 ${nth}로 나가세요`) : baseNow(`로터리 ${nth}로 나가세요`);
      }
      return ahead ? baseAhead("로터리를 통과하세요") : baseNow("로터리를 통과하세요");
    default:
      return ahead ? baseAhead("안내를 따르세요") : "안내를 따르세요";
  }
}

export default function Channel2() {
  const [start, setStart] = useState<Coord | null>(null);
  const [dest, setDest] = useState<Coord | null>(null);
  const [routeLine, setRouteLine] = useState<Coord[] | null>(null);
  const [steps, setSteps] = useState<OsrmStep[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const watchSub = useRef<Location.LocationSubscription | null>(null);
  const nextIdxRef = useRef(0);
  const announcedAheadRef = useRef<boolean>(false);
  const lastSpeakTs = useRef<number>(0);

  const AHEAD_DIST = 50; // m: 예고 안내
  const NOW_DIST = 12; // m: 즉시 안내
  const REROUTE_DIST = 80; // m: 경로 이탈 시 재탐색

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("위치 권한이 필요합니다");
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        speakKo("현재 위치를 출발지로 설정했습니다. 도착지를 검색해 주세요.");
      } catch (e: any) {
        setErr(e?.message ?? "현재 위치 확인 실패");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      watchSub.current?.remove();
      watchSub.current = null;
      Speech.stop();
    };
  }, []);

  // 검색: Nominatim
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
        headers: { "User-Agent": "smart-cane-voice/1.0" },
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

  // 경로 계산(OSRM, steps=true)
  const fetchRoute = async (s: Coord, d: Coord) => {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/foot/` + // 보행자 경로: 필요에 따라 driving 로 변경
        `${s.lng},${s.lat};${d.lng},${d.lat}` +
        `?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`경로 HTTP ${res.status}`);
      const json = await res.json();
      const coords: [number, number][] | undefined =
        json?.routes?.[0]?.geometry?.coordinates;
      const legSteps: OsrmStep[] | undefined = json?.routes?.[0]?.legs?.[0]?.steps;
      if (!coords?.length || !legSteps?.length) throw new Error("경로 또는 단계 정보 없음");

      setRouteLine(coords.map(([lng, lat]) => ({ lat, lng })));
      setSteps(legSteps);
      nextIdxRef.current = 0;
      announcedAheadRef.current = false;

      speakKo("경로를 안내합니다. 안전에 유의하세요.");

      // 위치 추적 시작 / 재시작
      watchSub.current?.remove();
      watchSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        (pos) => onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }, legSteps)
      );
    } catch (e: any) {
      Alert.alert("경로 오류", e?.message ?? "경로 계산 실패");
      setRouteLine(null);
      setSteps(null);
      watchSub.current?.remove();
      watchSub.current = null;
    }
  };

  const onPickDest = (item: SearchItem) => {
    const d = { lat: item.lat, lng: item.lng };
    setDest(d);
    setResults([]);
    if (start) fetchRoute(start, d);
  };

  function onLocation(me: Coord, stepList: OsrmStep[]) {
    const nowTs = Date.now();
    // 과도한 반복 방지
    if (nowTs - lastSpeakTs.current < 900) {
      // 0.9s 내 재발화 금지
    }

    // 경로 이탈 감지(간단: 경로 선분 중 최소 거리 > 임계)
    if (routeLine && routeLine.length > 2) {
      let min = Number.POSITIVE_INFINITY;
      for (let i = 1; i < routeLine.length; i++) {
        const a = routeLine[i - 1],
          b = routeLine[i];
        // 점-선분 거리 근사: 두 끝점 거리의 최소값으로 간략화(실서비스는 정확한 점-선분 거리 사용 권장)
        min = Math.min(min, haversine(me, a), haversine(me, b));
        if (min < 5) break;
      }
      if (min > REROUTE_DIST && dest) {
        speakKo("경로에서 벗어났습니다. 경로를 재탐색합니다.");
        fetchRoute(me, dest);
        return;
      }
    }

    const i = nextIdxRef.current;
    if (i >= stepList.length) return;

    const step = stepList[i];
    const target: Coord = { lat: step.maneuver.location[1], lng: step.maneuver.location[0] };
    const d = haversine(me, target);

    // 예고
    if (!announcedAheadRef.current && d <= AHEAD_DIST && d > NOW_DIST) {
      speakKo(phraseFromStep(step, "ahead"));
      announcedAheadRef.current = true;
      lastSpeakTs.current = nowTs;
      return;
    }
    // 즉시
    if (d <= NOW_DIST) {
      speakKo(phraseFromStep(step, "now"));
      nextIdxRef.current = i + 1;
      announcedAheadRef.current = false;
      lastSpeakTs.current = nowTs;

      // 도착 단계 다음에 끝
      if (step.maneuver.type === "arrive") {
        watchSub.current?.remove();
        watchSub.current = null;
      }
    }
  }

  // Kakao 지도 HTML (경로 미리보기)
  const html = useMemo(() => {
    if (!start) return null;
    const s = JSON.stringify(start);
    const d = JSON.stringify(dest);
    const r = JSON.stringify(routeLine ?? []);
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%} .badge{position:absolute;top:8px;left:8px;background:#111827;color:#fff;padding:6px 10px;border-radius:8px;font-family:sans-serif;font-size:12px;opacity:.9}</style>
</head><body>
<div id="map"></div><div class="badge">음성 길안내(미리보기)</div>
<script>(function(){
  const API_KEY='${API_KEY}';
  const START=${s};
  const DEST=${d};
  const ROUTE=${r};
  function load(){return new Promise((ok,ng)=>{var s=document.createElement('script');s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+API_KEY+'&autoload=false';s.onload=ok;s.onerror=ng;document.head.appendChild(s);});}
  function init(){
    var map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(START.lat,START.lng),level:4});
    new kakao.maps.Marker({position:new kakao.maps.LatLng(START.lat,START.lng),map});
    if(DEST) new kakao.maps.Marker({position:new kakao.maps.LatLng(DEST.lat,DEST.lng),map});
    if(ROUTE&&ROUTE.length){
      var line=ROUTE.map(p=>new kakao.maps.LatLng(p.lat,p.lng));
      new kakao.maps.Polyline({path:line,strokeWeight:5,strokeColor:'#2563EB',strokeOpacity:.9,strokeStyle:'solid'}).setMap(map);
      var b=new kakao.maps.LatLngBounds(); line.forEach(ll=>b.extend(ll)); map.setBounds(b,32,32,32,32);
    }
  }
  load().then(()=>kakao.maps.load(init)).catch(()=>{document.body.innerHTML='<div style="padding:16px;font-family:sans-serif">Kakao SDK 로드 실패</div>';});
})();</script>
</body></html>`;
  }, [start, dest, routeLine]);

  // UI 상태
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
            placeholder="도착지 검색(예: 서울역)"
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

        {searching ? (
          <View style={{ paddingVertical: 6 }}>
            <ActivityIndicator />
          </View>
        ) : results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={(it) => it.id}
            style={{ maxHeight: 260, borderTopWidth: 1, borderColor: "#E5E7EB", marginTop: 4 }}
            keyboardShouldPersistTaps="handled"
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