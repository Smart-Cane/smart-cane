import KakaoMap from '@/components/KakaoMap';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

export default function Channel1() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setErr('위치 권한 필요'); return; }
        const last = await Location.getLastKnownPositionAsync();
        const p = last ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      } catch (e:any) { setErr(e?.message || '위치 실패'); }
    })();
  }, []);

  if (err)  return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text>{err}</Text></View>;
  if (!pos) return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text>위치 가져오는 중…</Text></View>;
  return <View style={{ flex: 1, padding: 12 }}><KakaoMap lat={pos.lat} lng={pos.lng} /></View>;
}
