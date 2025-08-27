// @/components/KakaoMap.tsx // env 받아오기 
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
  //  //API 키 로딩 상태 로그 -> 잘 출력 됨.
  console.log('환경변수 API_KEY:', API_KEY);
  console.log('API_KEY 길이:', API_KEY?.length);
  console.log('API_KEY가 비어있는가:', !API_KEY || API_KEY === '');
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
            // 먼저 스크립트 로딩 상태 확인
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'debug',
                message: '스크립트 시작됨'
            }));

            // React Native에서 전달받은 API 키 사용
            const API_KEY = '${API_KEY}';
            
            // API 키가 없는 경우 에러 처리
            if (!API_KEY || API_KEY === 'undefined' || API_KEY === '') {
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'error',
                    message: '카카오맵 API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.'
                }));
                return;
            }
            
            // 동적으로 스크립트 로딩
            function loadKakaoScript() {
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = \`https://dapi.kakao.com/v2/maps/sdk.js?appkey=\${API_KEY}&libraries=services,clusterer,drawing&autoload=false\`;
                    
                    script.onload = function() {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'debug',
                            message: '카카오맵 스크립트 로드 성공'
                        }));
                        resolve();
                    };
                    
                    script.onerror = function(error) {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                            type: 'error',
                            message: '카카오맵 스크립트 로드 실패: ' + error
                        }));
                        reject(error);
                    };
                    
                    document.head.appendChild(script);
                });
            }

            let map, marker, geocoder;
            let currentAddress = '';

            function sendDebug(message) {
                console.log('DEBUG:', message);
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'debug',
                    message: message
                }));
            }

            function sendError(message) {
                console.error('ERROR:', message);
                window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'error',
                    message: message
                }));
            }

            function initMap() {
                try {
                    sendDebug('initMap 함수 시작');
                    
                    if (typeof kakao === 'undefined') {
                        sendError('kakao 객체가 정의되지 않았습니다');
                        return;
                    }
                    
                    if (!kakao.maps) {
                        sendError('kakao.maps가 없습니다');
                        return;
                    }

                    sendDebug('kakao.maps 객체 확인됨');

                    const container = document.getElementById('map');
                    const loading = document.getElementById('loading');
                    
                    if (!container) {
                        sendError('map 컨테이너를 찾을 수 없습니다');
                        return;
                    }

                    // 로딩 화면 숨기고 지도 표시
                    loading.style.display = 'none';
                    container.style.display = 'block';

                    sendDebug('지도 컨테이너 확인됨');

                    const options = {
                        center: new kakao.maps.LatLng(${lat}, ${lng}),
                        level: ${level}
                    };
                    
                    sendDebug('지도 옵션 설정 완료');
                    
                    map = new kakao.maps.Map(container, options);
                    sendDebug('지도 객체 생성 완료');
                    
                    geocoder = new kakao.maps.services.Geocoder();
                    sendDebug('지오코더 생성 완료');

                    // 현재 위치 마커 추가
                    const markerPosition = new kakao.maps.LatLng(${lat}, ${lng});
                    marker = new kakao.maps.Marker({
                        position: markerPosition,
                        map: map
                    });
                    sendDebug('마커 생성 완료');

                    // 주소 검색 및 접근성 안내
                    searchAddress(${lat}, ${lng});

                    // 지도 클릭 이벤트 (새 위치로 이동)
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

                    sendDebug('지도 초기화 완전히 완료됨');

                } catch (error) {
                    sendError('지도 초기화 실패: ' + error.message);
                }
            }

            function searchAddress(lat, lng) {
                try {
                    if (!geocoder) {
                        return; // 조용히 무시
                    }

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
                        } else {
                            // 주소 검색 실패는 조용히 처리 (위도/경도는 정상이므로)
                            window.ReactNativeWebView?.postMessage(JSON.stringify({
                                type: 'addressNotFound',
                                lat: lat,
                                lng: lng
                            }));
                        }
                    });
                } catch (error) {
                    // 조용히 무시
                }
            }

            // 페이지 로드 완료 후 스크립트 동적 로딩
            window.addEventListener('load', async function() {
                sendDebug('페이지 로드 완료');
                
                try {
                    // 카카오맵 스크립트 동적 로딩
                    await loadKakaoScript();
                    
                    // 스크립트 로드 완료 후 SDK 확인
                    if (typeof kakao === 'undefined') {
                        sendError('카카오 SDK가 여전히 로드되지 않았습니다');
                        return;
                    }
                    
                    if (!kakao.maps) {
                        sendError('카카오 maps 객체가 없습니다');
                        return;
                    }
                    
                    sendDebug('카카오 SDK 로드 확인됨, 지도 초기화 시작');
                    
                    // autoload=false이므로 수동으로 로드
                    kakao.maps.load(function() {
                        sendDebug('kakao.maps.load 콜백 실행됨');
                        initMap();
                    });
                    
                } catch (error) {
                    sendError('스크립트 로딩 실패: ' + error.message);
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
          console.log('✅ 지도 로드 완료');
          Alert.alert('성공', '지도가 성공적으로 로드되었습니다!');
          AccessibilityInfo.announceForAccessibility(
            '지도가 로드되었습니다. 현재 위치를 확인 중입니다.'
          );
          break;
          
        case 'addressFound':
          console.log('📍 주소:', data.address);
          AccessibilityInfo.announceForAccessibility(
            `현재 위치: ${data.address}`
          );
          break;
          
        case 'locationChanged':
          console.log('📌 위치 변경:', `${data.lat}, ${data.lng}`);
          if (data.address) {
            AccessibilityInfo.announceForAccessibility(
              `새로운 위치: ${data.address}`
            );
          } else {
            AccessibilityInfo.announceForAccessibility(
              '새로운 위치로 이동했습니다'
            );
          }
          break;
          
        case 'error':
          // 주소 검색 실패는 무시하고 다른 중요한 에러만 표시
          if (!data.message.includes('주소 검색 실패')) {
            console.error('❌ 지도 오류:', data.message);
            Alert.alert('지도 오류', data.message);
            AccessibilityInfo.announceForAccessibility(
              '지도에 문제가 발생했습니다'
            );
          }
          break;
          
        case 'addressNotFound':
          // 조용히 무시 (위도/경도는 정상이므로 문제없음)
          break;
          
        // 기타 디버그 메시지들은 콘솔에만 표시하고 Alert 제거
        case 'debug':
          console.log('DEBUG:', data.message);
          break;
          
        case 'sdkError':
          console.error('SDK ERROR:', data.message);
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
        allowsInlineMediaPlaybook={true}
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
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('HTTP 오류:', nativeEvent);
          Alert.alert('HTTP 오류', `HTTP Error: ${nativeEvent.statusCode}`);
        }}
        onLoadStart={() => {/* 조용히 로드 */}}
        onLoadEnd={() => {/* 로드 완료 */}}
        accessible={true}
        accessibilityLabel="카카오 지도"
      />
    </View>
  );
};

export default KakaoMap;