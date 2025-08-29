// @/components/KakaoMap.tsx // 하드코딩 정적 출력
import React from 'react';
import { AccessibilityInfo, Alert, View } from 'react-native';
import { WebView } from 'react-native-webview';
const API_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
interface KakaoMapProps {
  lat: number;
  lng: number;
  level?: number;
}

const KakaoMap: React.FC<KakaoMapProps> = ({ lat, lng, level = 3 }) => {

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>카카오맵</title>
        <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; }
            #map { width: 100%; height: 100vh; }
            .info-window {
                padding: 10px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                font-size: 14px;
                max-width: 200px;
            }
            .loading {
                text-align: center;
                padding: 20px;
                font-size: 16px;
            }
        </style>
    </head>
    <body>
        <div id="loading" class="loading">카카오맵 로딩 중...</div>
        <div id="map" style="display: none;"></div>
        
        <script>
            // 카카오맵 API 키 (하드코딩)
             const API_KEY = '${API_KEY}';
            
            // 동적으로 스크립트 로딩
            function loadKakaoScript() {
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = \`https://dapi.kakao.com/v2/maps/sdk.js?appkey=\${API_KEY}&libraries=services,clusterer,drawing&autoload=false\`;
                    
                    script.onload = function() {
                        resolve();
                    };
                    
                    script.onerror = function(error) {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'error',
                            message: '카카오맵 스크립트 로드 실패'
                        }));
                        reject(error);
                    };
                    
                    document.head.appendChild(script);
                });
            }

            let map, marker, geocoder;
            let currentAddress = '';

            function initMap() {
                try {
                    if (typeof kakao === 'undefined' || !kakao.maps) {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'error',
                            message: '카카오 SDK 로드 실패'
                        }));
                        return;
                    }

                    const container = document.getElementById('map');
                    const loading = document.getElementById('loading');
                    
                    if (!container) {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'error',
                            message: '지도 컨테이너를 찾을 수 없습니다'
                        }));
                        return;
                    }

                    // 로딩 화면 숨기고 지도 표시
                    loading.style.display = 'none';
                    container.style.display = 'block';

                    const options = {
                        center: new kakao.maps.LatLng(${lat}, ${lng}),
                        level: ${level}
                    };
                    
                    map = new kakao.maps.Map(container, options);
                    geocoder = new kakao.maps.services.Geocoder();

                    // 현재 위치 마커 추가
                    const markerPosition = new kakao.maps.LatLng(${lat}, ${lng});
                    marker = new kakao.maps.Marker({
                        position: markerPosition,
                        map: map
                    });

                    // 주소 검색 (선택적)
                    searchAddress(${lat}, ${lng});

                    // 지도 클릭 이벤트
                    kakao.maps.event.addListener(map, 'click', function(mouseEvent) {
                        const latlng = mouseEvent.latLng;
                        marker.setPosition(latlng);
                        searchAddress(latlng.getLat(), latlng.getLng());
                        
                        // React Native로 위치 정보 전송
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'locationChanged',
                            lat: latlng.getLat(),
                            lng: latlng.getLng(),
                            address: currentAddress
                        }));
                    });

                    // 지도 로드 완료 알림
                    window.ReactNativeWebView?.postMessage(JSON.stringify({
                        type: 'mapLoaded',
                        lat: ${lat},
                        lng: ${lng}
                    }));

                } catch (error) {
                    window.ReactNativeWebView?.postMessage(JSON.stringify({
                        type: 'error',
                        message: '지도 초기화 실패: ' + error.message
                    }));
                }
            }

            function searchAddress(lat, lng) {
                if (!geocoder) return;

                geocoder.coord2Address(lng, lat, function(result, status) {
                    if (status === kakao.maps.services.Status.OK) {
                        const addr = result[0].address;
                        currentAddress = addr.address_name;
                        
                        // 정보창 표시
                        const infowindow = new kakao.maps.InfoWindow({
                            content: '<div class="info-window"><strong>현재 위치</strong><br>' + currentAddress + '</div>',
                            removable: true
                        });
                        infowindow.open(map, marker);

                        // React Native로 주소 정보 전송
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'addressFound',
                            address: currentAddress,
                            lat: lat,
                            lng: lng
                        }));
                    }
                });
            }

            // 페이지 로드 완료 후 스크립트 동적 로딩
            window.addEventListener('load', async function() {
                try {
                    await loadKakaoScript();
                    
                    if (typeof kakao === 'undefined' || !kakao.maps) {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'error',
                            message: '카카오 SDK 로드 실패'
                        }));
                        return;
                    }
                    
                    kakao.maps.load(function() {
                        initMap();
                    });
                    
                } catch (error) {
                    window.ReactNativeWebView?.postMessage(JSON.stringify({
                        type: 'error',
                        message: '스크립트 로딩 실패: ' + error.message
                    }));
                }
            });
        </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'mapLoaded':
          console.log('지도 로드 완료');
          Alert.alert('성공', '지도가 로드되었습니다');
          AccessibilityInfo.announceForAccessibility('지도가 로드되었습니다');
          break;
          
        case 'addressFound':
          console.log('주소:', data.address);
          AccessibilityInfo.announceForAccessibility(`현재 위치: ${data.address}`);
          break;
          
        case 'locationChanged':
          console.log('위치 변경:', `${data.lat}, ${data.lng}`);
          AccessibilityInfo.announceForAccessibility('새로운 위치로 이동했습니다');
          break;
          
        case 'error':
          console.error('지도 오류:', data.message);
          Alert.alert('지도 오류', data.message);
          break;
      }
    } catch (error) {
      console.error('메시지 파싱 오류:', error);
    }
  };

  return (
    <View 
      style={{ flex: 1 }} 
      accessible={true}
      accessibilityLabel="카카오 지도 화면"
      accessibilityHint="지도를 터치하여 위치를 변경할 수 있습니다"
    >
      <WebView
        source={{ html: htmlContent }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        originWhitelist={['*']}
        userAgent="Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36"
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView 오류:', nativeEvent);
          Alert.alert('WebView 오류', '지도를 불러올 수 없습니다');
        }}
        accessible={true}
        accessibilityLabel="카카오 지도"
      />
    </View>
  );
};

export default KakaoMap;