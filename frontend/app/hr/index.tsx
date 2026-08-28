import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api, captureSelfie, getCurrentLocation, tokenStore } from '@/src/api';
import { Card, EmptyState, ScreenLoader, StatusBadge, PrimaryButton, SecondaryButton, Chip } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';

type Tab = 'attendance' | 'leaves';

export default function HRScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('attendance');
  const [summary, setSummary] = useState<any | null>(null);
  const [leaves, setLeaves] = useState<any[] | null>(null);
  const [punching, setPunching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, l, t] = await Promise.all([
        api.get<any>('/punches/today/summary').catch(() => ({ count: 0, remaining: 10, records: [] })),
        api.get<any[]>('/leaves'),
        tokenStore.get(),
      ]);
      setSummary(s); setLeaves(l); setToken(t);
    } catch { setSummary({ count: 0, remaining: 10, records: [] }); setLeaves([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doPunch = async (type: 'in' | 'out') => {
    setErr(null); setOk(null); setPunching(true);
    try {
      let loc: any = null;
      try { loc = await getCurrentLocation(); } catch (e: any) {
        if (type === 'in') { setErr(e?.message || 'Location required'); setPunching(false); return; }
      }
      const selfie = await captureSelfie();
      if (!selfie) { setErr('Selfie is mandatory for punch. Please try again.'); setPunching(false); return; }
      const rec = await api.createPunch({ type, lat: loc?.lat, lng: loc?.lng, accuracy: loc?.accuracy, selfie });
      setOk(`Punch ${type.toUpperCase()} recorded at ${rec.time}${rec.is_late ? ' • Marked LATE' : ''}${rec.office_name ? ' • ' + rec.office_name : ''}`);
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Punch failed');
    } finally { setPunching(false); }
  };

  const requestLeave = async () => {
    if (!leaveForm.from_date || !leaveForm.to_date) return;
    setLeaveBusy(true);
    try { await api.post('/leaves', leaveForm); setShowForm(false); setLeaveForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' }); await load(); }
    catch {} finally { setLeaveBusy(false); }
  };

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    try { await api.patch(`/leaves/${id}`, { status }); await load(); } catch {}
  };
  const canDecide = user?.role === 'admin' || user?.role === 'manager';

  const records: any[] = summary?.records || [];
  const nextAction: 'in' | 'out' = summary?.last_type === 'in' ? 'out' : 'in';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="hr-screen">
      <ScreenHeader title="HR & Attendance" />
      <View style={styles.tabs}>
        <Pressable testID="tab-attendance" onPress={() => setTab('attendance')} style={[styles.tab, tab === 'attendance' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'attendance' && styles.tabTextActive]}>Attendance</Text>
        </Pressable>
        <Pressable testID="tab-leaves" onPress={() => setTab('leaves')} style={[styles.tab, tab === 'leaves' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'leaves' && styles.tabTextActive]}>Leaves</Text>
        </Pressable>
      </View>

      {tab === 'attendance' ? (
        <View style={{ flex: 1 }}>
          <Card style={{ margin: spacing.lg, marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={styles.muted}>Today • {new Date().toDateString()}</Text>
                <Text style={styles.statValue}>{summary?.count ?? 0} / 10 punches</Text>
                <Text style={styles.muted}>In: {summary?.punches_in ?? 0} • Out: {summary?.punches_out ?? 0} • Late: {summary?.late_count ?? 0}</Text>
              </View>
              <View style={styles.remaining}>
                <Text style={styles.remainingLabel}>Remaining</Text>
                <Text style={styles.remainingVal}>{summary?.remaining ?? 10}</Text>
              </View>
            </View>
          </Card>

          <View style={styles.actionRow}>
            {nextAction === 'in' ? (
              <PrimaryButton testID="punch-in-btn" label="Punch In (selfie + geo)" icon="log-in" onPress={() => doPunch('in')} loading={punching} style={{ flex: 1 }} />
            ) : (
              <SecondaryButton testID="punch-out-btn" label="Punch Out (selfie)" icon="log-out" onPress={() => doPunch('out')} style={{ flex: 1 }} />
            )}
          </View>
          {err ? <Text style={styles.err} testID="punch-err">{err}</Text> : null}
          {ok ? <Text style={styles.ok} testID="punch-ok">{ok}</Text> : null}
          <Text style={styles.hint}>Face selfie is mandatory. Punch-in requires you to be within your office geofence.</Text>

          {records.length === 0 ? (
            <EmptyState testID="attendance-empty" icon="calendar-outline" title="No punches today" subtitle="Tap Punch In to start your day" />
          ) : (
            <FlatList
              data={records}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
              renderItem={({ item }) => (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    {item.selfie_path && token ? (
                      <Image source={{ uri: `${api.base}/api/files/${item.selfie_path}?token=${encodeURIComponent(token)}` }} style={styles.selfie} />
                    ) : (
                      <View style={[styles.selfie, { backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="camera" size={20} color={colors.muted} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.type === 'in' ? 'IN' : 'OUT'} • {item.time}</Text>
                      {item.office_name ? <Text style={styles.muted}>{item.office_name}</Text> : null}
                      {item.distance_m != null ? <Text style={styles.muted}>{Math.round(item.distance_m)} m from office</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {item.is_late ? <View style={styles.lateTag}><Text style={styles.lateText}>LATE</Text></View> : null}
                      {item.within_geofence ? <Ionicons name="location" size={16} color={colors.success} /> : <Ionicons name="location-outline" size={16} color={colors.warning} />}
                    </View>
                  </View>
                </Card>
              )}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.actionRow}>
            <PrimaryButton testID="request-leave-btn" label={showForm ? 'Close' : 'Request Leave'} icon="add" onPress={() => setShowForm(v => !v)} />
          </View>
          {showForm && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Card style={{ margin: spacing.lg }}>
                <Text style={styles.formLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                  {['casual', 'sick', 'earned'].map(t => (
                    <Chip key={t} label={t} selected={leaveForm.leave_type === t} onPress={() => setLeaveForm(p => ({ ...p, leave_type: t }))} testID={`leave-type-${t}`} />
                  ))}
                </ScrollView>
                <Text style={styles.formLabel}>From (YYYY-MM-DD)</Text>
                <TextInput testID="leave-from" style={styles.input} value={leaveForm.from_date} onChangeText={(v) => setLeaveForm(p => ({ ...p, from_date: v }))} placeholder="2026-05-10" />
                <Text style={styles.formLabel}>To (YYYY-MM-DD)</Text>
                <TextInput testID="leave-to" style={styles.input} value={leaveForm.to_date} onChangeText={(v) => setLeaveForm(p => ({ ...p, to_date: v }))} placeholder="2026-05-12" />
                <Text style={styles.formLabel}>Reason</Text>
                <TextInput testID="leave-reason" style={[styles.input, { minHeight: 60 }]} multiline value={leaveForm.reason} onChangeText={(v) => setLeaveForm(p => ({ ...p, reason: v }))} placeholder="Reason for leave" />
                <PrimaryButton label="Submit request" onPress={requestLeave} loading={leaveBusy} testID="submit-leave" style={{ marginTop: spacing.md }} />
              </Card>
            </KeyboardAvoidingView>
          )}
          {leaves === null ? <ScreenLoader /> : leaves.length === 0 ? (
            <EmptyState testID="leaves-empty" icon="airplane-outline" title="No leave requests" subtitle="Submit your first leave request" />
          ) : (
            <FlatList
              data={leaves}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
              renderItem={({ item }) => (
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Text style={styles.itemTitle}>{item.user_name} • {item.leave_type}</Text>
                      <Text style={styles.muted}>{item.from_date} → {item.to_date}</Text>
                      {item.reason ? <Text style={styles.muted}>{item.reason}</Text> : null}
                    </View>
                    <StatusBadge status={item.status} />
                  </View>
                  {canDecide && item.status === 'pending' && (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <SecondaryButton label="Reject" onPress={() => decide(item.id, 'rejected')} style={{ flex: 1 }} testID={`reject-${item.id}`} />
                      <PrimaryButton label="Approve" onPress={() => decide(item.id, 'approved')} style={{ flex: 1 }} testID={`approve-${item.id}`} />
                    </View>
                  )}
                </Card>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, margin: spacing.lg, marginBottom: 0, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.brandPrimary },
  actionRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.sm },
  itemTitle: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  statValue: { fontSize: font.xxl, fontWeight: '800', color: colors.onSurface, marginTop: 4 },
  remaining: { backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, minWidth: 80, alignItems: 'center' },
  remainingLabel: { color: colors.onBrandTertiary, fontSize: font.sm, fontWeight: '600' },
  remainingVal: { color: colors.onBrandTertiary, fontSize: font.xxl, fontWeight: '800' },
  err: { color: colors.error, textAlign: 'center', paddingHorizontal: spacing.lg, marginTop: 4 },
  ok: { color: colors.success, textAlign: 'center', fontWeight: '700', paddingHorizontal: spacing.lg, marginTop: 4 },
  hint: { color: colors.muted, fontSize: font.sm, textAlign: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  selfie: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary },
  lateTag: { backgroundColor: colors.error + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  lateText: { color: colors.error, fontSize: 10, fontWeight: '800' },
  formLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: font.base, backgroundColor: colors.surface, marginTop: 4 },
});
