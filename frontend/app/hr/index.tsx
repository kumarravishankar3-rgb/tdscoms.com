import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Card, EmptyState, ScreenLoader, StatusBadge, PrimaryButton, SecondaryButton, Chip } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';

type Tab = 'attendance' | 'leaves';

export default function HRScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('attendance');
  const [attendance, setAttendance] = useState<any[] | null>(null);
  const [leaves, setLeaves] = useState<any[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api.get<any[]>('/attendance'), api.get<any[]>('/leaves')]);
      setAttendance(a); setLeaves(l);
    } catch { setAttendance([]); setLeaves([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = new Date().toISOString().slice(0, 10);
  const nowTime = () => new Date().toTimeString().slice(0, 5);

  const checkIn = async () => {
    setChecking(true);
    try {
      await api.post('/attendance', { date: today, check_in: nowTime(), status: 'present' });
      await load();
    } catch {} finally { setChecking(false); }
  };
  const checkOut = async () => {
    setChecking(true);
    try {
      await api.post('/attendance', { date: today, check_out: nowTime(), status: 'present' });
      await load();
    } catch {} finally { setChecking(false); }
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
          <View style={styles.actionRow}>
            <PrimaryButton testID="checkin-btn" label="Check In" onPress={checkIn} loading={checking} icon="log-in" style={{ flex: 1 }} />
            <SecondaryButton testID="checkout-btn" label="Check Out" onPress={checkOut} icon="log-out" style={{ flex: 1 }} />
          </View>
          {attendance === null ? <ScreenLoader /> : attendance.length === 0 ? (
            <EmptyState testID="attendance-empty" icon="calendar-outline" title="No attendance records" subtitle="Tap Check In to mark attendance" />
          ) : (
            <FlatList
              data={attendance}
              keyExtractor={i => i.id}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
              renderItem={({ item }) => (
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.item}>{item.user_name} • {item.date}</Text>
                      <Text style={styles.muted}>In: {item.check_in || '-'}  Out: {item.check_out || '-'}</Text>
                    </View>
                    <StatusBadge status={item.status} />
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
                <TextInput testID="leave-from" style={styles.input} value={leaveForm.from_date} onChangeText={(v) => setLeaveForm(p => ({ ...p, from_date: v }))} placeholder="2025-05-10" />
                <Text style={styles.formLabel}>To (YYYY-MM-DD)</Text>
                <TextInput testID="leave-to" style={styles.input} value={leaveForm.to_date} onChangeText={(v) => setLeaveForm(p => ({ ...p, to_date: v }))} placeholder="2025-05-12" />
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
                      <Text style={styles.item}>{item.user_name} • {item.leave_type}</Text>
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
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, margin: spacing.lg, padding: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.brandPrimary },
  actionRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  item: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  formLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: font.base, backgroundColor: colors.surface, marginTop: 4 },
});
