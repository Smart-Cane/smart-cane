import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

type NaviOpts = {
  name?: string;              // 목적지명
  coordType?: 'wgs84'|'katec' // 기본 wgs84(위경도)
  rpoption?: number;          // 경로옵션(선택)
};

export async function openKakaoNavi(lat: number, lng: number, opts: NaviOpts = {}) {
  const name = encodeURIComponent(opts.name ?? '목적지');
  const coordType = opts.coordType ?? 'wgs84';
  const qs = `y=${lat}&x=${lng}&name=${name}&coord_type=${coordType}` + (opts.rpoption ? `&rpoption=${opts.rpoption}` : '');
  const url = `kakaonavi://navigate?${qs}`;

  const can = await Linking.canOpenURL(url);
  if (can) return Linking.openURL(url);

  // 미설치 시 스토어/검색으로 유도(정확한 ID 모를 때 안전한 기본값)
  if (Platform.OS === 'android') {
    const play = 'market://search?q=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%82%B4%EB%B9%84';
    const web  = 'https://play.google.com/store/search?q=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%82%B4%EB%B9%84&c=apps';
    try { await Linking.openURL(play); } catch { await Linking.openURL(web); }
  } else {
    const iosSearch = 'https://apps.apple.com/kr/search?term=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%82%B4%EB%B9%84';
    await Linking.openURL(iosSearch);
  }
}
