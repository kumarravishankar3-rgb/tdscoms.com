import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font, roleColor } from '@/src/theme';
import { api } from '@/src/api';
import { Avatar, Card, EmptyState, ScreenLoader } from '@/src/ui';
import { ScreenHeader } from '@/src/ScreenHeader';
import { useAuth } from '@/src/AuthContext';

export default function EmployeesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [list, setList] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.get<any[]>('/employees')); } catch { setList([]); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canAdd = user?.role === 'admin' || user?.role === 'manager';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="employees-screen">
      <ScreenHeader title="Employees" right={canAdd ? (
        <Pressable testID="add-employee" onPress={() => router.push('/employees/new' as any)} style={styles.add}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      ) : null} />
      {list === null ? <ScreenLoader /> : list.length === 0 ? (
        <EmptyState testID="employees-empty" icon="people-outline" title="No employees" subtitle="Add employees to manage your team" actionLabel={canAdd ? 'Add Employee' : undefined} onAction={canAdd ? () => router.push('/employees/new' as any) : undefined} />
      ) : (
        <FlatList
          testID="employee-list"
          data={list}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Avatar name={item.name} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.muted}>{item.designation || '-'} • {item.department || '-'}</Text>
                  <Text style={styles.muted}>{item.email}</Text>
                </View>
                <View style={[styles.roleBadge, { backgroundColor: roleColor(item.role) + '20' }]}>
                  <Text style={{ color: roleColor(item.role), fontWeight: '800', fontSize: 10 }}>{(item.role || 'employee').toUpperCase()}</Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  add: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
});
