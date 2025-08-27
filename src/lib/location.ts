// src/lib/location.ts
import * as Location from 'expo-location';
import { supabase } from './supabase';

/** 내부 유틸: 프로미스 타임아웃 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(to); resolve(v); })
     .catch((e) => { clearTimeout(to); reject(e); });
  });
}

export async function ensureLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('위치 권한 거부됨');
}

/** 마지막 기록이 있으면 우선 사용, 없으면 현재 위치(타임아웃 수동적용) */
export async function getBestEffortPosition(timeoutMs = 8000): Promise<Location.LocationObject> {
  const last = await Location.getLastKnownPositionAsync();
  if (last) return last;

  // getCurrentPositionAsync 은 timeout 옵션이 없으므로 수동 래핑
  const current = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    timeoutMs
  );
  return current;
}

export async function upsertMyLocation(lat: number, lng: number) {
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr || !user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('locations').upsert(
    { user_id: user.id, lat, lng, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

/** 특정 사용자 위치 실시간 구독 */
export function subscribeLocation(
  userId: string,
  onChange: (row: { lat: number; lng: number; updated_at: string }) => void
) {
  const channel = supabase
    .channel(`loc_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'locations', filter: `user_id=eq.${userId}` },
      (payload) => {
        const r = (payload.new ?? payload.old) as any;
        if (r?.lat != null && r?.lng != null) {
          onChange({ lat: Number(r.lat), lng: Number(r.lng), updated_at: r.updated_at });
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
