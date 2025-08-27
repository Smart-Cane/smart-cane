import { openKakaoNavi } from '@/src/lib/kakaonavi';
import React, { useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';

export default function Channel3() {
  const [lat, setLat] = useState('37.402056');
  const [lng, setLng] = useState('127.108212');
  const [name, setName] = useState('목적지');

  const onPress = async () => {
    const y = Number(lat), x = Number(lng);
    if (Number.isNaN(y) || Number.isNaN(x)) { Alert.alert('좌표 오류', 'lat/lng 숫자를 확인하세요.'); return; }
    try { await openKakaoNavi(y, x, { name, coordType: 'wgs84' /*, rpoption: 1*/ }); }
    catch (e:any) { Alert.alert('실행 실패', String(e?.message ?? e)); }
  };

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Text style={{ fontWeight: '600', marginBottom: 8 }}>카카오내비 딥링크</Text>
      <TextInput style={{ borderWidth:1,padding:8,marginVertical:6 }} value={lat} onChangeText={setLat} placeholder="lat" keyboardType="decimal-pad" />
      <TextInput style={{ borderWidth:1,padding:8,marginVertical:6 }} value={lng} onChangeText={setLng} placeholder="lng" keyboardType="decimal-pad" />
      <TextInput style={{ borderWidth:1,padding:8,marginVertical:6 }} value={name} onChangeText={setName} placeholder="목적지명" />
      <Button title="카카오내비 실행" onPress={onPress} />
    </View>
  );
}
