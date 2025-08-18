// app/(tabs)/channel1.tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';

export default function Channel1() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) setErr(error.message);
      else setRows(data);
    })();
  }, []);

  if (err) return <View><Text>Error: {err}</Text></View>;
  if (!rows) return <View><Text>Loading…</Text></View>;
  return (
    <View>{rows.map((r, i) => <Text key={i}>{JSON.stringify(r)}</Text>)}</View>
  );
}
