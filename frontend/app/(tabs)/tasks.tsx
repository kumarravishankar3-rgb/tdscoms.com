import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, radius, font } from '@/src/theme';
import { api } from '@/src/api';
import { Avatar, Card, Chip, EmptyState, ScreenLoader, StatusBadge } from '@/src/ui';
import { useAuth } from '@/src/AuthContext';

const STATUSES = ['all', 'todo', 'doing', 'done'];

export default function TasksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const list = await api.get<any[]>('/tasks'); setTasks(list); } catch { setTasks([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    if (!tasks) return null;
    if (filter === 'all') return tasks;
    return tasks.filter(t => t.status === filter);
  }, [tasks, filter]);

  const cycle = async (task: any) => {
    const next = task.status === 'todo' ? 'doing' : task.status === 'doing' ? 'done' : 'todo';
    try {
      const updated = await api.patch<any>(`/tasks/${task.id}`, { status: next });
      setTasks(prev => (prev || []).map(t => t.id === task.id ? updated : t));
    } catch {}
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="tasks-screen">
      <View style={styles.header}>
        <Text style={styles.h1}>Tasks</Text>
        <Pressable testID="add-task" style={styles.addBtn} onPress={() => router.push('/tasks/new' as any)}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {STATUSES.map(s => (
          <Chip key={s} label={s === 'all' ? 'All' : s.toUpperCase()} selected={filter === s} onPress={() => setFilter(s)} testID={`filter-${s}`} />
        ))}
      </ScrollView>

      {filtered === null ? <ScreenLoader /> : filtered.length === 0 ? (
        <EmptyState testID="tasks-empty" icon="checkmark-done-outline" title="All caught up!" subtitle="No tasks match this filter" actionLabel="Create Task" onAction={() => router.push('/tasks/new' as any)} />
      ) : (
        <FlatList
          testID="task-list"
          data={filtered}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Pressable onPress={() => cycle(item)} testID={`toggle-${item.id}`} style={[styles.check, item.status === 'done' && { backgroundColor: colors.success, borderColor: colors.success }]}>
                  {item.status === 'done' ? <Ionicons name="checkmark" size={16} color={colors.onSuccess} /> : item.status === 'doing' ? <View style={styles.dot} /> : null}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, item.status === 'done' && { textDecorationLine: 'line-through', color: colors.muted }]}>{item.title}</Text>
                  {item.assignee_name ? <Text style={styles.muted}>Assigned to {item.assignee_name}</Text> : null}
                  {item.due_date ? <Text style={styles.muted}>Due {item.due_date}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={[styles.priority, { backgroundColor: item.priority === 'high' ? colors.error + '20' : item.priority === 'low' ? colors.success + '20' : colors.warning + '20' }]}>
                    <Text style={{ color: item.priority === 'high' ? colors.error : item.priority === 'low' ? colors.success : colors.warning, fontSize: 10, fontWeight: '800' }}>{(item.priority || 'medium').toUpperCase()}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  h1: { fontSize: font.display, fontWeight: '800', color: colors.onSurface },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm, height: 56, alignItems: 'center' },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  itemTitle: { fontSize: font.lg, fontWeight: '700', color: colors.onSurface },
  muted: { color: colors.muted, fontSize: font.sm, marginTop: 2 },
  priority: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
});
