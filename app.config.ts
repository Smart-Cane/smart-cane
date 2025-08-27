import 'dotenv/config';
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'smart-cane',
  slug: 'smart-cane',
  scheme: 'smartcane',
  extra: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    KAKAO_JS_KEY: process.env.KAKAO_JS_KEY,
    eas: { projectId: 'ab77c17b-4192-4cf1-97fc-c8880495c2b4' }, // EAS project ID
  },
  android: {
    package: 'com.smart.cane',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    intentFilters: [{ action: 'VIEW', data: [{ scheme: 'smartcane' }] }],
  },
  ios: {
    bundleIdentifier: 'com.smart.cane',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: '길 안내 및 보호자 공유를 위해 위치가 필요합니다.',
    },
  },
  plugins: [
    // HTTP(8082) 로딩 위해 필요. Expo Go에선 적용 안 되므로 Dev Client로 실행.
    ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
  ],
};
export default config;
