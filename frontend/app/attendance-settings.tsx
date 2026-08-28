import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { PrimaryButton, Card } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { FormInput } from '@/src/forms';

export default function AttendanceSettings() {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ start_time: '09:00', grace_minutes: '10', late_fine_per_day: '100', working_days_per_month: '26' });

  const load = useCallback(async () => {
    try {
      const s = await api.get<any>('/office-settings');
      setF({
        start_time: s.start_time || '09:00',
        grace_minutes: String(s.grace_minutes ?? 10),
        late_fine_per_day: String(s.late_fine_per_day ?? 100),
        working_days_per_month: String(s.working_days_per_month ?? 26),
      });
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api.put('/office-settings', {
        start_time: f.start_time,
        grace_minutes: parseInt(f.grace_minutes || '0', 10),
        late_fine_per_day: parseFloat(f.late_fine_per_day || '0'),
        working_days_per_month: parseInt(f.working_days_per_month || '26', 10),
      });
      setOk('Saved ✓');
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="attendance-settings">
      <ScreenHeader title="Attendance Settings" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Card>
            <Text style={styles.sectionTitle}>Working schedule</Text>
            <FormInput label="Office Start Time (HH:MM, 24h)" value={f.start_time} onChangeText={v => setF(p => ({ ...p, start_time: v }))} placeholder="09:00" testID="in-start" />
            <FormInput label="Grace Minutes" value={f.grace_minutes} onChangeText={v => setF(p => ({ ...p, grace_minutes: v }))} keyboardType="numeric" testID="in-grace" />
            <FormInput label="Working Days / Month" value={f.working_days_per_month} onChangeText={v => setF(p => ({ ...p, working_days_per_month: v }))} keyboardType="numeric" testID="in-wd" />
            <FormInput label="Late Fine per Day (₹)" value={f.late_fine_per_day} onChangeText={v => setF(p => ({ ...p, late_fine_per_day: v }))} keyboardType="numeric" testID="in-fine" />
          </Card>
          {ok ? <Text style={{ color: colors.success, textAlign: 'center', fontWeight: '700' }}>{ok}</Text> : null}
          {err ? <Text style={{ color: colors.error, textAlign: 'center' }}>{err}</Text> : null}
          <PrimaryButton label="Save Settings" onPress={save} loading={busy} testID="save-settings" />
          <Text style={styles.hint}>Note: Individual office locations are managed under More → Offices.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({
  sectionTitle: { fontSize: font.lg, fontWeight: '800', color: colors.onSurface, marginBottom: spacing.sm },
  hint: { color: colors.muted, fontSize: font.sm, textAlign: 'center' },
});
