import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Image, Modal, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, roleColor } from '@/src/theme';
import { api, tokenStore } from '@/src/api';
import { Avatar, Card, EmptyState, ScreenLoader, PrimaryButton } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';

export default function EmployeesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[] | null>(null);
  const [offices, setOffices] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [pick, setPick] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [items, offs, t] = await Promise.all([api.get<any[]>('/employees'), api.get<any[]>('/offices').catch(() => []), tokenStore.get()]);
      setList(items); setOffices(offs); setToken(t);
    } catch { setList([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const assign = async (officeId: string | null) => {
    if (!pick) return;
    setBusy(true);
    try { await api.patch(`/employees/${pick.id}`, { office_id: officeId }); setPick(null); await load(); }
    catch {} finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="employees-screen">
      <ScreenHeader title="Employees" right={canManage ? (
        <Pressable testID="add-employee" onPress={() => router.push('/employees/new' as any)} style={styles.add}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="employees-empty" icon="people-outline" title="No employees" subtitle="Add employees to manage your team" actionLabel={canManage ? 'Add Employee' : undefined} onAction={canManage ? () => router.push('/employees/new' as any) : undefined} />
      ) : (
        <FlatList
          testID="employee-list"
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const office = offices.find(o => o.id === item.office_id);
            return (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  {item.photo_path && token ? (
                    <Image source={{ uri: `${api.base}/api/files/${item.photo_path}?token=${encodeURIComponent(token)}` }} style={styles.photo} />
                  ) : (
                    <Avatar name={item.name} size={48} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.employee_code ? <Text style={styles.code}>{item.employee_code}</Text> : null}
                    <Text style={styles.muted}>{item.designation || '-'} • {item.email}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="location" size={12} color={office ? colors.success : colors.warning} />
                      <Text style={[styles.muted, { marginTop: 0, color: office ? colors.success : colors.warning }]}>{office?.name || 'No office assigned'}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor(item.role) + '20' }]}>
                      <Text style={{ color: roleColor(item.role), fontWeight: '800', fontSize: 10 }}>{(item.role || 'employee').toUpperCase()}</Text>
                    </View>
                    {canManage ? (
                      <Pressable testID={`assign-${item.id}`} onPress={() => setPick(item)} style={styles.assignBtn}>
                        <Ionicons name="business" size={12} color={colors.brandPrimary} />
                        <Text style={styles.assignText}>{office ? 'Change' : 'Assign'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}

      <Modal visible={!!pick} transparent animationType="slide" onRequestClose={() => setPick(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign office</Text>
              <Pressable onPress={() => setPick(null)} hitSlop={10}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={[styles.muted, { paddingHorizontal: spacing.lg }]}>Employee: {pick?.name}</Text>
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
              {offices.length === 0 ? (
                <Text style={{ color: colors.error, textAlign: 'center' }}>No offices yet. Create one from More → Offices.</Text>
              ) : offices.map(o => (
                <Pressable key={o.id} testID={`pick-office-${o.id}`} onPress={() => assign(o.id)} style={[styles.officeRow, pick?.office_id === o.id && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                  <View style={styles.officeIcon}><Ionicons name="business" size={18} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: colors.onSurface }}>{o.name}</Text>
                    <Text style={styles.muted}>{o.address || '-'} • {o.radius_m} m</Text>
                  </View>
                  {pick?.office_id === o.id ? <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
              {pick?.office_id ? (
                <PrimaryButton label="Unassign office" onPress={() => assign(null as any)} loading={busy} style={{ marginTop: spacing.md, backgroundColor: colors.error }} />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  code: { color: colors.brandPrimary, fontWeight: '700', fontSize: font.sm, marginTop: 2 },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  assignText: { color: colors.brandPrimary, fontSize: 11, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.xl, fontWeight: '800', color: colors.onSurface },
  officeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  officeIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
});
